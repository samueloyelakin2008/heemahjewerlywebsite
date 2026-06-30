/**
 * Generic exponential-backoff retry helper for outgoing API calls.
 *
 * Only retries TRANSIENT failures:
 *  - network errors / timeouts (no response at all)
 *  - 5xx responses (the upstream is having a bad time, not us)
 *  - 429 responses (we're being rate-limited — back off and retry)
 *
 * Deliberately does NOT retry 4xx client errors (400, 401, 404, etc.) —
 * those mean the request itself was wrong (bad reference, invalid key,
 * malformed payload), and retrying it just delays the same failure
 * three times instead of once, while also masking a real bug.
 *
 * Delay grows exponentially with jitter (so many concurrent requests
 * don't all retry in lockstep and hammer the upstream at the same
 * instant) and honors a `Retry-After` header when the upstream sends one.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultIsRetryable(err) {
  if (!err.response) return true; // network error / timeout
  const status = err.response.status;
  return status === 429 || (status >= 500 && status < 600);
}

function getRetryAfterMs(err) {
  const header = err.response && err.response.headers && err.response.headers["retry-after"];
  if (!header) return null;
  const seconds = parseInt(header, 10);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

/**
 * @param {Function} fn - async function to attempt; receives the attempt index (0-based)
 * @param {Object} options
 * @param {number} options.retries - max retry attempts AFTER the first try (default 2 → 3 total attempts)
 * @param {number} options.baseDelayMs - base delay for exponential growth
 * @param {number} options.maxDelayMs - cap on any single delay
 * @param {Function} options.isRetryable - (err) => boolean
 * @param {Function} options.onRetry - (err, attemptNumber, delayMs) => void, for logging
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    retries = 2,
    baseDelayMs = 400,
    maxDelayMs = 4000,
    isRetryable = defaultIsRetryable,
    onRetry = () => {},
  } = options;

  let attempt = 0;

  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) {
        throw err;
      }

      const retryAfterMs = getRetryAfterMs(err);
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      // Jitter: 50%-100% of the exponential ceiling, so a burst of
      // simultaneous requests fans out instead of retrying in unison.
      const jittered = exponential * (0.5 + Math.random() * 0.5);
      const delay = retryAfterMs != null ? Math.max(retryAfterMs, jittered) : jittered;

      onRetry(err, attempt, delay);
      await sleep(delay);
    }
  }
}

module.exports = { retryWithBackoff, defaultIsRetryable };

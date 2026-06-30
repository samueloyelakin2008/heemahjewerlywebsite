/**
 * Factory for an exponential-backoff IP lockout tracker.
 *
 * Each consecutive FAILURE from the same IP costs more time than the
 * last (1s -> 2s -> 4s -> ... capped at maxDelayMs), independent of —
 * and layered on top of — any flat rate limiter. A flat limiter caps
 * total request volume; this specifically punishes a *string of
 * failures*, which is the actual signature of brute-forcing a login,
 * probing payment references, or guessing admin tokens. A real user
 * who fumbles once or twice barely notices; an automated probe gets
 * exponentially slower with every attempt.
 *
 * Each call to createIpBackoffTracker() gets its own isolated state —
 * use a separate tracker per concern (e.g. one for payment failures,
 * one for admin-auth failures) so they don't interfere with each other.
 *
 * NOTE: state is in-memory, scoped to a single process. Fine for one
 * server instance; for multi-instance deployments, swap the Map for a
 * shared store (Redis) so the lockout holds across instances.
 */
function createIpBackoffTracker(options = {}) {
  const {
    baseDelayMs = 1000,
    maxDelayMs = 5 * 60 * 1000, // 5 minutes
    resetAfterMs = 30 * 60 * 1000, // forget old failures after 30 min of good behavior
    lockedMessage = "Too many failed attempts from this device — please wait a moment before trying again.",
  } = options;

  const failuresByIp = new Map(); // ip -> { count, lockedUntil, lastFailureAt }

  function getState(ip) {
    return failuresByIp.get(ip) || { count: 0, lockedUntil: 0, lastFailureAt: 0 };
  }

  function recordFailure(ip) {
    const now = Date.now();
    let state = getState(ip);

    // Don't let ancient history compound into today's lockout.
    if (now - state.lastFailureAt > resetAfterMs) {
      state = { count: 0, lockedUntil: 0, lastFailureAt: 0 };
    }

    state.count += 1;
    state.lastFailureAt = now;
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (state.count - 1));
    state.lockedUntil = now + delay;

    failuresByIp.set(ip, state);
    return delay;
  }

  function recordSuccess(ip) {
    failuresByIp.delete(ip);
  }

  /**
   * Express middleware: blocks the request with 429 if this IP is
   * currently locked out from a prior run of failures.
   */
  function guard(req, res, next) {
    const ip = req.ip;
    const state = getState(ip);
    const now = Date.now();

    if (state.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((state.lockedUntil - now) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ success: false, message: lockedMessage });
    }

    next();
  }

  return { guard, recordFailure, recordSuccess };
}

module.exports = { createIpBackoffTracker };

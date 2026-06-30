/**
 * Payment-specific instance of the shared exponential-backoff IP
 * tracker (see ../utils/ipBackoffTracker.js for how/why this works).
 *
 * Applied to /verify-payment and /initiate-payment — repeated failures
 * there look like reference-enumeration or card-testing probing, so
 * each consecutive failure from the same IP costs more time than the
 * last.
 */
const { createIpBackoffTracker } = require("../utils/ipBackoffTracker");

const tracker = createIpBackoffTracker({
  lockedMessage: "Too many failed attempts from this device — please wait a moment before trying again.",
});

module.exports = {
  paymentAbuseGuard: tracker.guard,
  recordFailure: tracker.recordFailure,
  recordSuccess: tracker.recordSuccess,
};

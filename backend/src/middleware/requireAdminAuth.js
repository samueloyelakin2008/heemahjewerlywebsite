/**
 * requireAdminAuth — gatekeeper for every /api/admin/* route.
 *
 * Defense in depth, three layers:
 *   1. The request must carry a valid, unexpired, unrevoked Firebase
 *      Auth ID token (proves "this is a real signed-in Firebase user
 *      right now", not just someone who once knew a password).
 *   2. That user's email must be in the ADMIN_EMAILS allowlist (proves
 *      "this specific person is allowed to manage products", since
 *      Firebase Auth alone doesn't know about your business rules).
 *   3. Repeated failures from the same IP get exponentially slower
 *      (same mechanism as the payment abuse guard) — this specifically
 *      slows down anyone trying to brute-force or guess their way past
 *      step 1 or 2.
 *
 * On success, attaches `req.admin = { uid, email }` for downstream
 * handlers (e.g. to log who created/edited/deleted a product).
 */
const { verifyIdToken } = require("../config/firebaseAdmin");
const { createIpBackoffTracker } = require("../utils/ipBackoffTracker");

const tracker = createIpBackoffTracker({
  baseDelayMs: 2000, // admin-auth failures start at a stiffer 2s than payment failures
  maxDelayMs: 10 * 60 * 1000, // cap at 10 minutes
  lockedMessage: "Too many failed sign-in attempts from this device — please wait before trying again.",
});

function getAdminAllowlist() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdminAuth(req, res, next) {
  // Layer 3 check happens first — don't even attempt to verify a token
  // for an IP that's currently locked out.
  const ip = req.ip;
  const blocked = tracker.guard;

  return blocked(req, res, async () => {
    try {
      const authHeader = req.headers.authorization || "";
      const match = authHeader.match(/^Bearer (.+)$/);

      if (!match) {
        tracker.recordFailure(ip);
        return res.status(401).json({ success: false, message: "Missing or malformed authorization header." });
      }

      const idToken = match[1];
      const decoded = await verifyIdToken(idToken);

      const allowlist = getAdminAllowlist();
      const email = (decoded.email || "").toLowerCase();

      if (!decoded.email_verified) {
        tracker.recordFailure(ip);
        return res.status(403).json({ success: false, message: "Please verify your email before accessing the admin panel." });
      }

      if (allowlist.length === 0 || !allowlist.includes(email)) {
        tracker.recordFailure(ip);
        return res.status(403).json({ success: false, message: "This account isn't authorized for admin access." });
      }

      tracker.recordSuccess(ip);
      req.admin = { uid: decoded.uid, email };
      next();
    } catch (err) {
      tracker.recordFailure(ip);
      console.error("[requireAdminAuth] token verification failed:", err.message);
      return res.status(401).json({ success: false, message: "Your session has expired or is invalid. Please sign in again." });
    }
  });
}

module.exports = { requireAdminAuth };

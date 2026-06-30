const axios = require("axios");
const { retryWithBackoff } = require("../utils/retryWithBackoff");

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function client() {
  return axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    // Shorter per-attempt timeout than before (15s -> 8s) because a
    // single call can now retry up to twice with backoff. Worst case
    // (3 attempts all timing out) is still bounded to a sane ceiling
    // instead of stacking three 15s timeouts.
    timeout: 8000,
  });
}

function logRetry(label) {
  return (err, attempt, delayMs) => {
    console.warn(
      `[paystack] ${label} retry ${attempt} in ${Math.round(delayMs)}ms — ${err.response ? `HTTP ${err.response.status}` : err.message}`
    );
  };
}

/**
 * Initialize a transaction with Paystack. Amount must be in kobo.
 * Returns the authorization_url + access_code + reference.
 *
 * authorization_url is Paystack's hosted checkout page — the frontend
 * does a full-page redirect (window.location.href) to this URL instead
 * of launching the Inline popup. callbackUrl tells Paystack where to
 * send the customer back to once they finish (or cancel) paying.
 */
async function initializeTransaction({ email, amountKobo, reference, metadata, callbackUrl }) {
  return retryWithBackoff(
    async () => {
      const { data } = await client().post("/transaction/initialize", {
        email,
        amount: amountKobo,
        reference,
        metadata,
        callback_url: callbackUrl,
        channels: ["card", "bank", "ussd", "bank_transfer", "mobile_money"],
      });
      return data.data; // { authorization_url, access_code, reference }
    },
    { retries: 2, baseDelayMs: 400, maxDelayMs: 4000, onRetry: logRetry("initializeTransaction") }
  );
}

/**
 * Verify a transaction server-side. This is the ONLY source of truth
 * for whether a payment actually succeeded — never trust a "success"
 * message coming from the browser, since that can be faked by anyone
 * who opens devtools and calls the success callback manually.
 */
async function verifyTransaction(reference) {
  return retryWithBackoff(
    async () => {
      const { data } = await client().get(`/transaction/verify/${encodeURIComponent(reference)}`);
      return data.data; // includes status, amount, currency, customer, metadata, etc.
    },
    { retries: 2, baseDelayMs: 400, maxDelayMs: 4000, onRetry: logRetry("verifyTransaction") }
  );
}

module.exports = { initializeTransaction, verifyTransaction };

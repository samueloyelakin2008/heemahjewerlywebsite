const express = require("express");
const crypto  = require("crypto");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

const { priceCart }                                        = require("../services/productCatalog");
const paystack                                             = require("../services/paystackService");
const { logSaleToSheet }                                   = require("../services/googleSheetsService");
const { sendCustomerReceipt, sendAdminNotification }       = require("../services/emailService");
const { notifyAdminWhatsApp }                              = require("../services/whatsappService");
const orderStore                                           = require("../services/orderStore");
const { validateInitiatePayment, validateVerifyPayment, handleValidationErrors } =
  require("../middleware/validate");
const { paymentAbuseGuard, recordFailure, recordSuccess }  =
  require("../middleware/paymentAbuseGuard");

// ─── CORS helper ──────────────────────────────────────────────────────────────
// Allows the storefront (any origin in development, locked to your domain in
// production) to call these API routes from the browser without being blocked.
// Set the ALLOWED_ORIGIN env var to your live frontend URL in production,
// e.g. "https://heemahjewelry.com". Leave it unset locally for open access.
// ──────────────────────────────────────────────────────────────────────────────
function corsMiddleware(req, res, next) {
  var allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin",  allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Pre-flight request — browsers send OPTIONS before cross-origin POSTs
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
}

// Apply CORS to every route in this router
router.use(corsMiddleware);

/**
 * POST /api/cart-checkout
 * Re-prices the cart server-side and returns a trusted breakdown.
 */
router.post("/cart-checkout", async (req, res) => {
  try {
    const { cart } = req.body;
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ success: false, message: "Your cart is empty." });
    }
    const priced = await priceCart(cart);
    return res.json({ success: true, ...priced });
  } catch (err) {
    console.error("[cart-checkout] error:", err.message);
    return res.status(400).json({
      success: false,
      message: "We couldn't price one or more items in your cart.",
    });
  }
});

/**
 * POST /api/initiate-payment
 * Validates, re-prices, creates a Paystack transaction, and returns
 * the access_code + reference the frontend needs to open the popup.
 */
router.post(
  "/initiate-payment",
  paymentAbuseGuard,
  validateInitiatePayment,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { customer, cart } = req.body;

      let priced;
      try {
        priced = await priceCart(cart);
      } catch (err) {
        console.error("[initiate-payment] priceCart error:", err.message);
        return res.status(400).json({
          success: false,
          message: "One or more items in your cart are no longer available.",
        });
      }

      const reference = `HJ-${Date.now()}-${uuidv4().slice(0, 8)}`;

      orderStore.saveOrder(reference, {
        status: "pending",
        customer,
        lineItems: priced.lineItems,
        total: priced.total,
      });

      // Where Paystack sends the customer back to after they pay (or
      // cancel) on the hosted checkout page. Set FRONTEND_BASE_URL in
      // your .env — e.g. http://localhost:5000 for local dev, or your
      // live domain (https://heemahjewelry.com) in production.
      const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "https://heemahjewerlywebsite-production.up.railway.app/";
      const callbackUrl = `${frontendBaseUrl}/checkout-complete.html?reference=${reference}`;

      let transaction;
      try {
        transaction = await paystack.initializeTransaction({
          email:       customer.email,
          amountKobo:  Math.round(priced.total * 100),
          reference,
          callbackUrl,
          metadata: {
            orderId:      reference,
            customerName: customer.fullName,
            phone:        customer.phone,
            whatsapp:     customer.whatsapp,
            address:      customer.address,
          },
        });
      } catch (err) {
        console.error("[initiate-payment] Paystack init error:", err.message);
        recordFailure(req.ip);
        return res.status(502).json({
          success: false,
          message: "We couldn't connect to the payment provider. Please try again shortly.",
        });
      }

      recordSuccess(req.ip);

      return res.json({
        success:          true,
        reference,
        accessCode:       transaction.access_code,
        authorizationUrl: transaction.authorization_url,
        publicKey:        process.env.PAYSTACK_PUBLIC_KEY,
        amount:           priced.total,
      });
    } catch (err) {
      console.error("[initiate-payment] unexpected error:", err.message);
      recordFailure(req.ip);
      return res.status(502).json({
        success: false,
        message: "We couldn't start your payment right now. Please try again shortly.",
      });
    }
  }
);

/**
 * Shared finalize logic — used by /verify-payment and /webhook.
 * Idempotent: skips re-sending receipts if already marked "paid".
 */
async function finalizeOrderIfPaid(verifiedTransaction) {
  const reference = verifiedTransaction.reference;
  const existing  = orderStore.getOrder(reference);

  if (existing && existing.status === "paid") {
    return { alreadyProcessed: true, order: existing };
  }

  if (verifiedTransaction.status !== "success") {
    orderStore.saveOrder(reference, { status: "failed" });
    return { alreadyProcessed: false, paid: false };
  }

  const order = existing || {
    customer:  verifiedTransaction.metadata || {},
    lineItems: [],
    total:     verifiedTransaction.amount / 100,
  };

  orderStore.saveOrder(reference, { status: "paid" });

  const customerName  = order.customer.fullName  || verifiedTransaction.metadata?.customerName || "Customer";
  const customerEmail = order.customer.email     || verifiedTransaction.customer?.email;

  const results = await Promise.allSettled([
    sendCustomerReceipt({
      to: customerEmail, customerName, orderId: reference, reference,
      lineItems: order.lineItems, total: order.total,
    }),
    sendAdminNotification({
      orderId: reference, customerName, customerEmail,
      customerPhone: order.customer.phone, address: order.customer.address,
      reference, lineItems: order.lineItems, total: order.total,
    }),
    notifyAdminWhatsApp(
      `🔔 New paid order ${reference}\nCustomer: ${customerName}\nTotal: ₦${order.total.toLocaleString("en-NG")}`
    ),
    logSaleToSheet({
      orderId: reference, reference, customerName, customerEmail,
      customerPhone: order.customer.phone, whatsapp: order.customer.whatsapp,
      address: order.customer.address, items: order.lineItems,
      total: order.total, date: new Date().toISOString(),
    }),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`[finalizeOrder] step ${i} failed:`, r.reason);
  });

  return { alreadyProcessed: false, paid: true, order };
}

/**
 * POST /api/verify-payment
 * Called by the frontend after the Paystack popup closes.
 */
router.post(
  "/verify-payment",
  paymentAbuseGuard,
  validateVerifyPayment,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reference } = req.body;
      const verified = await paystack.verifyTransaction(reference);

      if (verified.status !== "success") {
        orderStore.saveOrder(reference, { status: "failed" });
        recordFailure(req.ip);
        return res.status(402).json({
          success: false,
          message: "Payment was not successful. You can retry checkout.",
        });
      }

      recordSuccess(req.ip);
      const result = await finalizeOrderIfPaid(verified);
      return res.json({
        success:          true,
        message:          "Payment confirmed — thank you for your order!",
        orderId:          reference,
        alreadyProcessed: result.alreadyProcessed,
      });
    } catch (err) {
      console.error("[verify-payment] error:", err.message);
      recordFailure(req.ip);
      return res.status(502).json({
        success: false,
        message: "We couldn't confirm your payment right now. If you were charged, contact support with your reference.",
      });
    }
  }
);

/**
 * POST /api/webhook
 * Paystack server-to-server confirmation. Verifies the HMAC signature
 * before trusting anything in the payload.
 */
router.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const rawBody   = req.rawBody; // Buffer set by express.raw() in server.js

    const expectedSignature = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    if (!signature || signature !== expectedSignature) {
      console.warn("[webhook] Invalid Paystack signature — ignoring.");
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(rawBody.toString("utf-8"));

    // Acknowledge immediately so Paystack doesn't retry
    res.sendStatus(200);

    if (event.event === "charge.success") {
      const verified = await paystack.verifyTransaction(event.data.reference);
      await finalizeOrderIfPaid(verified);
    }
  } catch (err) {
    console.error("[webhook] error:", err.message);
    if (!res.headersSent) res.sendStatus(500);
  }
});

module.exports = router;

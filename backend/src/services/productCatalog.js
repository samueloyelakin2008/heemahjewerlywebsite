/**
 * PRODUCT CATALOG — pricing layer on top of the Firestore-backed
 * productsRepository.
 *
 * SECURITY NOTE: never trust a price sent by the browser. A user can
 * open devtools and edit localStorage or the network request to claim
 * a ₦5,000 tennis bracelet costs ₦1. priceCart() below looks up the
 * REAL price for each product id from the repository (which itself
 * reads from Firestore, kept in sync with whatever the admin has
 * published) — the cart payload from the frontend is only ever used
 * to identify *which* product and *how many*, never the price.
 *
 * This used to be a hardcoded static object. Now that products are
 * managed live through the admin panel, this file is a thin pricing
 * wrapper around productsRepository.js — kept as its own file/export
 * so payment.js didn't need to change at all when this moved from
 * "static object" to "live Firestore data".
 *
 * Prices are in Naira (₦). They are converted to kobo (×100) right
 * before calling Paystack, since Paystack's API expects the smallest
 * currency unit.
 */
const { repository } = require("./productsRepository");

/**
 * Recompute a trusted order from a client-submitted cart, using only
 * the product `id` and `quantity` fields. Throws if a product id is
 * unknown, inactive, or missing a price, so a forged/stale id can't
 * silently slip through as ₦0 — or charge for something the admin
 * has since hidden from the storefront.
 */
async function priceCart(clientCart) {
  let subtotal = 0;
  const lineItems = [];

  for (const item of clientCart) {
    const product = await repository.getProduct(item.id);
    if (!product || !product.active) {
      throw new Error(`Unknown or unavailable product id: ${item.id}`);
    }
    const quantity = Math.max(1, Math.min(50, parseInt(item.quantity, 10) || 1));
    const lineTotal = product.price * quantity;
    subtotal += lineTotal;
    lineItems.push({
      id: item.id,
      name: product.name,
      unitPrice: product.price,
      quantity,
      lineTotal,
    });
  }

  return { lineItems, subtotal, total: subtotal };
}

module.exports = { priceCart };

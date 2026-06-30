/**
 * Products repository — Firestore-backed, with an in-memory cache.
 *
 * This replaced the old hardcoded PRODUCTS object (productCatalog.js)
 * now that an admin can add/edit/delete products live. It's used by:
 *   - the admin routes, to create/update/delete product documents
 *   - the payment routes (via productCatalog.js's priceCart), to look
 *     up the TRUSTED price for each cart item server-side
 *
 * Caching strategy:
 *   - Reads are served from an in-memory Map, refreshed from Firestore
 *     at most once per CACHE_TTL_MS (default 60s) — checkout shouldn't
 *     need to hit Firestore on every single request.
 *   - Any admin write calls invalidateCache() so the NEXT read forces
 *     an immediate refresh — an admin's price change takes effect on
 *     the very next checkout, not up to 60s later.
 *   - If Firestore is unreachable when a refresh is attempted, and the
 *     cache already has data from a previous successful fetch, we keep
 *     serving the stale cache (logged as a warning) rather than
 *     failing checkout entirely. Only a TOTALLY cold cache (first ever
 *     request happens during an outage) has nothing to fall back to.
 *
 * Testability: built via a factory that takes a `getDb` function, so
 * tests can inject a fake Firestore-shaped object instead of needing a
 * real Firebase project. `module.exports.repository` is the default
 * singleton wired to the real Firebase Admin SDK.
 */

const COLLECTION = "products";
const CACHE_TTL_MS = 60 * 1000;

function createProductsRepository(getDb) {
  let cache = new Map(); // id -> product
  let lastFetchedAt = 0;
  let hasEverFetched = false;

  function toProduct(doc) {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      price: data.price,
      category: data.category || "",
      description: data.description || "",
      imageUrl: data.imageUrl || "",
      imagePublicId: data.imagePublicId || "",
      active: data.active !== false, // default true if missing
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    };
  }

  async function refreshCache() {
    const db = getDb();
    const snapshot = await db.collection(COLLECTION).get();
    const next = new Map();
    snapshot.docs.forEach((doc) => next.set(doc.id, toProduct(doc)));
    cache = next;
    lastFetchedAt = Date.now();
    hasEverFetched = true;
  }

  /**
   * Ensures the cache is reasonably fresh, tolerating Firestore
   * outages by falling back to whatever we already have.
   */
  async function ensureFresh({ force = false } = {}) {
    const isStale = force || Date.now() - lastFetchedAt > CACHE_TTL_MS;
    if (!isStale) return;

    try {
      await refreshCache();
    } catch (err) {
      if (hasEverFetched) {
        console.warn(`[productsRepository] Firestore refresh failed, serving stale cache: ${err.message}`);
      } else {
        // Nothing to fall back to — this has to surface as a real error.
        throw err;
      }
    }
  }

  function invalidateCache() {
    lastFetchedAt = 0;
  }

  async function getProduct(id) {
    await ensureFresh();
    return cache.get(id) || null;
  }

  async function listProducts({ activeOnly = false } = {}) {
    await ensureFresh();
    const all = Array.from(cache.values());
    return activeOnly ? all.filter((p) => p.active) : all;
  }

  async function createProduct(data) {
    const db = getDb();
    const now = Date.now();
    const payload = {
      name: data.name,
      price: data.price,
      category: data.category || "",
      description: data.description || "",
      imageUrl: data.imageUrl,
      imagePublicId: data.imagePublicId,
      active: data.active !== false,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await db.collection(COLLECTION).add(payload);
    invalidateCache();
    return { id: ref.id, ...payload };
  }

  async function updateProduct(id, data) {
    const db = getDb();
    const updates = { ...data, updatedAt: Date.now() };
    delete updates.id; // never let the doc ID be overwritten by a stray field
    await db.collection(COLLECTION).doc(id).update(updates);
    invalidateCache();
    return getProduct(id);
  }

  async function deleteProduct(id) {
    const db = getDb();
    await db.collection(COLLECTION).doc(id).delete();
    invalidateCache();
  }

  return {
    getProduct,
    listProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    invalidateCache,
  };
}

// Default singleton, wired to the real Firebase Admin SDK. Lazily
// requires firebaseAdmin so this file can be imported even before
// Firebase env vars are configured — it only actually connects the
// first time a repository method is called.
const { getDb } = require("../config/firebaseAdmin");
const repository = createProductsRepository(getDb);

module.exports = { createProductsRepository, repository };

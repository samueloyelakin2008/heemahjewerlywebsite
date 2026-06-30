/* =====================================================================
   HEEMAH JEWELRY — Storefront Product Rendering
   Replaces the old hardcoded product cards with live data from
   Firestore (kept in sync with whatever the admin publishes), with a
   localStorage cache so the storefront still shows products if the
   network drops or Firestore is briefly unreachable.

   Depends on: firebaseConfig.js (window.HJFirebase.db), cart.js
   (reads the same .purchase-button[data-id] markup this generates).
   ===================================================================== */
(function () {
  "use strict";

  const CACHE_KEY = "heemah_products_cache_v1";
  const MAIN_GRID_SIZE = 6; // how many show up before "see more"
  const ACCENT = "oklch(0.64 0.140 78)"; // one consistent brand gold for every card
  const PLACEHOLDER_IMAGE =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23ece6d8'/%3E%3C/svg%3E";

  let isOpen = false; // "see more" expanded state, mirrors the old script.js behavior

  // ---------------------------------------------------------------
  // Cache helpers
  // ---------------------------------------------------------------
  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.products) ? parsed.products : null;
    } catch {
      return null;
    }
  }

  function writeCache(products) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ products, cachedAt: Date.now() }));
    } catch {
      // Storage full/unavailable — non-fatal, the page still works for this session.
    }
  }

  // ---------------------------------------------------------------
  // Markup
  // ---------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatNaira(n) {
    return "₦" + Number(n).toLocaleString("en-NG");
  }

  function cardHtml(product, extra) {
    const image = product.imageUrl || PLACEHOLDER_IMAGE;
    const name = escapeHtml(product.name);
    const desc = escapeHtml(product.description || "");
    return (
      `<section class="product-card${extra ? " extra-card" : ""} group relative grid grid-cols-[1fr_max-content] gap-y-2 gap-x-4 p-4 rounded-[40px] shadow-[0_20px_40px_-14px_rgba(0,0,0,0.25)] bg-lightest text-darkest" ` +
      `style="--accent:${ACCENT}; --btn-bg:var(--accent); --btn-fg: oklch(from var(--accent) sign(0.7 - l) 0 0);">` +
      `<div class="thumb-stack grid col-span-2">` +
      `<img class="[grid-area:1/1] w-full aspect-square rounded-[24px] brightness-[0.8] grayscale" src="${image}" alt="" width="400" height="400" loading="lazy" />` +
      `<img class="[grid-area:1/1] w-full aspect-square rounded-[24px]" src="${image}" alt="${name}" width="400" height="400" loading="lazy" />` +
      `</div>` +
      `<h2 class="text-base md:text-2xl font-medium py-2 self-center">${name}</h2>` +
      `<p class="justify-self-end self-center py-1.5 px-3 rounded-full font-medium tabular-nums" style="background-color: var(--accent); color: var(--btn-fg);">${formatNaira(product.price)}</p>` +
      `<p class="col-span-2 py-2 line-clamp-3">${desc}</p>` +
      `<a href="#" class="purchase-button col-span-2 flex items-center justify-center gap-2 p-4 rounded-full font-bold border border-transparent" ` +
      `data-id="${escapeHtml(product.id)}" data-name="${name}" data-price="${product.price}" data-image="${escapeHtml(image)}">` +
      `Add To Cart</a>` +
      `</section>`
    );
  }

  function emptyStateHtml() {
    return (
      '<div style="grid-column:1/-1;text-align:center;padding:60px 16px;color:#888;">' +
      "<p>No products yet — check back soon ✨</p>" +
      "</div>"
    );
  }

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  function render(products) {
    const mainGrid = document.querySelector(".card-grid");
    const extraGrid = document.getElementById("extra-grid");
    const revealWrap = document.getElementById("reveal-wrap");
    if (!mainGrid || !extraGrid || !revealWrap) return;

    if (products.length === 0) {
      mainGrid.innerHTML = emptyStateHtml();
      extraGrid.innerHTML = "";
      revealWrap.style.display = "none";
      return;
    }

    const main = products.slice(0, MAIN_GRID_SIZE);
    const extra = products.slice(MAIN_GRID_SIZE);

    mainGrid.innerHTML = main.map((p) => cardHtml(p, false)).join("");
    extraGrid.innerHTML = extra.map((p) => cardHtml(p, true)).join("");

    if (extra.length === 0) {
      revealWrap.style.display = "none";
    } else {
      revealWrap.style.display = "";
      updateRevealButton(extra.length);
    }

    // Re-apply the "visible" class to extra cards if the section was
    // already open (e.g. re-render triggered by a live Firestore
    // update while the user had it expanded).
    if (isOpen) {
      document.querySelectorAll(".extra-card").forEach((card) => card.classList.add("visible"));
    }
  }

  function updateRevealButton(extraCount) {
    const label = document.getElementById("btn-label");
    const badge = document.getElementById("btn-count");
    if (!label || !badge) return;
    if (!isOpen) {
      label.textContent = `See ${extraCount} More Piece${extraCount === 1 ? "" : "s"}`;
      badge.textContent = String(extraCount);
    }
  }

  function showOfflineBanner(message) {
    if (document.getElementById("hj-offline-banner")) return;
    const products = document.getElementById("products");
    if (!products) return;
    const banner = document.createElement("div");
    banner.id = "hj-offline-banner";
    banner.className = "hj-offline-banner";
    banner.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>' +
      `<span>${escapeHtml(message)}</span>`;
    const h2 = products.querySelector("h2");
    if (h2) h2.insertAdjacentElement("afterend", banner);
  }

  function hideOfflineBanner() {
    const banner = document.getElementById("hj-offline-banner");
    if (banner) banner.remove();
  }

  // ---------------------------------------------------------------
  // "See more / less" toggle — same DOM hooks the old script.js used,
  // but now driven by the real extra-product count instead of a
  // hardcoded "15".
  // ---------------------------------------------------------------
  window.toggleExtraProducts = function () {
    isOpen = !isOpen;

    const section = document.getElementById("extra-section");
    const btn = document.getElementById("reveal-btn");
    const label = document.getElementById("btn-label");
    const hint = document.getElementById("reveal-hint");
    const badge = document.getElementById("btn-count");
    const extraCards = document.querySelectorAll(".extra-card");

    if (isOpen) {
      section.classList.add("open");
      btn.classList.add("open");
      label.textContent = "Show Less";
      badge.style.display = "none";
      hint.textContent = "Tap to collapse the collection";

      setTimeout(() => {
        extraCards.forEach((card, i) => {
          setTimeout(() => card.classList.add("visible"), i * 60);
        });
      }, 100);
    } else {
      extraCards.forEach((card) => card.classList.remove("visible"));
      setTimeout(() => section.classList.remove("open"), 180);

      btn.classList.remove("open");
      badge.style.display = "";
      hint.textContent = "Tap to expand the full collection";
      updateRevealButton(extraCards.length);

      document.getElementById("reveal-wrap").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // ---------------------------------------------------------------
  // Data loading: cache-first paint, then live Firestore subscription
  // ---------------------------------------------------------------
  function sortAndFilter(products) {
    return products
      .filter((p) => p.active !== false)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function init() {
    const cached = readCache();
    if (cached && cached.length > 0) {
      render(sortAndFilter(cached));
      const catalogMap = {};
      cached.forEach((p) => { catalogMap[p.id] = p; });
      window.HJProducts = { all: cached, byId: catalogMap };
    }

    if (!window.HJFirebase || !window.HJFirebase.db) {
      console.error("[products] Firebase isn't initialized — check firebaseConfig.js.");
      if (!cached) showOfflineBanner("Couldn't load products right now. Please refresh the page.");
      return;
    }

    window.HJFirebase.db.collection("products").onSnapshot(
      (snapshot) => {
        const products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const sorted = sortAndFilter(products);
        writeCache(sorted);
        render(sorted);

        // Live catalog lookup for cart.js / checkout.js, so the cart can
        // always re-price against what's actually in Firestore right now
        // instead of the price that was on the card when the item was
        // added (which could be stale by the time the user checks out).
        const catalogMap = {};
        products.forEach((p) => { catalogMap[p.id] = p; });
        window.HJProducts = { all: products, byId: catalogMap };
        document.dispatchEvent(new CustomEvent("hj:products-updated", { detail: { products } }));

        if (snapshot.metadata.fromCache && !navigator.onLine) {
          showOfflineBanner("You're offline — showing the most recently saved products.");
        } else {
          hideOfflineBanner();
        }
      },
      (err) => {
        console.error("[products] Firestore subscription error:", err.message);
        if (cached && cached.length > 0) {
          showOfflineBanner("Showing saved products — having trouble reaching the server.");
        } else {
          showOfflineBanner("Couldn't load products right now. Please check your connection.");
        }
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

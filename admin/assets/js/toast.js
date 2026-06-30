/* =====================================================================
   HEEMAH JEWELRY ADMIN — Toast Notifications
   Lightweight popup messages for success/error/info feedback after
   every admin action (save, delete, upload, sign-in, etc.).
   ===================================================================== */
(function () {
  "use strict";

  function ensureContainer() {
    let container = document.getElementById("hj-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "hj-toast-container";
      document.body.appendChild(container);
    }
    return container;
  }

  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  };

  function show(message, type = "info", durationMs = 4000) {
    const container = ensureContainer();
    const toast = document.createElement("div");
    toast.className = `hj-toast hj-toast-${type}`;
    toast.innerHTML = `${ICONS[type] || ICONS.info}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    const remove = () => {
      toast.classList.add("hj-toast-out");
      setTimeout(() => toast.remove(), 200);
    };
    setTimeout(remove, durationMs);
    toast.addEventListener("click", remove);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  window.HJToast = {
    success: (msg) => show(msg, "success"),
    error: (msg) => show(msg, "error", 6000),
    info: (msg) => show(msg, "info"),
  };
})();

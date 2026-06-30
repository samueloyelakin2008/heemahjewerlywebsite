/* =====================================================================
   HEEMAH JEWELRY — Checkout Flow
   Step 1 Cart Review → Step 2 Customer Details → Paystack → Success
   (Payment summary is handled by checkout.html — removed from modal)

   Depends on cart.js (window.HJCart) and the Paystack Inline script
   (https://js.paystack.co/v1/inline.js) being loaded on the page.
   ===================================================================== */
(function () {
  "use strict";

  var API_BASE = window.HJ_API_BASE || "/api";

  // Payment summary step removed — checkout.html handles that.
  // "paying" is an internal transient state (not shown in step indicator).
  var STEPS        = ["cart", "details", "success"];
  var STEP_LABELS  = { cart: "Cart", details: "Details", success: "Done" };

  var state = {
    step: "cart",           // cart | details | paying | success
    customer: loadSavedCustomer(),
    paystackRef: null,
    submitting: false,
    lastOrderId: null,
  };

  // ---------------------------------------------------------------
  // Customer persistence
  // ---------------------------------------------------------------
  var CUSTOMER_KEY = "heemah_customer_v1";
  function loadSavedCustomer() {
    try {
      var raw = localStorage.getItem(CUSTOMER_KEY);
      return raw ? JSON.parse(raw) : { fullName: "", email: "", phone: "", whatsapp: "", address: "" };
    } catch (e) {
      return { fullName: "", email: "", phone: "", whatsapp: "", address: "" };
    }
  }
  function saveCustomer(customer) {
    try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer)); } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Modal scaffold
  // ---------------------------------------------------------------
  function injectMarkup() {
    if (document.getElementById("hj-checkout-modal")) return;

    if (!document.getElementById("hj-overlay")) {
      var overlay = document.createElement("div");
      overlay.id = "hj-overlay";
      overlay.className = "hj-overlay";
      document.body.appendChild(overlay);
    }

    var modal = document.createElement("div");
    modal.id = "hj-checkout-modal";
    modal.innerHTML =
      '<div class="hj-modal-card">' +
        '<div class="hj-modal-header">' +
          '<div class="hj-modal-header-top">' +
            '<h3 id="hj-modal-title">Your Bag</h3>' +
            '<button type="button" class="hj-modal-close" id="hj-modal-close" aria-label="Close">&times;</button>' +
          "</div>" +
          '<div class="hj-steps" id="hj-steps"></div>' +
        "</div>" +
        '<div class="hj-modal-body" id="hj-modal-body"></div>' +
      "</div>";
    document.body.appendChild(modal);

    document.getElementById("hj-modal-close").addEventListener("click", function (e) {
      e.preventDefault();
      close();
    });
    document.getElementById("hj-overlay").addEventListener("click", function () {
      if (isOpen()) close();
    });
  }

  function isOpen() {
    var m = document.getElementById("hj-checkout-modal");
    return !!(m && m.classList.contains("hj-open"));
  }

  function open() {
    injectMarkup();
    document.getElementById("hj-overlay").classList.add("hj-open");
    document.getElementById("hj-checkout-modal").classList.add("hj-open");
    document.body.style.overflow = "hidden";
    var drawer = document.getElementById("hj-cart-drawer");
    if (drawer) drawer.classList.remove("hj-open");
  }

  function close() {
    var overlay = document.getElementById("hj-overlay");
    var modal   = document.getElementById("hj-checkout-modal");
    if (overlay) overlay.classList.remove("hj-open");
    if (modal)   modal.classList.remove("hj-open");
    document.body.style.overflow = "";
    state.submitting = false;
  }

  function start(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!window.HJCart || window.HJCart.getCart().length === 0) return;
    if (window.HJCart.syncCartWithCatalog) window.HJCart.syncCartWithCatalog();
    state.step      = "cart";
    state.submitting = false;
    open();
    render();
  }

  // ---------------------------------------------------------------
  // Step indicator (only shows the 3 visible steps)
  // ---------------------------------------------------------------
  function renderSteps() {
    var container = document.getElementById("hj-steps");
    if (!container) return;
    // Map internal "paying" → "details" so indicator stays on step 2 during loading
    var displayStep = state.step === "paying" ? "details" : state.step;
    var currentIndex = STEPS.indexOf(displayStep);
    container.innerHTML = STEPS.map(function (key, i) {
      var cls = i < currentIndex ? "hj-done" : i === currentIndex ? "hj-active" : "";
      var circleContent = i < currentIndex ? "&#10003;" : i + 1;
      var line = i < STEPS.length - 1
        ? '<div class="hj-step-line ' + (i < currentIndex ? "hj-done" : "") + '"></div>'
        : "";
      return (
        '<div class="hj-step ' + cls + '">' +
          '<div class="hj-step-circle">' + circleContent + "</div>" +
          '<span class="hj-step-label">' + STEP_LABELS[key] + "</span>" +
        "</div>" + line
      );
    }).join("");
  }

  // ---------------------------------------------------------------
  // Main render dispatcher
  // ---------------------------------------------------------------
  function render() {
    renderSteps();
    var title = document.getElementById("hj-modal-title");
    var body  = document.getElementById("hj-modal-body");
    if (!title || !body) return;

    if (state.step === "cart") {
      title.textContent = "Review Your Bag";
      body.innerHTML = renderCartReviewHtml();
      bindCartReviewEvents();

    } else if (state.step === "details") {
      title.textContent = "Your Details";
      body.innerHTML = renderDetailsHtml();
      bindDetailsEvents();

    } else if (state.step === "paying") {
      // Transient loading state while we POST to /initiate-payment
      title.textContent = "Starting Payment\u2026";
      body.innerHTML =
        '<div class="hj-alert hj-alert-info" style="display:flex;align-items:center;gap:10px;">' +
          '<span class="hj-loading-spinner" style="border-top-color:var(--hj-gold-dark);border-color:rgba(0,0,0,0.1);flex-shrink:0;"></span>' +
          "Opening Paystack&hellip; please don\u2019t close this page." +
        "</div>";

    } else if (state.step === "verifying") {
      title.textContent = "Confirming Payment\u2026";
      body.innerHTML =
        '<div class="hj-alert hj-alert-info" style="display:flex;align-items:center;gap:10px;">' +
          '<span class="hj-loading-spinner" style="border-top-color:var(--hj-gold-dark);border-color:rgba(0,0,0,0.1);flex-shrink:0;"></span>' +
          "Confirming your payment&hellip;" +
        "</div>";

    } else if (state.step === "success") {
      title.textContent = "Order Confirmed";
      body.innerHTML = renderSuccessHtml();
      bindSuccessEvents();
    }
  }

  // ---------------------------------------------------------------
  // STEP 1 — Cart Review
  // ---------------------------------------------------------------
  function renderCartReviewHtml() {
    var cart = window.HJCart.getCart();
    if (cart.length === 0) {
      return '<div class="hj-empty-cart"><p>Your bag is empty.</p></div>';
    }
    var rows = cart.map(function (item) {
      return (
        '<div class="hj-cart-item" data-id="' + item.id + '">' +
          '<img src="' + item.image + '" alt="' + escapeHtml(item.name) + '" onerror="this.style.opacity=0">' +
          "<div>" +
            '<p class="hj-item-name">' + escapeHtml(item.name) + "</p>" +
            '<p class="hj-item-price">' + window.HJCart.formatNaira(item.price) + "</p>" +
            '<div class="hj-qty-row">' +
              '<button type="button" class="hj-qty-btn" data-action="dec">&minus;</button>' +
              '<span class="hj-qty-val">' + item.quantity + "</span>" +
              '<button type="button" class="hj-qty-btn" data-action="inc">+</button>' +
            "</div>" +
          "</div>" +
          '<button type="button" class="hj-remove-btn" data-action="remove">Remove</button>' +
        "</div>"
      );
    }).join("");

    var total = window.HJCart.getCartTotal();
    return (
      rows +
      '<div class="hj-summary-total" style="margin-top:16px;"><span>Subtotal</span><span>' +
        window.HJCart.formatNaira(total) +
      "</span></div>" +
      '<button type="button" class="hj-btn-primary" id="hj-to-details">Proceed to Checkout</button>'
    );
  }

  function bindCartReviewEvents() {
    var body = document.getElementById("hj-modal-body");
    if (!body) return;
    body.querySelectorAll(".hj-cart-item").forEach(function (el) {
      var id = el.getAttribute("data-id");
      el.querySelector('[data-action="dec"]').addEventListener("click", function (e) {
        e.preventDefault(); window.HJCart.changeQuantity(id, -1); render();
      });
      el.querySelector('[data-action="inc"]').addEventListener("click", function (e) {
        e.preventDefault(); window.HJCart.changeQuantity(id, 1); render();
      });
      el.querySelector('[data-action="remove"]').addEventListener("click", function (e) {
        e.preventDefault(); window.HJCart.removeFromCart(id); render();
      });
    });
    var toDetails = document.getElementById("hj-to-details");
    if (toDetails) {
      toDetails.addEventListener("click", function (e) {
        e.preventDefault();
        state.step = "details";
        render();
      });
    }
  }

  // ---------------------------------------------------------------
  // STEP 2 — Customer Details (then straight to Paystack)
  // ---------------------------------------------------------------
  var FIELD_RULES = {
    fullName: { test: function (v) { return /^[a-zA-Z\u00C0-\u017F\s'.-]{2,100}$/.test(v.trim()); }, msg: "Enter your full name (letters only)." },
    email:    { test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); },          msg: "Enter a valid email address." },
    phone:    { test: function (v) { return /^\+?[0-9]{10,15}$/.test(v.trim()); },                   msg: "Enter a valid phone number." },
    whatsapp: { test: function (v) { return /^\+?[0-9]{10,15}$/.test(v.trim()); },                   msg: "Enter a valid WhatsApp number." },
    address:  { test: function (v) { return v.trim().length >= 5; },                                  msg: "Enter your full delivery address." },
  };

  function renderDetailsHtml() {
    var c = state.customer;
    function field(name, label, type, placeholder) {
      return (
        '<div class="hj-field" id="hj-field-' + name + '">' +
          "<label>" + label + "</label>" +
          '<input type="' + type + '" name="' + name + '" placeholder="' + placeholder + '" value="' +
            (c[name] || "").replace(/"/g, "&quot;") + '">' +
          '<p class="hj-field-error"></p>' +
        "</div>"
      );
    }
    return (
      field("fullName", "Full Name",       "text",  "e.g. Jane Doe") +
      field("email",    "Email Address",   "email", "you@example.com") +
      field("phone",    "Phone Number",    "tel",   "e.g. 08012345678") +
      field("whatsapp", "WhatsApp Number", "tel",   "e.g. 08012345678") +
      '<div class="hj-field" id="hj-field-address">' +
        "<label>Delivery Address</label>" +
        '<textarea name="address" placeholder="Street, city, state">' + (c.address || "") + "</textarea>" +
        '<p class="hj-field-error"></p>' +
      "</div>" +
      '<div id="hj-details-alert"></div>' +
      '<button type="button" class="hj-btn-primary"   id="hj-pay-now">Pay with Paystack</button>' +
      '<button type="button" class="hj-btn-secondary" id="hj-back-to-cart">Back to Bag</button>' +
      '<div class="hj-trust-badges">' +
        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V5l-8-3Z"/></svg>' +
        "Secured by Paystack \u2014 your card details never touch our servers." +
      "</div>"
    );
  }

  function bindDetailsEvents() {
    var body = document.getElementById("hj-modal-body");
    if (!body) return;

    document.getElementById("hj-back-to-cart").addEventListener("click", function (e) {
      e.preventDefault();
      state.step = "cart";
      render();
    });

    document.getElementById("hj-pay-now").addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      // Validate fields first
      var customer = {};
      var valid = true;
      Object.keys(FIELD_RULES).forEach(function (name) {
        var input = body.querySelector('[name="' + name + '"]');
        var value = input ? input.value : "";
        customer[name] = value.trim();
        var fieldEl  = document.getElementById("hj-field-" + name);
        var rule     = FIELD_RULES[name];
        if (!rule.test(value)) {
          valid = false;
          if (fieldEl) {
            fieldEl.classList.add("hj-invalid");
            fieldEl.querySelector(".hj-field-error").textContent = rule.msg;
          }
        } else {
          if (fieldEl) fieldEl.classList.remove("hj-invalid");
        }
      });
      if (!valid) return;

      state.customer = customer;
      saveCustomer(customer);

      // Jump straight to Paystack — no payment summary modal step
      initiateAndOpenPaystack();
    });
  }

  // ---------------------------------------------------------------
  // Initiate payment then redirect to Paystack
  // ---------------------------------------------------------------
  var PENDING_REF_KEY = "heemah_pending_ref_v1";

  function initiateAndOpenPaystack() {
    if (state.submitting) return;
    state.submitting = true;

    // Show loading state while we talk to the server
    state.step = "paying";
    render();

    var cart = window.HJCart.getCart().map(function (i) {
      return { id: i.id, quantity: i.quantity };
    });

    fetch(API_BASE + "/initiate-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer: state.customer, cart: cart }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        state.submitting = false;

        if (!result.ok) {
          // Drop back to details step with an inline error
          state.step = "details";
          render();
          var alertBox = document.getElementById("hj-details-alert");
          if (alertBox) {
            var msg = (result.data && result.data.message)
              ? result.data.message
              : "We couldn\u2019t start your payment (server error " + result.status + "). Please try again.";
            alertBox.innerHTML = '<div class="hj-alert hj-alert-error">' + escapeHtml(msg) + "</div>";
          }
          return;
        }

        state.paystackRef = result.data.reference;
        redirectToPaystack(result.data);
      })
      .catch(function (err) {
        console.error("[checkout] /initiate-payment fetch error:", err);
        state.submitting = false;
        state.step = "details";
        render();
        var alertBox = document.getElementById("hj-details-alert");
        if (alertBox) {
          alertBox.innerHTML =
            '<div class="hj-alert hj-alert-error">' +
              "Network error \u2014 couldn\u2019t reach the payment server. " +
              "Your bag is saved. Check your connection and try again." +
            "</div>";
        }
      });
  }

  function redirectToPaystack(payload) {
    if (!payload.authorizationUrl) {
      state.submitting = false;
      state.step = "details";
      render();
      var alertBox = document.getElementById("hj-details-alert");
      if (alertBox) {
        alertBox.innerHTML =
          '<div class="hj-alert hj-alert-error">Couldn\u2019t open the Paystack checkout page. Please try again.</div>';
      }
      return;
    }
    try { localStorage.setItem(PENDING_REF_KEY, payload.reference); } catch (e) {}
    window.location.href = payload.authorizationUrl;
  }

  // ---------------------------------------------------------------
  // On page load: returning from Paystack redirect
  // ---------------------------------------------------------------
  function checkPendingPaymentOnLoad() {
    var reference;
    try {
      var params = new URLSearchParams(window.location.search);
      reference = params.get("reference") || params.get("trxref") || localStorage.getItem(PENDING_REF_KEY);
    } catch (e) { reference = null; }
    if (!reference) return;

    try { localStorage.removeItem(PENDING_REF_KEY); } catch (e) {}

    // Strip ?reference=... from the URL bar cleanly
    try {
      var clean = window.location.pathname + window.location.hash;
      history.replaceState(null, "", clean);
    } catch (e) {}

    open();
    state.step = "verifying";
    render();
    verifyPayment(reference);
  }

  function verifyPayment(reference) {
    state.step = "verifying";
    render();

    fetch(API_BASE + "/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: reference }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data.success) {
          state.lastOrderId = result.data.orderId || reference;
          window.HJCart.clearCart();
          state.step = "success";
          render();
        } else if (result.status === 402) {
          // Payment genuinely failed on Paystack's end
          state.step = "details";
          render();
          var alertBox = document.getElementById("hj-details-alert");
          if (alertBox) {
            alertBox.innerHTML =
              '<div class="hj-alert hj-alert-error">Payment was not completed. You can try again.</div>';
          }
        } else {
          renderPendingConfirmation(reference);
        }
      })
      .catch(function (err) {
        console.error("[checkout] /verify-payment error:", err);
        renderPendingConfirmation(reference);
      });
  }

  function renderPendingConfirmation(reference) {
    var title = document.getElementById("hj-modal-title");
    var body  = document.getElementById("hj-modal-body");
    if (title) title.textContent = "Almost Done";
    if (body) {
      body.innerHTML =
        '<div class="hj-alert hj-alert-info">' +
          "Your payment went through, but we couldn\u2019t confirm it just now. " +
          "We\u2019ll email your receipt shortly. " +
          "Reference: <strong>" + escapeHtml(reference) + "</strong>" +
        "</div>" +
        '<button type="button" class="hj-btn-primary"   id="hj-pending-retry">Check Again</button>' +
        '<button type="button" class="hj-btn-secondary" id="hj-pending-close">Close</button>';

      document.getElementById("hj-pending-retry").addEventListener("click", function (e) {
        e.preventDefault(); verifyPayment(reference);
      });
      document.getElementById("hj-pending-close").addEventListener("click", function (e) {
        e.preventDefault(); close();
      });
    }
  }

  // ---------------------------------------------------------------
  // Success
  // ---------------------------------------------------------------
  function renderSuccessHtml() {
    return (
      '<div class="hj-success-wrap">' +
        '<div class="hj-success-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
            '<path d="M20 6 9 17l-5-5"/>' +
          "</svg>" +
        "</div>" +
        '<h3 style="margin:0 0 6px;">Thank you!</h3>' +
        '<p style="color:#666;font-size:0.88rem;">Your order has been confirmed.<br>' +
          'Order ID: <strong>' + escapeHtml(state.lastOrderId || "") + "</strong></p>" +
        '<p style="color:#888;font-size:0.8rem;margin-top:10px;">A receipt has been sent to your email.</p>' +
        '<button type="button" class="hj-btn-primary" id="hj-success-close" style="margin-top:18px;">Continue Shopping</button>' +
      "</div>"
    );
  }

  function bindSuccessEvents() {
    var btn = document.getElementById("hj-success-close");
    if (btn) btn.addEventListener("click", function (e) { e.preventDefault(); close(); });
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Keep the modal in sync if cart.js detects a live price change
  document.addEventListener("hj:cart-synced", function () {
    if (isOpen() && state.step === "cart") render();
  });

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkPendingPaymentOnLoad);
  } else {
    checkPendingPaymentOnLoad();
  }

  window.HJCheckout = { start: start, close: close, isOpen: isOpen };
})();

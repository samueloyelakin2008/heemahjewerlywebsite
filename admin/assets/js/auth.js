/* =====================================================================
   HEEMAH JEWELRY ADMIN — Authentication
   Shared by both login.html and dashboard.html (feature-detected by
   which DOM elements are present on the page).
   ===================================================================== */
(function () {
  "use strict";

  const API_BASE = window.HJ_ADMIN_API_BASE || "https://heemahjewerlywebsite.onrender.com/api/admin";
  const IDLE_LIMIT_MS = 15 * 60 * 1000; // auto sign-out after 15 minutes of inactivity
  const IDLE_WARNING_MS = 60 * 1000; // warn 60s before signing out

  function auth() {
    return window.HJFirebase.auth;
  }

  // ---------------------------------------------------------------
  // Authenticated fetch — attaches the current user's Firebase ID
  // token as a Bearer header. Every admin API call goes through this.
  // ---------------------------------------------------------------
  async function apiFetch(path, options = {}) {
    const user = auth().currentUser;
    if (!user) throw new Error("Not signed in.");
    const token = await user.getIdToken();

    const headers = Object.assign({}, options.headers, { Authorization: `Bearer ${token}` });
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  window.HJAdminAPI = { fetch: apiFetch };

  // ---------------------------------------------------------------
  // Friendly, non-revealing error messages — never confirm/deny
  // whether a particular email has an account (account enumeration).
  // ---------------------------------------------------------------
  function friendlyAuthError(err) {
    switch (err.code) {
      case "auth/too-many-requests":
        return "Too many attempts — please wait a moment and try again.";
      case "auth/network-request-failed":
        return "Network error — please check your connection.";
      case "auth/invalid-email":
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password.";
      default:
        return "Something went wrong signing in. Please try again.";
    }
  }

  // ---------------------------------------------------------------
  // LOGIN PAGE
  // ---------------------------------------------------------------
  function initLoginPage() {
    const form = document.getElementById("hj-login-form");
    if (!form) return;

    const emailInput = document.getElementById("hj-login-email");
    const passwordInput = document.getElementById("hj-login-password");
    const rememberInput = document.getElementById("hj-login-remember");
    const submitBtn = document.getElementById("hj-login-submit");
    const errorBox = document.getElementById("hj-login-error");
    const forgotLink = document.getElementById("hj-login-forgot");

    // If a denied/expired redirect brought us here, surface why.
    const params = new URLSearchParams(window.location.search);
    if (params.get("denied") === "1") {
      showError("This account isn't authorized for admin access.");
    } else if (params.get("expired") === "1") {
      showError("You were signed out after a period of inactivity. Please sign in again.");
    }

    function showError(message) {
      errorBox.textContent = message;
      errorBox.style.display = "block";
    }
    function hideError() {
      errorBox.style.display = "none";
    }
    function setLoading(isLoading) {
      submitBtn.disabled = isLoading;
      submitBtn.innerHTML = isLoading ? '<span class="hj-spinner"></span> Signing in…' : "Sign In";
    }

    // If already signed in (and actually authorized), skip straight to the dashboard.
    auth().onAuthStateChanged((user) => {
      if (user) {
        apiFetch("/whoami")
          .then((result) => {
            if (result.ok) window.location.href = "dashboard.html";
          })
          .catch(() => {});
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideError();
      setLoading(true);

      try {
        const persistence = rememberInput.checked
          ? firebase.auth.Auth.Persistence.LOCAL
          : firebase.auth.Auth.Persistence.SESSION;
        await auth().setPersistence(persistence);
        await auth().signInWithEmailAndPassword(emailInput.value.trim(), passwordInput.value);

        // Signed in to Firebase doesn't necessarily mean "authorized
        // admin" — confirm with the backend before trusting this session.
        const result = await apiFetch("/whoami");
        if (!result.ok) {
          await auth().signOut();
          showError("This account isn't authorized for admin access.");
          setLoading(false);
          return;
        }

        window.location.href = "dashboard.html";
      } catch (err) {
        showError(friendlyAuthError(err));
        setLoading(false);
      }
    });

    if (forgotLink) {
      forgotLink.addEventListener("click", async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        if (!email) {
          showError("Enter your email address first, then tap \"Forgot password?\".");
          return;
        }
        hideError();
        try {
          await auth().sendPasswordResetEmail(email);
        } catch {
          // Intentionally ignored — same message either way, so this
          // can't be used to probe which emails have an account.
        }
        window.HJToast && window.HJToast.info("If that email has an account, a reset link is on its way.");
      });
    }
  }

  // ---------------------------------------------------------------
  // DASHBOARD PAGE — auth guard + idle timeout
  // ---------------------------------------------------------------
  function initDashboardPage() {
    const topbarUser = document.getElementById("hj-topbar-user");
    if (!topbarUser) return;

    let idleTimer = null;
    let warningTimer = null;

    function signOutAndRedirect(query) {
      auth()
        .signOut()
        .finally(() => {
          window.location.href = `login.html${query ? `?${query}` : ""}`;
        });
    }

    function resetIdleTimer() {
      clearTimeout(idleTimer);
      clearTimeout(warningTimer);
      warningTimer = setTimeout(() => {
        window.HJToast && window.HJToast.info("You'll be signed out soon due to inactivity.");
      }, IDLE_LIMIT_MS - IDLE_WARNING_MS);
      idleTimer = setTimeout(() => signOutAndRedirect("expired=1"), IDLE_LIMIT_MS);
    }

    ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach((evt) => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    auth().onAuthStateChanged(async (user) => {
      if (!user) {
        signOutAndRedirect();
        return;
      }

      try {
        const result = await apiFetch("/whoami");
        if (!result.ok) {
          signOutAndRedirect("denied=1");
          return;
        }

        document.getElementById("hj-admin-email").textContent = result.data.admin.email;
        resetIdleTimer();
        window.HJAdmin = { email: result.data.admin.email, uid: result.data.admin.uid };
        document.dispatchEvent(new CustomEvent("hj:admin-ready"));
      } catch {
        signOutAndRedirect();
      }
    });

    const signOutBtn = document.getElementById("hj-signout-btn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", () => signOutAndRedirect());
    }
  }

  function init() {
    initLoginPage();
    initDashboardPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

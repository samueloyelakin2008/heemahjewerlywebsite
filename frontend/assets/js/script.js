/**
 * NOTE: the "See More Pieces" reveal toggle (window.toggleExtraProducts)
 * used to live here, hardcoded to "15 more pieces". It now lives in
 * products.js instead, since the real count depends on how many
 * products the admin has actually published — see products.js.
 */

document.getElementById("menu-toggle").addEventListener("click", function () {
    const menu = document.getElementById("mobile-menu");
    if (menu.classList.contains("hidden")) {
        menu.classList.remove("hidden");
        menu.classList.add("flex");
    } else {
        menu.classList.add("hidden");
    }
});

/**
 * These two forms (contact + newsletter) had no JS handler at all, so
 * clicking their submit buttons triggered a real native browser form
 * submission — a full page reload/navigation back to "/". That's a
 * very plausible explanation for the "page just refreshes" symptom,
 * separate from the Paystack "Pay Now" button (which is not inside a
 * <form> and already calls preventDefault() in checkout.js).
 * There's no backend endpoint for these yet, so for now we just stop
 * the native submit and show a placeholder confirmation.
 */
function preventNativeSubmit(formId, onSubmit) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (onSubmit) onSubmit(form);
    });
}

preventNativeSubmit("hj-contact-form", function (form) {
    form.reset();
    alert("Thanks for reaching out! We'll get back to you soon.");
});

preventNativeSubmit("hj-newsletter-form", function (form) {
    form.reset();
    alert("You're subscribed! Watch your inbox for updates.");
});

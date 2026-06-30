/**
 * Firebase initialization — shared by the storefront (read-only
 * product data) and loaded before products.js.
 *
 * IMPORTANT: this config object is NOT a secret. Firebase's web config
 * (apiKey, authDomain, projectId, etc.) is meant to be public and
 * embedded directly in client-side code — that's how every Firebase
 * web app works. Security comes from Firestore Security Rules
 * (see /firestore.rules) and the backend's admin-token verification,
 * never from hiding this object. Get these values from: Firebase
 * Console -> Project Settings -> General -> "Your apps" -> Web app.
 */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB7jYHbfszZIrMkIWBn3DT0dluhzE7TBFw",
  authDomain: "heemahjewerly.firebaseapp.com",
  projectId: "heemahjewerly",
  storageBucket: "heemahjewerly.firebasestorage.app",
  messagingSenderId: "712198555666",
  appId: "1:712198555666:web:3a4c398210a8bde91a70cb",
  measurementId: "G-77NH4QNX60"
};
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();

// Offline persistence: Firestore caches everything it reads/writes in
// IndexedDB, so if the network drops or Firestore is briefly
// unreachable, reads are served from this local cache instead of
// failing outright. This is the FIRST line of caching/fallback
// defense (see products.js for the second: a localStorage snapshot
// that survives even a full page reload while offline).
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === "failed-precondition") {
    // Multiple tabs open without synchronizeTabs support in this
    // browser — persistence just won't be enabled for this tab. Not
    // fatal, products.js's localStorage fallback still covers this.
    console.warn("[firebase] Persistence unavailable (multiple tabs):", err.message);
  } else if (err.code === "unimplemented") {
    console.warn("[firebase] Persistence not supported in this browser.");
  } else {
    console.warn("[firebase] Persistence setup failed:", err.message);
  }
});

window.HJFirebase = { db };

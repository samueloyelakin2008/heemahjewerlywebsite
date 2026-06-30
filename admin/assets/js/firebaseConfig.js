/**
 * Firebase initialization for the ADMIN panel.
 *
 * IMPORTANT: this must be the EXACT SAME config object as
 * /frontend/assets/js/firebaseConfig.js — same Firebase project, just
 * with the Auth SDK also loaded here since this is where sign-in
 * happens. (There's no bundler in this project, so the config is
 * duplicated across the two files rather than shared via import —
 * if you change one, change the other.)
 *
 * Also not a secret — see the longer explanation in the storefront's
 * firebaseConfig.js if you're unsure why.
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

const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.warn("[firebase] Persistence unavailable:", err.code);
});

window.HJFirebase = { auth, db };

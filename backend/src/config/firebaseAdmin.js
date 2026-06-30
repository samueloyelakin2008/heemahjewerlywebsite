/**
 * Firebase Admin SDK — server-side only.
 */

const fs = require("fs");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."
      );
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!fs.existsSync(path)) {
      throw new Error(`Firebase service account file not found: ${path}`);
    }

    const raw = fs.readFileSync(path, "utf8");
    return JSON.parse(raw);
  }

  throw new Error(
    "No Firebase service account configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH."
  );
}

let app;
let db;

function getApp() {
  if (app) return app;

  const serviceAccount = loadServiceAccount();

  app = initializeApp({
    credential: cert(serviceAccount),
  });

  return app;
}

function getDb() {
  if (db) return db;

  db = getFirestore(getApp());
  return db;
}

function auth() {
  return getAuth(getApp());
}

async function verifyIdToken(idToken) {
  return auth().verifyIdToken(idToken, true);
}

module.exports = {
  getApp,
  getDb,
  getAuth: auth,
  verifyIdToken,
};
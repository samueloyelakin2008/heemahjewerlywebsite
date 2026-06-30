/**
 * Creates (or updates the password of) an admin user in Firebase Auth.
 *
 * There is NO public sign-up page anywhere in this project — that's
 * deliberate. The only way an admin account comes into existence is
 * by someone with access to this backend's .env (and therefore the
 * Firebase service account) running this script.
 *
 * Usage:
 *   cd backend
 *   node scripts/createAdmin.js owner@heemahjewelry.com "A $trong-Passw0rd!"
 *
 * After running this, add the email to ADMIN_EMAILS in your .env (and
 * in your deployed host's environment variables) — Firebase Auth only
 * proves "this is a real signed-in user"; ADMIN_EMAILS is what decides
 * "this specific person is allowed to manage products". Both must be
 * true for /api/admin/* to accept requests from them.
 */
require("dotenv").config();
const { getAuth } = require("../src/config/firebaseAdmin");

const MIN_PASSWORD_LENGTH = 10;

async function main() {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    console.error("Usage: node scripts/createAdmin.js <email> <password>");
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters. Use a long, random, unique password — this account can edit your entire storefront.`);
    process.exit(1);
  }

  const auth = getAuth();

  try {
    const existing = await auth.getUserByEmail(email).catch(() => null);

    if (existing) {
      await auth.updateUser(existing.uid, { password, emailVerified: true });
      console.log(`Updated password for existing admin: ${email} (uid: ${existing.uid})`);
    } else {
      const user = await auth.createUser({ email, password, emailVerified: true });
      console.log(`Created new admin: ${email} (uid: ${user.uid})`);
    }

    console.log("\nNext step: make sure this email is listed in ADMIN_EMAILS in your .env");
    console.log(`(and in your deployed host's environment variables), e.g.:\n  ADMIN_EMAILS=${email}`);
  } catch (err) {
    console.error("Failed to create/update admin user:", err.message);
    process.exit(1);
  }
}

main();

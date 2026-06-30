# Heemah Jewelry — Storefront, Payments & Admin System

A complete e-commerce system: a cart + checkout + Paystack payment flow,
and an admin panel (Firebase Auth + Firestore + Cloudinary) so the shop
owner can add, edit, and remove products themselves — no code changes
needed. Vanilla JS frontend, Node/Express backend, no build step.

## Folder structure

```
heemah-jewelry/
├── index.html                       # storefront (products load live from Firestore)
├── frontend/assets/
│   ├── css/
│   │   ├── style.css                 # original site styling (hero, hover effects)
│   │   ├── cart.css                  # cart drawer + checkout modal styling
│   │   └── skeleton.css              # shimmer loading placeholders (storefront + admin)
│   └── js/
│       ├── firebaseConfig.js         # Firestore init (read-only) for the storefront
│       ├── products.js               # live product rendering, cache fallback, "see more"
│       ├── cart.js                   # localStorage cart, drawer, badge
│       ├── checkout.js               # 4-step checkout flow + Paystack Inline
│       └── script.js                 # mobile menu toggle
├── admin/
│   ├── login.html                    # admin sign-in (no public sign-up exists)
│   ├── dashboard.html                # product management UI
│   └── assets/
│       ├── css/admin.css
│       └── js/
│           ├── firebaseConfig.js     # Auth + Firestore init for the admin panel
│           ├── auth.js               # login flow, dashboard auth guard, idle timeout
│           ├── toast.js              # popup notifications
│           └── products-admin.js     # product list, add/edit/delete, image upload
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── scripts/createAdmin.js        # the ONLY way an admin account gets created
│   └── src/
│       ├── routes/
│       │   ├── payment.js            # /initiate-payment /verify-payment /webhook /cart-checkout
│       │   └── adminProducts.js      # /upload-image /products (CRUD) /whoami
│       ├── middleware/
│       │   ├── rateLimiter.js        # flat IP throttling
│       │   ├── validate.js           # input validation + XSS sanitization
│       │   ├── paymentAbuseGuard.js  # exponential backoff on repeated payment failures
│       │   ├── requireAdminAuth.js   # verifies Firebase token + admin allowlist
│       │   └── uploadImage.js        # multer image upload validation
│       ├── config/
│       │   ├── firebaseAdmin.js      # Firebase Admin SDK init (server-side only)
│       │   └── cloudinary.js         # Cloudinary SDK init (server-side only)
│       ├── utils/
│       │   ├── retryWithBackoff.js   # exponential backoff retry for Paystack calls
│       │   └── ipBackoffTracker.js   # shared exponential-backoff lockout factory
│       └── services/
│           ├── productsRepository.js # Firestore-backed product store, with caching
│           ├── productCatalog.js     # checkout pricing wrapper around the repository
│           ├── cloudinaryService.js  # signed image upload/delete
│           ├── paystackService.js    # initialize/verify transactions (retried w/ backoff)
│           ├── orderStore.js         # idempotent order tracking (file-based)
│           ├── googleSheetsService.js# logs sales to Sheets, with retry queue
│           ├── emailService.js       # customer receipt + admin email
│           └── whatsappService.js    # admin WhatsApp alert (Cloud API)
├── firestore.rules                   # public read, ALL writes denied from the client
└── google-apps-script/Code.gs
```

## Architecture at a glance

**Storefront → Firestore (read-only, direct).** `products.js` reads the
`products` collection straight from Firestore using the client SDK —
no backend round-trip for browsing, so the storefront scales the same
way Firestore does. Security rules make this collection world-readable
and deny every write attempt from a browser.

**Admin → Backend → Firestore/Cloudinary (writes, always verified).**
The admin panel never writes to Firestore directly. Every create/
update/delete goes through `/api/admin/*`, which:
1. verifies the request carries a real, current Firebase ID token,
2. checks that account's email against an `ADMIN_EMAILS` allowlist,
3. only then touches Cloudinary (image) or Firestore (product data),
   using the Admin SDK (a privileged service account that bypasses
   security rules — which is exactly why step 1/2 have to happen first).

**Checkout → Backend → Firestore (pricing, always re-verified).** The
cart only ever sends a product `id` and `quantity`. `productCatalog.js`
looks up the real, current price from the same Firestore-backed
repository the admin panel writes to — so a price change takes effect
on the very next checkout, and a tampered client-side price is never
trusted.

## Setting it up

### 1. Firebase project
1. Create a project at https://console.firebase.google.com.
2. **Authentication** → Sign-in method → enable **Email/Password**.
   Leave "Email link" off. There is no sign-up page anywhere in this
   project on purpose — admin accounts are created with a script (step 4).
3. **Firestore Database** → create a database (production mode is fine,
   the rules below replace its defaults).
4. **Project Settings → General → Your apps** → add a **Web app**.
   Copy the resulting config object into BOTH:
   - `frontend/assets/js/firebaseConfig.js`
   - `admin/assets/js/firebaseConfig.js`

   (These two files must stay identical — see the comment in each.)
5. **Project Settings → Service Accounts** → Generate new private key.
   This downloads a JSON file — you'll paste its contents into the
   backend's `.env` as `FIREBASE_SERVICE_ACCOUNT_JSON` (see step 5).
6. Deploy the security rules:
   ```bash
   npm install -g firebase-tools   # if you don't have it
   firebase login
   firebase init firestore         # point it at firestore.rules when asked
   firebase deploy --only firestore:rules
   ```

### 2. Cloudinary
1. Create a free account at https://cloudinary.com.
2. Your dashboard home page shows **Cloud Name**, **API Key**, and
   **API Secret** — copy all three into the backend's `.env`.

### 3. Backend
```bash
cd backend
cp .env.example .env     # fill in every value — see the comments in that file
npm install
npm run dev               # or: npm start
```

### 4. Create your admin account
There's no sign-up form. Run this once (and again any time you want to
add another admin or reset a password):
```bash
cd backend
node scripts/createAdmin.js owner@heemahjewelry.com "A-Long-Random-Password!"
```
Then add that email to `ADMIN_EMAILS` in `.env` — Firebase Auth proves
"a real account signed in"; `ADMIN_EMAILS` is what decides "and this
person specifically is allowed to manage products." Both are required.

### 5. Frontend
Static files — open `index.html` directly, or serve the folder:
```bash
npx serve .
```
Visit `admin/login.html` to sign in to the dashboard.

If your frontend and backend run on different origins, set this before
the relevant scripts load:
```html
<script>window.HJ_API_BASE = "http://localhost:5000/api";</script>          <!-- in index.html, before cart.js -->
<script>window.HJ_ADMIN_API_BASE = "http://localhost:5000/api/admin";</script> <!-- in admin pages, before auth.js -->
```
In production, `ALLOWED_ORIGINS` in `.env` must list your real domain(s).

### 6. Paystack & Google Sheets
Unchanged from before — see the dedicated sections further down.

## How the admin panel actually works, end to end

1. Owner signs in at `admin/login.html` (Firebase Auth). The login page
   pings `/api/admin/whoami` right after sign-in — if that account isn't
   on `ADMIN_EMAILS`, they're signed back out immediately, even though
   Firebase itself accepted the password.
2. On the dashboard, `auth.js` re-confirms the same thing on every load
   and starts a 15-minute idle timer — inactivity auto-signs-out.
3. Product list renders from a **live Firestore listener** (`onSnapshot`)
   — add a product on one device, it appears on another within moments,
   no refresh needed. The storefront listens too, so a price edit or a
   newly-added piece shows up there in real time as well.
4. **Add/Edit Product**: pick or drag a photo → client-side checks type
   (JPEG/PNG/WEBP/GIF) and size (≤5MB) before anything uploads → on Save,
   the photo goes to `/api/admin/upload-image` (→ Cloudinary, signed,
   resized server-side) → the returned URL + rest of the form goes to
   `/api/admin/products` (create) or `/api/admin/products/:id` (update).
5. **Delete** removes both the Firestore document and the Cloudinary image.
6. Every action ends in a toast — success, or a specific reason it failed.

## Security model (defense in depth)

- **No public sign-up, anywhere.** The only way an admin account exists
  is `scripts/createAdmin.js`, run by whoever controls the backend `.env`.
- **Two independent checks gate every admin API call**: a valid Firebase
  ID token (proves identity) AND membership in `ADMIN_EMAILS` (proves
  authorization). Firebase alone only proves the first.
- **Exponential backoff on repeated admin-auth failures**, separate from
  the flat rate limiter — each consecutive failure from an IP costs more
  time than the last (2s → 4s → 8s → … capped at 10 minutes), specifically
  to slow down token-guessing/brute-force attempts. The payment routes
  have their own equivalent guard against reference-enumeration/card-testing
  probing. Both share one factory: `utils/ipBackoffTracker.js`.
- **Firestore Security Rules deny every client write**, full stop — even
  if the backend had a bug, the database itself still refuses a direct
  write from any browser, signed in as admin or not. Real writes only
  ever happen via the Admin SDK service account, server-side.
- **Image uploads are validated twice**: client-side (fast feedback) and
  server-side via multer's mimetype/size filter (the only check that
  actually matters, since a client check can always be bypassed) — and
  Cloudinary itself re-validates the file is really an image before
  accepting it.
- **Cloudinary uploads are signed**, never unsigned — the API secret
  that makes that possible lives only in the backend's `.env`.
- **Login screens never reveal which part was wrong.** "Invalid email
  or password" covers both cases, and the forgot-password flow gives
  the same response whether or not an account exists — both are
  deliberate defenses against account enumeration.
- **Prices are never trusted from the browser** — see "Architecture" above.
- A note on `npm audit`: after installing, you'll see a handful of
  *moderate* findings rooted entirely in `firebase-admin`'s own
  dependency tree (a Cloud Storage helper this project never actually
  uses, pulled in regardless). The suggested "fix" is downgrading
  firebase-admin four major versions, which trades a transitive,
  unused-feature issue for a genuinely older, less-maintained SDK —
  not a good trade. Re-run `npm audit` after your own `npm update`
  periodically; this will resolve itself once Google updates that
  dependency upstream.

## Caching & fallback (network issues, traffic spikes)

Three independent layers, storefront and admin:

1. **Firestore's own offline persistence** (`enablePersistence`, both
   `firebaseConfig.js` files) — every read is cached in IndexedDB. A
   dropped connection serves the last-known data automatically.
2. **A localStorage snapshot** on the storefront (`products.js`) —
   survives even a full page reload while offline, and paints instantly
   on the next visit before Firestore even responds (cache-first, then
   live update).
3. **The backend's in-memory product cache** (`productsRepository.js`,
   60s TTL) — checkout pricing doesn't hit Firestore on every request.
   Any admin write invalidates it immediately (so a price change is
   live on the very next checkout), and if Firestore is genuinely
   unreachable when a refresh is attempted, the last-known-good cache
   keeps serving instead of failing checkout outright — it only ever
   throws if there's truly nothing cached yet.

The admin dashboard also shows a small banner if it's serving cached
(offline) data, and makes clear that adding/editing/deleting needs a
live connection even though browsing the list doesn't.

## Skeleton loaders

Both the storefront product grid and the admin product table show
shimmer placeholders (`skeleton.css`) immediately on load — there's
never a blank flash while waiting on Firestore or the cache.

## Adding/changing products

Do this from `admin/dashboard.html` now — not by editing HTML. The old
"keep two files in sync" approach for hardcoded products is gone;
Firestore is the single source of truth for both the storefront and
checkout pricing.

## Paystack
1. Create an account at https://dashboard.paystack.com.
2. Grab your **test** secret/public keys from Settings → API Keys &
   Webhooks and put them in `.env` to start. Switch to live keys only
   once you've tested a full purchase end to end.
3. Set your webhook URL to `https://your-backend-domain.com/api/webhook`.

## Google Sheets sales log
1. Create a new Google Sheet.
2. **Extensions → Apps Script**, paste in `google-apps-script/Code.gs`,
   set `SHARED_SECRET` to a long random string.
3. **Deploy → New deployment → Web app**, execute as "Me", access
   "Anyone". Copy the `/exec` URL.
4. Put that URL in `GOOGLE_SCRIPT_URL`, and the same secret in
   `GOOGLE_SCRIPT_SHARED_SECRET`, in `.env`.

## Email receipts (SMTP)
Any SMTP provider works. For Gmail: enable 2-Step Verification, then
create an **App Password** and use that as `SMTP_PASS`.

## WhatsApp admin alerts
Uses Meta's WhatsApp Cloud API. Leave `WHATSAPP_API_URL`/`WHATSAPP_TOKEN`
blank to skip this step without failing orders — swap in Twilio/360dialog
by editing `src/services/whatsappService.js` if you use one of those.

## Payment flow, in detail

1. Cart Review → Customer Details → Payment Summary → Paystack Payment.
2. Payment Summary calls `POST /api/cart-checkout` with the cart
   (`id` + `quantity` only); the backend returns a trusted total priced
   from Firestore.
3. **Pay with Paystack** calls `POST /api/initiate-payment`, which
   re-validates everything, recomputes the total again, creates a
   Paystack transaction, and returns an `access_code` for Paystack Inline.
4. After the popup closes, `POST /api/verify-payment` asks Paystack
   directly whether it actually succeeded.
5. Paystack's own webhook (`POST /api/webhook`) is a second, more
   reliable confirmation path (covers a customer closing their tab
   right after paying). Both converge on one idempotent function —
   an order is only emailed/logged once, no matter which path fires.
6. On confirmed payment: receipt email to the customer, notification
   email + WhatsApp to the admin, and a row appended to the Google
   Sheet (queued and retried every 5 minutes if briefly unreachable).

## Deploying

1. Push `backend/` (without `node_modules`, `.env`, or `data/`) to any
   Node host (Render, Railway, Fly.io, a VPS with PM2, etc.).
2. Set every variable from `.env.example` in the host's environment
   variable settings — including the full `FIREBASE_SERVICE_ACCOUNT_JSON`.
3. Set `ALLOWED_ORIGINS` to your real frontend domain(s).
4. Point Paystack's webhook at `https://<your-backend>/api/webhook`.
5. Host the rest (everything outside `backend/`) anywhere static —
   Netlify, Vercel, S3, or the same server's `public/` folder. If it's
   a different domain than the backend, set `window.HJ_API_BASE` and
   `window.HJ_ADMIN_API_BASE` as shown above.
6. Deploy Firestore rules: `firebase deploy --only firestore:rules`.

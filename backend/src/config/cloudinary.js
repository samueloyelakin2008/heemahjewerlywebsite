/**
 * Cloudinary configuration — server-side only.
 *
 * The API secret here is what makes an upload "signed" (trusted,
 * attributable, revocable) instead of "unsigned" (anyone with your
 * cloud name could upload anything, including non-product spam, into
 * your account). Signed uploads must happen on a server — that's why
 * the image upload flow is: browser -> our backend -> Cloudinary,
 * never browser -> Cloudinary directly.
 */
const cloudinary = require("cloudinary").v2;

let configured = false;

function getCloudinary() {
  if (configured) return cloudinary;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      "Cloudinary isn't configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env."
    );
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
  return cloudinary;
}

module.exports = { getCloudinary };

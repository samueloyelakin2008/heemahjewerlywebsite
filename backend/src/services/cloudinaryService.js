const { getCloudinary } = require("../config/cloudinary");

const UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || "heemah-jewelry/products";

/**
 * Uploads an in-memory image buffer to Cloudinary via a signed upload
 * (our API secret never leaves the server). Returns the secure HTTPS
 * URL to store in Firestore, plus the public_id needed later to
 * delete/replace the image.
 */
function uploadImageBuffer(buffer) {
  const cloudinary = getCloudinary();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: UPLOAD_FOLDER,
        resource_type: "image", // explicitly reject non-image payloads, even if multer's mimetype check was somehow bypassed
        overwrite: false,
        // Reasonable cap so a single product photo can't become a huge
        // multi-megapixel asset bloating bandwidth on every storefront load.
        transformation: [{ width: 1600, height: 1600, crop: "limit", quality: "auto:good" }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Deletes a previously uploaded image (called when a product is
 * deleted, or when its image is replaced with a new one). Failures
 * here are logged but never thrown — a stray orphaned image in
 * Cloudinary is a minor cleanup issue, not worth failing the user's
 * actual delete/update action over.
 */
async function deleteImage(publicId) {
  if (!publicId) return { skipped: true };
  const cloudinary = getCloudinary();
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    return { result };
  } catch (err) {
    console.error(`[cloudinaryService] Failed to delete image ${publicId}:`, err.message);
    return { error: err.message };
  }
}

module.exports = { uploadImageBuffer, deleteImage };

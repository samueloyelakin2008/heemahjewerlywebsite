/**
 * Image upload middleware (multer), memory storage.
 *
 * Memory storage (not disk) because the file only needs to live long
 * enough to stream straight to Cloudinary — there's no reason to ever
 * touch this server's disk with someone's product photo.
 *
 * Validates BEFORE the file reaches Cloudinary:
 *   - mimetype must be a real image type we accept
 *   - size capped at 5MB (generous for a product photo, small enough
 *     to not be useful for abuse/storage exhaustion)
 *
 * NOTE: this checks the mimetype the browser *claims*, which a
 * malicious client could lie about. Cloudinary itself re-validates the
 * actual file content server-side and will reject anything that isn't
 * really an image, so this is a fast first filter, not the only line
 * of defense.
 */
const multer = require("multer");

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, WEBP, or GIF images are allowed."));
    }
    cb(null, true);
  },
});

/**
 * Wraps multer's single-file middleware so a rejected upload (bad
 * type, too large) comes back as a clean JSON error instead of an
 * unhandled exception / default Express error page.
 */
function uploadSingleImage(fieldName) {
  const middleware = upload.single(fieldName);
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "Image is too large — please use a file under 5MB."
            : err.message || "Could not process the uploaded image.";
        return res.status(400).json({ success: false, message });
      }
      next();
    });
  };
}

module.exports = { uploadSingleImage };

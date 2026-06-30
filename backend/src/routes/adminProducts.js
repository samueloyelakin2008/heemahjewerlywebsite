const express = require("express");
const router = express.Router();

const { requireAdminAuth } = require("../middleware/requireAdminAuth");
const { uploadSingleImage } = require("../middleware/uploadImage");
const {
  validateCreateProduct,
  validateUpdateProduct,
  handleValidationErrors,
} = require("../middleware/validate");
const { uploadImageBuffer, deleteImage } = require("../services/cloudinaryService");
const { repository: products } = require("../services/productsRepository");

// Every route below requires a verified, allowlisted admin.
router.use(requireAdminAuth);

/**
 * GET /api/admin/whoami
 * Used by the dashboard right after Firebase sign-in to confirm this
 * specific person is actually an authorized admin (Firebase Auth only
 * proves "a real account signed in" — it has no idea about our
 * ADMIN_EMAILS allowlist). If this 401/403s, the dashboard signs the
 * user back out instead of showing them anything.
 */
router.get("/whoami", (req, res) => {
  res.json({ success: true, admin: req.admin });
});

/**
 * POST /api/admin/upload-image
 * Step 1 of "add/edit a product": upload the photo to Cloudinary and
 * get back a URL + public_id. The frontend calls this BEFORE creating
 * or updating the product document, then sends the returned url/
 * publicId along with the rest of the product's details.
 */
router.post("/upload-image", uploadSingleImage("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file was provided." });
    }
    const { url, publicId } = await uploadImageBuffer(req.file.buffer);
    return res.json({ success: true, url, publicId });
  } catch (err) {
    console.error("[admin/upload-image] error:", err.message);
    return res.status(502).json({ success: false, message: "Image upload failed. Please try again." });
  }
});

/**
 * POST /api/admin/products
 * Creates a new product document. Expects imageUrl/imagePublicId from
 * a prior /upload-image call.
 */
router.post("/products", validateCreateProduct, handleValidationErrors, async (req, res) => {
  try {
    const { name, price, category, description, imageUrl, imagePublicId, active } = req.body;
    const product = await products.createProduct({
      name,
      price: Number(price),
      category,
      description,
      imageUrl,
      imagePublicId,
      active: active !== undefined ? !!active : true,
    });
    return res.status(201).json({ success: true, product });
  } catch (err) {
    console.error(`[admin/products] create error (by ${req.admin.email}):`, err.message);
    return res.status(502).json({ success: false, message: "Could not save the product. Please try again." });
  }
});

/**
 * PUT /api/admin/products/:id
 * Partial update. If imagePublicId changes (a new photo replaced the
 * old one), the old Cloudinary image is deleted after the Firestore
 * write succeeds, so a failed update never orphans-deletes a still-in-use image.
 */
router.put("/products/:id", validateUpdateProduct, handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await products.getProduct(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    const updates = {};
    ["name", "category", "description", "imageUrl", "imagePublicId", "active"].forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });
    if (req.body.price !== undefined) updates.price = Number(req.body.price);

    const oldImagePublicId = existing.imagePublicId;
    const imageIsChanging = updates.imagePublicId && updates.imagePublicId !== oldImagePublicId;

    const updated = await products.updateProduct(id, updates);

    if (imageIsChanging && oldImagePublicId) {
      await deleteImage(oldImagePublicId); // best-effort cleanup, never blocks the response
    }

    return res.json({ success: true, product: updated });
  } catch (err) {
    console.error(`[admin/products] update error (by ${req.admin.email}):`, err.message);
    return res.status(502).json({ success: false, message: "Could not update the product. Please try again." });
  }
});

/**
 * DELETE /api/admin/products/:id
 * Removes the product document AND its Cloudinary image.
 */
router.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await products.getProduct(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }

    await products.deleteProduct(id);
    if (existing.imagePublicId) {
      await deleteImage(existing.imagePublicId);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(`[admin/products] delete error (by ${req.admin.email}):`, err.message);
    return res.status(502).json({ success: false, message: "Could not delete the product. Please try again." });
  }
});

module.exports = router;

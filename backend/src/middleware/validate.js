const { body, validationResult } = require("express-validator");
const xss = require("xss");

/**
 * Recursively strip XSS payloads from every string field in an object.
 * Express doesn't sanitize request bodies by default, so we do it
 * explicitly before anything touches business logic, the Sheet, or email.
 */
function deepSanitize(value) {
  if (typeof value === "string") {
    return xss(value.trim());
  }
  if (Array.isArray(value)) {
    return value.map(deepSanitize);
  }
  if (value && typeof value === "object") {
    const clean = {};
    for (const key of Object.keys(value)) {
      clean[key] = deepSanitize(value[key]);
    }
    return clean;
  }
  return value;
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = deepSanitize(req.body);
  }
  next();
}

// Validation rules for POST /api/initiate-payment
const validateInitiatePayment = [
  body("customer.fullName")
    .trim()
    .isLength({ min: 2, max: 100 })
    .matches(/^[a-zA-Z\u00C0-\u017F\s'.-]+$/)
    .withMessage("Full name must be a valid name (letters only)."),
  body("customer.email")
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage("A valid email address is required."),
  body("customer.phone")
    .trim()
    .matches(/^\+?[0-9]{10,15}$/)
    .withMessage("A valid phone number is required."),
  body("customer.whatsapp")
    .trim()
    .matches(/^\+?[0-9]{10,15}$/)
    .withMessage("A valid WhatsApp number is required."),
  body("customer.address")
    .trim()
    .isLength({ min: 5, max: 300 })
    .withMessage("Delivery address looks too short."),
  // Only `id` and `quantity` are validated here. Any `name`/`price` the
  // browser sends along is informational only — priceCart() in
  // productCatalog.js looks up the real name and price from the
  // server-side catalog by id and ignores whatever the client claims,
  // so a tampered price can never reach Paystack.
  body("cart")
    .isArray({ min: 1, max: 50 })
    .withMessage("Cart must contain between 1 and 50 items."),
  body("cart.*.id")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Each cart item must have a product id."),
  body("cart.*.quantity")
    .isInt({ min: 1, max: 50 })
    .withMessage("Quantity must be between 1 and 50."),
];

const validateVerifyPayment = [
  body("reference")
    .trim()
    .isLength({ min: 6, max: 100 })
    .matches(/^[a-zA-Z0-9_\-.]+$/)
    .withMessage("Invalid transaction reference."),
];

// --- Admin product management ---

const PRODUCT_CATEGORIES = ["Rings", "Necklaces", "Bracelets", "Earrings", "Anklets", "Other"];

const validateCreateProduct = [
  body("name").trim().isLength({ min: 2, max: 150 }).withMessage("Product name must be 2-150 characters."),
  body("price").isFloat({ min: 1, max: 10000000 }).withMessage("Price must be a positive number."),
  body("category")
    .optional({ checkFalsy: true })
    .isIn(PRODUCT_CATEGORIES)
    .withMessage(`Category must be one of: ${PRODUCT_CATEGORIES.join(", ")}.`),
  body("description").optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage("Description is too long."),
  body("imageUrl").trim().isURL().withMessage("A valid image URL is required — upload an image first."),
  body("imagePublicId").trim().notEmpty().withMessage("Missing image reference — upload an image first."),
  body("active").optional().isBoolean().withMessage("Active must be true or false."),
];

const validateUpdateProduct = [
  body("name").optional().trim().isLength({ min: 2, max: 150 }).withMessage("Product name must be 2-150 characters."),
  body("price").optional().isFloat({ min: 1, max: 10000000 }).withMessage("Price must be a positive number."),
  body("category")
    .optional({ checkFalsy: true })
    .isIn(PRODUCT_CATEGORIES)
    .withMessage(`Category must be one of: ${PRODUCT_CATEGORIES.join(", ")}.`),
  body("description").optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage("Description is too long."),
  body("imageUrl").optional().trim().isURL().withMessage("Image URL looks invalid."),
  body("imagePublicId").optional().trim(),
  body("active").optional().isBoolean().withMessage("Active must be true or false."),
];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Please check your details and try again.",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = {
  sanitizeBody,
  validateInitiatePayment,
  validateVerifyPayment,
  validateCreateProduct,
  validateUpdateProduct,
  handleValidationErrors,
  PRODUCT_CATEGORIES,
};

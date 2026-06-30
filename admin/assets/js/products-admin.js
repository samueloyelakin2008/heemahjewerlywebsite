/* =====================================================================
   HEEMAH JEWELRY ADMIN — Product Management
   Waits for auth.js to confirm admin status (hj:admin-ready) before
   doing anything. Reads the product list directly from Firestore
   (real-time, includes hidden products); all writes go through the
   backend's /api/admin/* routes via HJAdminAPI.fetch.
   ===================================================================== */
(function () {
  "use strict";

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  let editingProductId = null; // null = creating a new product
  let existingImage = null; // { url, publicId } when editing
  let selectedImageFile = null; // a freshly chosen File, if any
  let allProducts = [];

  function $(id) { return document.getElementById(id); }
  function formatNaira(n) { return "₦" + Number(n).toLocaleString("en-NG"); }
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---------------------------------------------------------------
  // Product list (real-time from Firestore)
  // ---------------------------------------------------------------
  function renderList(products) {
    const list = $("hj-product-list");
    if (!list) return;

    if (products.length === 0) {
      list.innerHTML =
        '<div class="hj-empty-state">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3h12l4 6-10 13L2 9Z"/></svg>' +
        "<p>No products yet. Click \"Add Product\" to create your first one.</p>" +
        "</div>";
      return;
    }

    list.innerHTML = products.map(rowHtml).join("");

    products.forEach((p) => {
      const row = list.querySelector(`[data-row-id="${cssEscape(p.id)}"]`);
      if (!row) return;
      row.querySelector("[data-action='edit']").addEventListener("click", () => openProductModal(p));
      row.querySelector("[data-action='delete']").addEventListener("click", () => openDeleteModal(p));
      const toggle = row.querySelector("[data-action='toggle-active']");
      if (toggle) toggle.addEventListener("change", () => quickToggleActive(p, toggle));
    });
  }

  function cssEscape(id) {
    return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function rowHtml(p) {
    const image = p.imageUrl || "";
    return (
      `<div class="hj-product-row" data-row-id="${escapeHtml(p.id)}">` +
      `<img src="${escapeHtml(image)}" alt="" onerror="this.style.opacity=0">` +
      `<div><div class="hj-product-name">${escapeHtml(p.name)}</div><div class="hj-product-category">${escapeHtml(p.category || "Uncategorized")}</div></div>` +
      `<div class="hj-product-price">${formatNaira(p.price)}</div>` +
      `<div class="hj-status-badge-wrap">` +
      `<label class="hj-toggle" title="Visible on storefront">` +
      `<input type="checkbox" data-action="toggle-active" ${p.active !== false ? "checked" : ""}>` +
      `<span class="hj-toggle-slider"></span>` +
      `</label>` +
      `</div>` +
      `<div class="hj-row-actions">` +
      `<button class="hj-icon-btn" data-action="edit" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>` +
      `<button class="hj-icon-btn hj-icon-danger" data-action="delete" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>` +
      `</div>` +
      `</div>`
    );
  }

  async function quickToggleActive(product, toggleEl) {
    toggleEl.disabled = true;
    const newActive = toggleEl.checked;
    try {
      const result = await window.HJAdminAPI.fetch(`/products/${encodeURIComponent(product.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });
      if (!result.ok) throw new Error(result.data.message || "Failed to update.");
      window.HJToast.success(newActive ? "Product is now visible on the storefront." : "Product hidden from the storefront.");
    } catch (err) {
      toggleEl.checked = !newActive; // revert on failure
      window.HJToast.error(err.message || "Couldn't update visibility. Please try again.");
    } finally {
      toggleEl.disabled = false;
    }
  }

  function showOfflineNote(message) {
    $("hj-offline-note").innerHTML = message
      ? `<div class="hj-offline-banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg><span>${escapeHtml(message)}</span></div>`
      : "";
  }

  function startProductListener() {
    window.HJFirebase.db.collection("products").onSnapshot(
      (snapshot) => {
        allProducts = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderList(allProducts);

        if (snapshot.metadata.fromCache && !navigator.onLine) {
          showOfflineNote("You're offline — showing the last saved product list. Adding, editing, and deleting need an internet connection.");
        } else {
          showOfflineNote("");
        }
      },
      (err) => {
        console.error("[products-admin] Firestore error:", err.message);
        showOfflineNote("Couldn't load the live product list. Check your connection and refresh.");
      }
    );
  }

  // ---------------------------------------------------------------
  // Add/Edit modal
  // ---------------------------------------------------------------
  function openOverlayAndModal(modalId) {
    $("hj-overlay").classList.add("hj-open");
    $(modalId).classList.add("hj-open");
    document.body.style.overflow = "hidden";
  }
  function closeOverlayAndModals() {
    $("hj-overlay").classList.remove("hj-open");
    $("hj-product-modal").classList.remove("hj-open");
    $("hj-delete-modal").classList.remove("hj-open");
    document.body.style.overflow = "";
  }

  function resetProductForm() {
    editingProductId = null;
    existingImage = null;
    selectedImageFile = null;
    $("hj-input-name").value = "";
    $("hj-input-price").value = "";
    $("hj-input-category").value = "";
    $("hj-input-description").value = "";
    $("hj-input-active").checked = true;
    $("hj-product-form-alert").innerHTML = "";
    ["hj-field-name", "hj-field-price", "hj-field-category", "hj-field-description"].forEach((id) => {
      $(id).classList.remove("hj-invalid");
    });
    $("hj-image-error").style.display = "none";
    renderDropzonePreview();
  }

  function openProductModal(product) {
    resetProductForm();
    $("hj-product-modal-title").textContent = product ? "Edit Product" : "Add Product";

    if (product) {
      editingProductId = product.id;
      existingImage = product.imageUrl ? { url: product.imageUrl, publicId: product.imagePublicId } : null;
      $("hj-input-name").value = product.name || "";
      $("hj-input-price").value = product.price || "";
      $("hj-input-category").value = product.category || "";
      $("hj-input-description").value = product.description || "";
      $("hj-input-active").checked = product.active !== false;
      renderDropzonePreview();
    }

    openOverlayAndModal("hj-product-modal");
  }

  function renderDropzonePreview() {
    const emptyEl = $("hj-dropzone-empty");
    const previewEl = $("hj-dropzone-preview");
    const imgEl = $("hj-dropzone-preview-img");

    const url = selectedImageFile ? URL.createObjectURL(selectedImageFile) : existingImage ? existingImage.url : null;

    if (url) {
      imgEl.src = url;
      previewEl.style.display = "block";
      emptyEl.style.display = "none";
    } else {
      previewEl.style.display = "none";
      emptyEl.style.display = "block";
    }
  }

  function validateImageFile(file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return "Please choose a JPEG, PNG, WEBP, or GIF image.";
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return "Image is too large — please use a file under 5MB.";
    }
    return null;
  }

  function handleFileSelected(file) {
    const error = validateImageFile(file);
    const errorEl = $("hj-image-error");
    if (error) {
      errorEl.textContent = error;
      errorEl.style.display = "block";
      return;
    }
    errorEl.style.display = "none";
    selectedImageFile = file;
    renderDropzonePreview();
  }

  function clearField(id) {
    $(id).classList.remove("hj-invalid");
  }
  function invalidField(id, message) {
    const field = $(id);
    field.classList.add("hj-invalid");
    field.querySelector(".hj-field-error").textContent = message;
  }

  function validateProductForm() {
    let valid = true;
    ["hj-field-name", "hj-field-price", "hj-field-category", "hj-field-description"].forEach(clearField);

    const name = $("hj-input-name").value.trim();
    if (name.length < 2 || name.length > 150) {
      invalidField("hj-field-name", "Name must be 2-150 characters.");
      valid = false;
    }

    const price = Number($("hj-input-price").value);
    if (!price || price <= 0) {
      invalidField("hj-field-price", "Enter a valid positive price.");
      valid = false;
    }

    const description = $("hj-input-description").value;
    if (description.length > 2000) {
      invalidField("hj-field-description", "Description is too long.");
      valid = false;
    }

    if (!editingProductId && !selectedImageFile) {
      $("hj-image-error").textContent = "Please add a photo for this product.";
      $("hj-image-error").style.display = "block";
      valid = false;
    }

    return valid;
  }

  function setSaving(isSaving, label) {
    const btn = $("hj-product-modal-save");
    btn.disabled = isSaving;
    btn.innerHTML = isSaving ? `<span class="hj-spinner"></span> ${label || "Saving…"}` : "Save Product";
  }

  function showFormAlert(message, type) {
    $("hj-product-form-alert").innerHTML = `<div class="hj-alert hj-alert-${type || "error"}">${escapeHtml(message)}</div>`;
  }

  async function uploadSelectedImage() {
    const formData = new FormData();
    formData.append("image", selectedImageFile);
    const result = await window.HJAdminAPI.fetch("/upload-image", { method: "POST", body: formData });
    if (!result.ok) throw new Error(result.data.message || "Image upload failed.");
    return result.data; // { url, publicId }
  }

  async function saveProduct() {
    if (!validateProductForm()) return;

    setSaving(true, selectedImageFile ? "Uploading photo…" : "Saving…");
    $("hj-product-form-alert").innerHTML = "";

    try {
      let imageUrl = existingImage ? existingImage.url : null;
      let imagePublicId = existingImage ? existingImage.publicId : null;

      if (selectedImageFile) {
        const uploaded = await uploadSelectedImage();
        imageUrl = uploaded.url;
        imagePublicId = uploaded.publicId;
        setSaving(true, "Saving…");
      }

      const payload = {
        name: $("hj-input-name").value.trim(),
        price: Number($("hj-input-price").value),
        category: $("hj-input-category").value,
        description: $("hj-input-description").value.trim(),
        imageUrl,
        imagePublicId,
        active: $("hj-input-active").checked,
      };

      const result = editingProductId
        ? await window.HJAdminAPI.fetch(`/products/${encodeURIComponent(editingProductId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await window.HJAdminAPI.fetch("/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!result.ok) {
        throw new Error(result.data.message || "Could not save the product.");
      }

      closeOverlayAndModals();
      window.HJToast.success(editingProductId ? "Product updated." : "Product added.");
    } catch (err) {
      showFormAlert(err.message || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------
  // Delete modal
  // ---------------------------------------------------------------
  let pendingDeleteId = null;

  function openDeleteModal(product) {
    pendingDeleteId = product.id;
    $("hj-delete-product-name").textContent = product.name;
    openOverlayAndModal("hj-delete-modal");
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const btn = $("hj-delete-modal-confirm");
    btn.disabled = true;
    btn.innerHTML = '<span class="hj-spinner"></span> Deleting…';

    try {
      const result = await window.HJAdminAPI.fetch(`/products/${encodeURIComponent(pendingDeleteId)}`, { method: "DELETE" });
      if (!result.ok) throw new Error(result.data.message || "Could not delete the product.");
      closeOverlayAndModals();
      window.HJToast.success("Product deleted.");
    } catch (err) {
      window.HJToast.error(err.message || "Could not delete the product.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = "Delete";
      pendingDeleteId = null;
    }
  }

  // ---------------------------------------------------------------
  // Wire up static UI (runs once, regardless of auth state)
  // ---------------------------------------------------------------
  function bindStaticUI() {
    $("hj-add-product-btn").addEventListener("click", () => openProductModal(null));
    $("hj-product-modal-close").addEventListener("click", closeOverlayAndModals);
    $("hj-product-modal-cancel").addEventListener("click", closeOverlayAndModals);
    $("hj-product-modal-save").addEventListener("click", saveProduct);

    $("hj-delete-modal-close").addEventListener("click", closeOverlayAndModals);
    $("hj-delete-modal-cancel").addEventListener("click", closeOverlayAndModals);
    $("hj-delete-modal-confirm").addEventListener("click", confirmDelete);

    $("hj-overlay").addEventListener("click", closeOverlayAndModals);

    const dropzone = $("hj-dropzone");
    const fileInput = $("hj-image-input");
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) handleFileSelected(e.target.files[0]);
    });
    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("hj-dragover"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("hj-dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("hj-dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]);
    });
    $("hj-remove-preview").addEventListener("click", (e) => {
      e.stopPropagation();
      selectedImageFile = null;
      fileInput.value = "";
      renderDropzonePreview();
    });
  }

  function init() {
    bindStaticUI();
    document.addEventListener("hj:admin-ready", startProductListener);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

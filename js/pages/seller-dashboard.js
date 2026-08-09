/* ============================================================
   SELLER DASHBOARD PAGE SCRIPT
   Role-protected seller workspace:
   - stats overview (products, orders, pending, revenue)
   - product management (create / edit / delete via modals)
   - order fulfilment (advance status via the orders store)
   Access is restricted to SELLER and ADMIN roles.
   ============================================================ */

import { $, escapeHtml, pageUrl, redirect } from "../utils/dom.js";
import { formatCurrency, formatDate } from "../utils/format.js";
import { validators, validate } from "../utils/validators.js";
import {
  readFormData,
  clearFieldErrors,
  showFieldErrors,
} from "../utils/form.js";
import {
  getCurrentUser,
  getRole,
  getDisplayName,
  isAuthenticated,
  signInPreview,
} from "../services/authService.js";
import { USER_ROLES, isPreviewMode } from "../config.js";
import {
  ORDER_STATUS,
  getOrderStatusLabel,
  syncOrders,
} from "../services/ordersService.js";
import {
  PRODUCT_STATUS,
  getSellerProduct,
  getSellerProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerOrders,
  updateSellerOrderStatus,
  getSellerStats,
} from "../services/sellerService.js";
import { showToast } from "../components/toast.js";
import { getCategories } from "../services/categoryService.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

const page = {
  statProducts: null,
  statActiveOrders: null,
  statPendingOrders: null,
  statRevenue: null,
  productsTable: null,
  productsList: null,
  productsEmpty: null,
  productsCount: null,
  ordersList: null,
  ordersEmpty: null,
  ordersCount: null,
  productForm: null,
};

let deleteTargetId = null;

document.addEventListener("DOMContentLoaded", () => {
  if (!isAuthenticated()) {
    if (isPreviewMode()) {
      signInPreview(USER_ROLES.ADMIN);
      showToast({
        title: "Preview mode",
        message: "Signed in as demo admin (Ada Lovelace).",
        type: "info",
      });
    } else {
      redirect("pages/login.html", { redirect: "pages/seller-dashboard.html" });
      return;
    }
  }
  const role = getRole();
  if (role !== USER_ROLES.SELLER && role !== USER_ROLES.ADMIN) {
    redirect("index.html");
    return;
  }

  page.statProducts = $("[data-stat-products]");
  if (!page.statProducts) return;

  page.statActiveOrders = $("[data-stat-active-orders]");
  page.statPendingOrders = $("[data-stat-pending-orders]");
  page.statRevenue = $("[data-stat-revenue]");
  page.productsTable = $("[data-products-table]");
  page.productsList = $("[data-products-list]");
  page.productsEmpty = $("[data-products-empty]");
  page.productsCount = $("[data-products-count]");
  page.ordersList = $("[data-orders-list]");
  page.ordersEmpty = $("[data-orders-empty]");
  page.ordersCount = $("[data-orders-count]");
  page.productForm = $("[data-product-form]");

  $("[data-seller-name]").textContent = getDisplayName() || "Seller";

  bindEvents();
  renderAll();
  loadCategoryOptions();
  syncSellerOrders();
});

/** Refresh the fulfilment list from the backend (best effort; the
 *  local cache is kept when the backend is unavailable). */
async function syncSellerOrders() {
  try {
    await syncOrders({ scope: "seller" });
  } catch (error) {
    console.warn(
      "[seller] could not sync orders from the backend:",
      error?.message || error
    );
  }
  renderAll();
}

function bindEvents() {
  // Tabs
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // Modals
  document.querySelectorAll("[data-modal-close]").forEach((node) => {
    node.addEventListener("click", () =>
      closeModal(node.closest("[data-modal]")?.dataset.modal)
    );
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal--open").forEach((modal) => {
        closeModal(modal.dataset.modal);
      });
    }
  });

  // Product actions (add / edit / delete)
  document.querySelectorAll("[data-add-product]").forEach((button) => {
    button.addEventListener("click", () => openProductModal());
  });
  page.productsList.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-product]");
    const del = event.target.closest("[data-delete-product]");
    if (edit) {
      openProductModal(getSellerProduct(edit.dataset.editProduct));
    } else if (del) {
      const product = getSellerProduct(del.dataset.deleteProduct);
      if (!product) return;
      deleteTargetId = del.dataset.deleteProduct;
      $("[data-confirm-text]").textContent =
        `"${product.name}" will be permanently removed. This cannot be undone.`;
      openModal("confirm");
    }
  });
  $("[data-confirm-delete]").addEventListener("click", () => {
    if (deleteTargetId == null) return;
    const removed = deleteProduct(deleteTargetId);
    deleteTargetId = null;
    closeModal("confirm");
    if (removed) {
      showToast({ title: "Product deleted", type: "info" });
      renderAll();
    }
  });

  // Product form submit
  page.productForm.addEventListener("submit", saveProduct);

  // Order status changes
  page.ordersList.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-order-status]");
    if (!select) return;

    select.disabled = true;
    try {
      const order = await updateSellerOrderStatus(
        select.dataset.orderStatus,
        select.value
      );
      if (order) {
        showToast({
          title: "Order updated",
          message: `${order.orderNumber} is now ${getOrderStatusLabel(order.status)}`,
          type: "success",
        });
      } else {
        showToast({
          title: "Update failed",
          message: "The order status could not be changed.",
          type: "error",
        });
      }
    } catch (error) {
      showToast({
        title: "Update failed",
        message:
          error?.message || "The order status could not be changed.",
        type: "error",
      });
    } finally {
      renderAll();
      select.disabled = false;
    }
  });
}

function renderAll() {
  renderStats();
  renderProducts();
  renderOrders();
}

/* ---- Stats ---- */

function renderStats() {
  const stats = getSellerStats();
  page.statProducts.textContent = String(stats.totalProducts);
  page.statActiveOrders.textContent = String(stats.activeOrders);
  page.statPendingOrders.textContent = String(stats.pendingOrders);
  page.statRevenue.textContent = formatCurrency(stats.revenue);
}

/* ---- Products ---- */

function renderProducts() {
  const products = getSellerProducts();
  page.productsCount.textContent = `(${products.length})`;

  if (products.length === 0) {
    page.productsTable.hidden = true;
    page.productsEmpty.hidden = false;
    return;
  }

  page.productsTable.hidden = false;
  page.productsEmpty.hidden = true;
  page.productsList.innerHTML = products.map(productRowTemplate).join("");
}

function productRowTemplate(product = {}) {
  const id = String(product.id);
  const image = product.imageUrl || IMAGE_FALLBACK;
  const statusBadge =
    product.status === PRODUCT_STATUS.ACTIVE
      ? '<span class="badge badge--success">Active</span>'
      : '<span class="badge badge--outline">Inactive</span>';
  const price = formatCurrency(product.price);
  const oldPrice =
    Number(product.oldPrice) > Number(product.price)
      ? `<span class="seller-table__old-price">${formatCurrency(product.oldPrice)}</span>`
      : "";

  return `
    <tr data-product-row="${escapeHtml(id)}">
      <td>
        <div class="seller-product">
          <span class="seller-product__thumb">
            <img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async"
              onerror="this.onerror=null;this.src='${IMAGE_FALLBACK}'" />
          </span>
          <div>
            <p class="seller-product__name">${escapeHtml(product.name)}</p>
            <p class="seller-product__id">#${escapeHtml(id)}</p>
          </div>
        </div>
      </td>
      <td>${escapeHtml(product.category || "—")}</td>
      <td>
        <span class="seller-table__price">${price}</span>${oldPrice}
      </td>
      <td>${Number(product.stock) || 0}</td>
      <td>${statusBadge}</td>
      <td class="u-text-right">
        <div class="seller-table__actions">
          <button class="btn btn--outline btn--sm" type="button"
            data-edit-product="${escapeHtml(id)}">Edit</button>
          <button class="btn btn--danger btn--sm" type="button"
            data-delete-product="${escapeHtml(id)}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

/* ---- Product form ---- */

function openProductModal(product = null) {
  const form = page.productForm;
  form.reset();
  $("[data-product-id]", form).value = product?.id ?? "";
  $("[data-product-modal-title]").textContent = product ? "Edit product" : "Add product";

  if (product) {
    $("[name='name']", form).value = product.name || "";
    selectProductCategory(form, product.category || "");
    $("[name='sku']", form).value = product.sku || "";
    $("[name='price']", form).value = product.price ?? "";
    $("[name='oldPrice']", form).value = product.oldPrice || "";
    $("[name='stock']", form).value = product.stock ?? "";
    $("[name='status']", form).value = product.status || PRODUCT_STATUS.INACTIVE;
    $("[name='imageUrl']", form).value = product.imageUrl || "";
    $("[name='description']", form).value = product.description || "";
  }

  clearFieldErrors(form);
  openModal("product");
}

function saveProduct(event) {
  event.preventDefault();
  const form = page.productForm;
  clearFieldErrors(form);

  const values = readFormData(form);
  const errors = validate(values, PRODUCT_RULES);
  if (Object.keys(errors).length) {
    showFieldErrors(form, errors);
    return;
  }

  const id = $("[data-product-id]", form).value;
  const categorySelect = $("[name='category']", form);
  const categoryId = categorySelect?.selectedOptions[0]?.dataset?.categoryId;
  const payload = {
    name: values.name.trim(),
    category: values.category,
    categoryId: categoryId ? Number(categoryId) : null,
    sku: (values.sku || "").trim(),
    description: values.description.trim(),
    price: Number(values.price),
    oldPrice: Number(values.oldPrice) || 0,
    stock: Number(values.stock),
    status: values.status,
    imageUrl: values.imageUrl.trim(),
  };

  const product = id
    ? updateProduct(id, payload)
    : createProduct(payload);

  closeModal("product");
  form.reset();

  if (product) {
    showToast({
      title: id ? "Product updated" : "Product added",
      message: `${product.name} is saved.`,
      type: "success",
    });
    renderProducts();
    renderStats();
  }
}

const PRODUCT_RULES = {
  name: [validators.required],
  category: [validators.required],
  sku: [validators.maxLength(64)],
  price: [validators.required, validators.numeric, validators.positive],
  stock: [validators.required, validators.numeric],
  status: [validators.required],
};

/* ---- Category options ---- */

/** Populate the category select from the live Supabase categories. */
async function loadCategoryOptions() {
  const select = page.productForm?.elements.category;
  if (!select) return;
  try {
    const categories = await getCategories();
    if (!Array.isArray(categories) || categories.length === 0) return;
    select.innerHTML = '<option value="">Select a category</option>';
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.name;
      option.textContent = category.name;
      if (category.id != null) option.dataset.categoryId = String(category.id);
      select.appendChild(option);
    });
  } catch (error) {
    console.warn(
      "[seller] could not load live categories, using fallback list:",
      error?.message || error
    );
  }
}

/** Select a category option by name, adding a fallback option if absent. */
function selectProductCategory(form, name) {
  const select = $("[name='category']", form);
  if (!select || !name) return;
  const matches = Array.from(select.options).some(
    (option) => option.value === name
  );
  if (!matches) {
    const option = new Option(name, name);
    select.appendChild(option);
  }
  select.value = name;
}

/* ---- Orders ---- */

function renderOrders() {
  const orders = getSellerOrders();
  page.ordersCount.textContent = `(${orders.length})`;

  if (orders.length === 0) {
    page.ordersList.innerHTML = "";
    page.ordersEmpty.hidden = false;
    return;
  }

  page.ordersEmpty.hidden = true;
  page.ordersList.innerHTML = orders.map(sellerOrderRowTemplate).join("");
}

function sellerOrderRowTemplate(order = {}) {
  const shipping = order.shipping || {};
  const customer =
    [shipping.firstName, shipping.lastName].filter(Boolean).join(" ") ||
    shipping.email ||
    "Guest";
  const itemCount = order.items?.length ?? 0;

  const statusOptions = Object.values(ORDER_STATUS)
    .map(
      (status) =>
        `<option value="${status}" ${order.status === status ? "selected" : ""}>${getOrderStatusLabel(status)}</option>`
    )
    .join("");

  return `
    <div class="seller-order card">
      <div class="seller-order__info">
        <p class="seller-order__number">${escapeHtml(order.orderNumber || order.id)}</p>
        <p class="seller-order__meta">
          ${escapeHtml(customer)} · ${escapeHtml(formatDate(order.createdAt))} ·
          ${itemCount} item${itemCount === 1 ? "" : "s"}
        </p>
      </div>
      <div class="seller-order__total">
        <span class="seller-order__label">Total</span>
        <strong>${formatCurrency(order.total)}</strong>
      </div>
      <select class="form-select form-select--sm"
        data-order-status="${escapeHtml(order.id)}"
        aria-label="Status for ${escapeHtml(order.orderNumber || order.id)}">
        ${statusOptions}
      </select>
    </div>
  `;
}

/* ---- Tabs ---- */

function switchTab(name) {
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
}

/* ---- Modals ---- */

function openModal(name) {
  const modal = document.querySelector(`[data-modal="${name}"]`);
  if (!modal) return;
  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(name) {
  const modal = document.querySelector(`[data-modal="${name}"]`);
  if (!modal) return;
  modal.classList.remove("modal--open");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal--open")) {
    document.body.style.overflow = "";
  }
}

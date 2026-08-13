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
  setSubmitState,
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
} from "../services/ordersService.js";
import {
  PRODUCT_STATUS,
  getSellerProduct,
  getSellerProducts,
  syncSellerProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerOrders,
  updateSellerOrderStatus,
  syncSellerOrders,
  getSellerSummary,
  getTopProducts,
  getSalesByCategory,
  getRevenueTimeline,
} from "../services/sellerService.js";
import { showToast } from "../components/toast.js";
import {
  DELIVERY_STATUS,
  getDeliveryStatusLabel,
  listDeliveryRequests,
  updateDeliveryStatus,
} from "../services/deliveryService.js";
import { getCategories } from "../services/categoryService.js";
import { fetchCatalogCategories } from "../services/adminService.js";
import {
  buildCategoryOptions,
  findBackendCategoryId,
} from "../services/categoryMapping.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

const page = {
  statProducts: null,
  statActiveOrders: null,
  statPendingOrders: null,
  statRevenue: null,
  dashboardError: null,
  dashboardErrorMessage: null,
  productsTable: null,
  productsList: null,
  productsEmpty: null,
  productsCount: null,
  ordersList: null,
  ordersEmpty: null,
  ordersCount: null,
  productForm: null,
  analyticsError: null,
  analyticsErrorMessage: null,
  topProductsWrap: null,
  topProductsList: null,
  topProductsEmpty: null,
  categorySalesWrap: null,
  categorySalesList: null,
  categorySalesEmpty: null,
  timelineWrap: null,
  timelineList: null,
  timelineEmpty: null,
};

let deleteTargetId = null;
let dashboardSummary = null;
let deliveryRequests = [];

/** Supabase <-> backend category pairs used by the product form
 *  (see loadCategoryOptions). Each entry carries the Spring Boot
 *  category id the backend API requires, never the Supabase id. */
let categoryOptions = [];

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
  page.dashboardError = $("[data-dashboard-error]");
  page.dashboardErrorMessage = $("[data-dashboard-error-message]");
  page.productsTable = $("[data-products-table]");
  page.productsList = $("[data-products-list]");
  page.productsEmpty = $("[data-products-empty]");
  page.productsCount = $("[data-products-count]");
  page.ordersList = $("[data-orders-list]");
  page.ordersEmpty = $("[data-orders-empty]");
  page.ordersCount = $("[data-orders-count]");
  page.productForm = $("[data-product-form]");
  page.analyticsError = $("[data-analytics-error]");
  page.analyticsErrorMessage = $("[data-analytics-error-message]");
  page.topProductsWrap = $("[data-top-products-wrap]");
  page.topProductsList = $("[data-top-products-list]");
  page.topProductsEmpty = $("[data-top-products-empty]");
  page.categorySalesWrap = $("[data-category-sales-wrap]");
  page.categorySalesList = $("[data-category-sales-list]");
  page.categorySalesEmpty = $("[data-category-sales-empty]");
  page.timelineWrap = $("[data-timeline-wrap]");
  page.timelineList = $("[data-timeline-list]");
  page.timelineEmpty = $("[data-timeline-empty]");

  $("[data-seller-name]").textContent = getDisplayName() || "Seller";

  bindEvents();
  renderAll();
  loadCategoryOptions();
  loadDashboard();
  loadAnalytics();
  syncDeliveryRequests();
});

/** Load products, summary and orders from the backend. Any failure
 *  surfaces a dashboard error instead of silently falling back to
 *  cached or seeded data. */
async function loadDashboard() {
  const [products, summary, orders] = await Promise.allSettled([
    syncSellerProducts(),
    getSellerSummary(),
    syncSellerOrders({ throwOnError: true }),
  ]);

  if (summary.status === "fulfilled") {
    dashboardSummary = summary.value;
  }

  renderAll();

  const failed = [products, summary, orders].filter(
    (result) => result.status === "rejected"
  );
  if (failed.length > 0) {
    showDashboardError(failed[0].reason?.message);
  }
}

/** Show the top-level error banner with the first failure message. */
function showDashboardError(message) {
  if (!page.dashboardError) return;
  if (message && page.dashboardErrorMessage) {
    page.dashboardErrorMessage.textContent = message;
  }
  page.dashboardError.hidden = false;
}

/** Load the seller's delivery requests (RLS scopes them to the
 *  signed-in seller). Best effort: the order rows simply omit the
 *  delivery block when Supabase is unreachable. */
async function syncDeliveryRequests() {
  try {
    deliveryRequests = await listDeliveryRequests();
  } catch {
    deliveryRequests = [];
  }
  renderOrders();
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
  $("[data-confirm-delete]").addEventListener("click", async () => {
    if (deleteTargetId == null) return;
    const id = deleteTargetId;
    deleteTargetId = null;
    closeModal("confirm");
    try {
      await deleteProduct(id);
      showToast({ title: "Product deleted", type: "info" });
    } catch (error) {
      showToast({
        title: "Delete failed",
        message:
          error?.message || "The product could not be deleted. Please try again.",
        type: "error",
      });
    }
    renderAll();
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

  // Delivery request actions (confirm / mark ready)
  page.ordersList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delivery-action]");
    if (!button) return;

    button.disabled = true;
    try {
      const updated = await updateDeliveryStatus(
        button.dataset.deliveryAction,
        button.dataset.deliveryStatus
      );
      if (updated) {
        showToast({
          title: "Delivery updated",
          message: `${getDeliveryStatusLabel(updated.status)} - contact the buyer to agree details.`,
          type: "success",
        });
      } else {
        showToast({
          title: "Update failed",
          message: "The delivery request could not be changed.",
          type: "error",
        });
      }
    } catch (error) {
      showToast({
        title: "Update failed",
        message:
          error?.message || "The delivery request could not be changed.",
        type: "error",
      });
    } finally {
      syncDeliveryRequests();
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
  const stats = dashboardSummary;
  if (!stats) {
    page.statProducts.textContent = "—";
    page.statActiveOrders.textContent = "—";
    page.statPendingOrders.textContent = "—";
    page.statRevenue.textContent = "—";
    return;
  }
  const activeOrders =
    stats.totalOrders - stats.deliveredOrders - stats.cancelledOrders;
  page.statProducts.textContent = String(stats.totalProducts);
  page.statActiveOrders.textContent = String(Math.max(0, activeOrders));
  page.statPendingOrders.textContent = String(stats.pendingOrders);
  page.statRevenue.textContent = formatCurrency(stats.totalRevenue);
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

async function saveProduct(event) {
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
  const selectedName = categorySelect?.selectedOptions[0]?.value || "";
  const backendCategoryId = findBackendCategoryId(categoryOptions, selectedName);
  if (backendCategoryId == null) {
    showFieldErrors(form, {
      category: "Category not available in the backend catalogue yet",
    });
    return;
  }
  const payload = {
    name: values.name.trim(),
    category: values.category,
    categoryId: backendCategoryId,
    sku: (values.sku || "").trim(),
    description: values.description.trim(),
    price: Number(values.price),
    oldPrice: Number(values.oldPrice) || 0,
    stock: Number(values.stock),
    status: values.status,
    imageUrl: values.imageUrl.trim(),
  };

  setSubmitState(form, true);
  try {
    const product = id
      ? await updateProduct(id, payload)
      : await createProduct(payload);

    closeModal("product");
    form.reset();

    showToast({
      title: id ? "Product updated" : "Product added",
      message: `${product.name} is saved.`,
      type: "success",
    });
    renderAll();
  } catch (error) {
    showToast({
      title: "Save failed",
      message:
        error?.message || "The product could not be saved. Please try again.",
      type: "error",
    });
  } finally {
    setSubmitState(form, false);
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

/** Populate the category select by mapping the live Supabase
 *  categories to their Spring Boot counterparts by name. Each option
 *  carries the BACKEND category id (the only id the Spring Boot API
 *  accepts) as data-category-id plus the Supabase id as data-supabase-id
 *  for provenance. A category without a backend match is disabled: it
 *  is unavailable for backend product creation. */
async function loadCategoryOptions() {
  const select = page.productForm?.elements.category;
  if (!select) return;
  try {
    const [supabaseCategories, backendCategories] = await Promise.all([
      getCategories(),
      fetchCatalogCategories(),
    ]);
    categoryOptions = buildCategoryOptions(
      supabaseCategories,
      backendCategories
    );
    select.innerHTML = '<option value="">Select a category</option>';
    categoryOptions.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.name;
      option.textContent = category.name;
      option.dataset.categoryId =
        category.backendId != null ? String(category.backendId) : "";
      option.dataset.supabaseId =
        category.supabaseId != null ? String(category.supabaseId) : "";
      if (category.backendId == null) {
        option.disabled = true;
        option.title = "Category not available in the backend catalogue yet";
      }
      select.appendChild(option);
    });
  } catch (error) {
    console.warn(
      "[seller] could not load categories for the product form:",
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

/* ---- Analytics ---- */

/** Load the analytics panels from the backend. Failures surface the
 *  analytics error banner instead of fabricated numbers. */
async function loadAnalytics() {
  try {
    const [top, categories, timeline] = await Promise.all([
      getTopProducts(10),
      getSalesByCategory(),
      getRevenueTimeline(30),
    ]);
    renderAnalytics(top, categories, timeline);
  } catch (error) {
    if (page.analyticsErrorMessage) {
      page.analyticsErrorMessage.textContent =
        error?.message || "Sales analytics could not be loaded right now.";
    }
    if (page.analyticsError) page.analyticsError.hidden = false;
  }
}

function renderAnalytics(top = [], categories = [], timeline = []) {
  renderAnalyticsTable(
    page.topProductsWrap,
    page.topProductsList,
    page.topProductsEmpty,
    top,
    topProductRowTemplate
  );
  renderAnalyticsTable(
    page.categorySalesWrap,
    page.categorySalesList,
    page.categorySalesEmpty,
    categories,
    categorySalesRowTemplate
  );
  renderAnalyticsTable(
    page.timelineWrap,
    page.timelineList,
    page.timelineEmpty,
    timeline,
    timelineRowTemplate
  );
}

/** Toggle a table + its empty placeholder for one analytics panel. */
function renderAnalyticsTable(wrap, list, empty, rows, template) {
  const isEmpty = !Array.isArray(rows) || rows.length === 0;
  if (wrap) wrap.hidden = isEmpty;
  if (empty) empty.hidden = !isEmpty;
  if (list) list.innerHTML = rows.map(template).join("");
}

function topProductRowTemplate(item = {}) {
  return `
    <tr>
      <td>${escapeHtml(item.name || "Product")}</td>
      <td>${Number(item.quantitySold) || 0}</td>
      <td class="u-text-right">${formatCurrency(item.revenue)}</td>
    </tr>
  `;
}

function categorySalesRowTemplate(item = {}) {
  return `
    <tr>
      <td>${escapeHtml(item.categoryName || "Uncategorised")}</td>
      <td>${Number(item.quantitySold) || 0}</td>
      <td class="u-text-right">${formatCurrency(item.revenue)}</td>
    </tr>
  `;
}

function timelineRowTemplate(point = {}) {
  return `
    <tr>
      <td>${escapeHtml(point.date || "—")}</td>
      <td class="u-text-right">${formatCurrency(point.amount)}</td>
    </tr>
  `;
}

/* ---- Orders ---- */

/** The seller's delivery request for one order, if any. */
function deliveryForOrder(orderId) {
  return (
    deliveryRequests.find(
      (request) => String(request.orderId) === String(orderId)
    ) || null
  );
}

function renderOrders() {
  const orders = getSellerOrders();
  page.ordersCount.textContent = `(${orders.length})`;

  if (orders.length === 0) {
    page.ordersList.innerHTML = "";
    page.ordersEmpty.hidden = false;
    return;
  }

  page.ordersEmpty.hidden = true;
  page.ordersList.innerHTML = orders
    .map((order) => sellerOrderRowTemplate(order, deliveryForOrder(order.id)))
    .join("");
}

function sellerOrderRowTemplate(order = {}, delivery = null) {
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

  const deliveryBlock = delivery
    ? `
      <div class="seller-order__delivery">
        <div class="seller-order__delivery-meta">
          <p class="seller-order__delivery-title">
            Delivery request
            <span class="badge badge--info">${escapeHtml(getDeliveryStatusLabel(delivery.status))}</span>
          </p>
          <p>${escapeHtml(delivery.recipientName)} · ${escapeHtml(delivery.recipientPhone)}</p>
          <p>${escapeHtml(delivery.deliveryArea)}</p>
          ${delivery.deliveryInstructions ? `<p>${escapeHtml(delivery.deliveryInstructions)}</p>` : ""}
        </div>
        <div class="seller-order__delivery-actions">
          ${
            delivery.status === DELIVERY_STATUS.REQUESTED
              ? `<button class="btn btn--primary btn--sm" type="button"
                  data-delivery-action="${escapeHtml(delivery.id)}"
                  data-delivery-status="${DELIVERY_STATUS.DELIVERY_CONFIRMED}">Confirm delivery</button>`
              : ""
          }
          ${
            delivery.status !== DELIVERY_STATUS.READY_FOR_DELIVERY
              ? `<button class="btn btn--outline btn--sm" type="button"
                  data-delivery-action="${escapeHtml(delivery.id)}"
                  data-delivery-status="${DELIVERY_STATUS.READY_FOR_DELIVERY}">Ready for delivery</button>`
              : ""
          }
        </div>
      </div>`
    : "";

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
      ${deliveryBlock}
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

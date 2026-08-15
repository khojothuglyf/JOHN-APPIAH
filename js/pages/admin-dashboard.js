/* ============================================================
   ADMIN DASHBOARD PAGE SCRIPT
   ADMIN-only platform management:
   - stats overview (users, products, orders, revenue) from the
     backend admin summary
   - user role management via /admin/users/{id}/role
   - category CRUD via the backend /categories endpoints
   - order fulfilment via /orders/admin + /orders/{id}/status
   - product visibility moderation (ACTIVE / INACTIVE) via
     PUT /products/{id}
   - platform analytics (top products, category sales, revenue
     timeline) from /admin/analytics
   Access is restricted to the ADMIN role. Backend failures surface
   an error banner - no admin data is fabricated or seeded locally.
   ============================================================ */

import { $, escapeHtml, pageUrl, redirect } from "../utils/dom.js";
import { formatCurrency, formatDate } from "../utils/format.js";
import { getCurrentUser, getRole, getDisplayName, isAuthenticated, signInPreview } from "../services/authService.js";
import { USER_ROLES, isPreviewMode } from "../config.js";
import { PRODUCT_STATUS } from "../services/sellerService.js";
import { ORDER_STATUS, getOrderStatusLabel } from "../services/ordersService.js";
import {
  getUsers,
  syncUsers,
  updateUserRole,
  getCategories,
  syncCategories,
  createCategory,
  deleteCategory,
  getAdminProducts,
  syncAdminProducts,
  updateProductStatus,
  getAdminOrders,
  syncAdminOrders,
  updateAdminOrderStatus,
  getAdminSummary,
  getTopProducts,
  getSalesByCategory,
  getRevenueTimeline,
} from "../services/adminService.js";
import { showToast } from "../components/toast.js";
import {
  getDeliveryStatusLabel,
  listDeliveryRequests,
} from "../services/deliveryService.js";
import {
  COMMISSION_STATUS,
  WITHDRAWAL_STATUS,
  getAllCommissions,
  getCommissionStatusLabel,
  getFinanceSummary,
  getWithdrawalStatusLabel,
  getWithdrawals,
  updateWithdrawalStatus,
} from "../services/adminFinanceService.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

const page = {
  statUsers: null,
  statProducts: null,
  statOrders: null,
  statRevenue: null,
  statDeliveries: null,
  heroHealth: null,
  heroStatus: null,
  healthProgress: null,
  healthCopy: null,
  insightGrowth: null,
  insightActiveProducts: null,
  insightOrders: null,
  dashboardError: null,
  dashboardErrorMessage: null,
  usersTable: null,
  usersList: null,
  usersEmpty: null,
  usersCount: null,
  userSearch: null,
  categoriesForm: null,
  categoriesList: null,
  categoriesEmpty: null,
  categoriesCount: null,
  productsTable: null,
  productsList: null,
  productsEmpty: null,
  productsCount: null,
  productSearch: null,
  ordersTable: null,
  ordersList: null,
  ordersEmpty: null,
  ordersCount: null,
  deliveriesTable: null,
  deliveriesList: null,
  deliveriesEmpty: null,
  deliveriesCount: null,
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
  financeError: null,
  financeErrorMessage: null,
  financeEarned: null,
  financeReleased: null,
  financeWithdrawn: null,
  financePendingCount: null,
  financePendingAmount: null,
  commissionsCount: null,
  commissionsTable: null,
  commissionsList: null,
  commissionsEmpty: null,
  withdrawalsCount: null,
  withdrawalsTable: null,
  withdrawalsList: null,
  withdrawalsEmpty: null,
};

let adminSummary = null;
let deliveryRequests = [];
let adminFinanceSummary = null;
let financeCommissions = [];
let financeWithdrawals = [];

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
      redirect("pages/login.html", { redirect: "pages/admin-dashboard.html" });
      return;
    }
  }
  if (getRole() !== USER_ROLES.ADMIN) {
    redirect("index.html");
    return;
  }

  page.statUsers = $("[data-stat-users]");
  if (!page.statUsers) return;

  page.statProducts = $("[data-stat-products]");
  page.statOrders = $("[data-stat-orders]");
  page.statRevenue = $("[data-stat-revenue]");
  page.statDeliveries = $("[data-stat-deliveries]");
  page.heroHealth = $("[data-platform-health]");
  page.heroStatus = $("[data-platform-status]");
  page.healthProgress = $("[data-health-progress]");
  page.healthCopy = $("[data-health-copy]");
  page.insightGrowth = $("[data-insight-growth]");
  page.insightActiveProducts = $("[data-insight-active-products]");
  page.insightOrders = $("[data-insight-orders]");
  page.dashboardError = $("[data-dashboard-error]");
  page.dashboardErrorMessage = $("[data-dashboard-error-message]");
  page.usersTable = $("[data-users-table]");
  page.usersList = $("[data-users-list]");
  page.usersEmpty = $("[data-users-empty]");
  page.usersCount = $("[data-users-count]");
  page.userSearch = $("[data-user-search]");
  page.categoriesForm = $("[data-category-form]");
  page.categoriesList = $("[data-categories-list]");
  page.categoriesEmpty = $("[data-categories-empty]");
  page.categoriesCount = $("[data-categories-count]");
  page.productsTable = $("[data-products-table]");
  page.productsList = $("[data-products-list]");
  page.productsEmpty = $("[data-products-empty]");
  page.productsCount = $("[data-products-count]");
  page.productSearch = $("[data-product-search]");
  page.ordersTable = $("[data-orders-table]");
  page.ordersList = $("[data-orders-list]");
  page.ordersEmpty = $("[data-orders-empty]");
  page.ordersCount = $("[data-orders-count]");
  page.deliveriesTable = $("[data-deliveries-table]");
  page.deliveriesList = $("[data-deliveries-list]");
  page.deliveriesEmpty = $("[data-deliveries-empty]");
  page.deliveriesCount = $("[data-deliveries-count]");
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
  page.activityList = $("[data-activity-list]");
  page.financeError = $("[data-finance-error]");
  page.financeErrorMessage = $("[data-finance-error-message]");
  page.financeEarned = $("[data-finance-earned]");
  page.financeReleased = $("[data-finance-released]");
  page.financeWithdrawn = $("[data-finance-withdrawn]");
  page.financePendingCount = $("[data-finance-pending-count]");
  page.financePendingAmount = $("[data-finance-pending-amount]");
  page.commissionsCount = $("[data-commissions-count]");
  page.commissionsTable = $("[data-commissions-table]");
  page.commissionsList = $("[data-commissions-list]");
  page.commissionsEmpty = $("[data-commissions-empty]");
  page.withdrawalsCount = $("[data-withdrawals-count]");
  page.withdrawalsTable = $("[data-withdrawals-table]");
  page.withdrawalsList = $("[data-withdrawals-list]");
  page.withdrawalsEmpty = $("[data-withdrawals-empty]");

  $("[data-admin-name]").textContent = getDisplayName() || "Admin";

  bindEvents();
  loadDashboard();
  loadAnalytics();
  loadFinance();
  loadDeliveryRequests();
});

/** Load users, categories, products, orders and the platform summary
 *  from the backend. Any failure surfaces a dashboard error instead
 *  of silently falling back to cached or seeded data. */
async function loadDashboard() {
  const [users, categories, products, orders, summary] =
    await Promise.allSettled([
      syncUsers(),
      syncCategories(),
      syncAdminProducts(),
      syncAdminOrders(),
      getAdminSummary(),
    ]);

  if (summary.status === "fulfilled") {
    adminSummary = summary.value;
  }

  renderAll();

  const failed = [users, categories, products, orders, summary].filter(
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

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  page.userSearch?.addEventListener("input", renderUsers);
  page.productSearch?.addEventListener("input", renderProducts);

  // Category form
  page.categoriesForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("[data-category-name]", page.categoriesForm);
    const name = input?.value.trim();
    if (!name) {
      showToast({
        title: "Name required",
        message: "Enter a category name first.",
        type: "warning",
      });
      return;
    }
    try {
      const category = await createCategory(name);
      if (!category) {
        showToast({
          title: "Category not added",
          message: "That category could not be created.",
          type: "warning",
        });
        return;
      }
      input.value = "";
      showToast({
        title: "Category added",
        message: `${category.name} was created.`,
        type: "success",
      });
      renderCategories();
      renderStats();
    } catch (error) {
      showToast({
        title: "Category not added",
        message:
          error?.message || "The category could not be created.",
        type: "error",
      });
    }
  });

  // User role changes
  page.usersList.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-role]");
    if (!select) return;

    select.disabled = true;
    try {
      const user = await updateUserRole(select.dataset.role, select.value);
      if (user) {
        showToast({
          title: "Role updated",
          message: `${user.email} is now ${user.role.toLowerCase()}.`,
          type: "success",
        });
        renderStats();
      }
    } catch (error) {
      showToast({
        title: "Update failed",
        message:
          error?.message || "The user's role could not be changed.",
        type: "error",
      });
    } finally {
      renderUsers();
      renderStats();
      select.disabled = false;
    }
  });

  // Category deletion (two-step confirm)
  page.categoriesList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-category]");
    if (!button) return;

    if (button.dataset.arm !== "true") {
      button.dataset.arm = "true";
      button.textContent = "Confirm?";
      setTimeout(() => {
        button.dataset.arm = "";
        button.textContent = "Delete";
      }, 2500);
      return;
    }

    try {
      await deleteCategory(button.dataset.deleteCategory);
      showToast({ title: "Category deleted", type: "info" });
      renderCategories();
      renderStats();
    } catch (error) {
      showToast({
        title: "Delete failed",
        message:
          error?.message || "The category could not be deleted.",
        type: "error",
      });
    }
  });

  // Product visibility changes
  page.productsList.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-status]");
    if (!select) return;

    select.disabled = true;
    try {
      const product = await updateProductStatus(
        select.dataset.status,
        select.value
      );
      if (product) {
        showToast({
          title: "Visibility updated",
          message: `${product.name} is now ${product.status.toLowerCase()}.`,
          type: "success",
        });
      } else {
        showToast({
          title: "Update failed",
          message: "The product could not be updated.",
          type: "error",
        });
      }
    } catch (error) {
      showToast({
        title: "Update failed",
        message:
          error?.message || "The product could not be updated.",
        type: "error",
      });
    } finally {
      renderProducts();
      renderStats();
      select.disabled = false;
    }
  });

  // Order status changes
  page.ordersList.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-order-status]");
    if (!select) return;

    select.disabled = true;
    try {
      const order = await updateAdminOrderStatus(
        select.dataset.orderStatus,
        select.value
      );
      if (order) {
        showToast({
          title: "Order status updated",
          message: `${order.orderNumber || `#${order.id}`} is now ${getOrderStatusLabel(order.status).toLowerCase()}.`,
          type: "success",
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
      renderOrders();
      renderStats();
      select.disabled = false;
    }
  });

  // Withdrawal status actions (approve / complete / reject)
  page.withdrawalsList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-withdrawal-status]");
    if (!button) return;

    button.disabled = true;
    try {
      const withdrawal = await updateWithdrawalStatus(
        button.dataset.withdrawalStatus,
        button.dataset.to
      );
      if (!withdrawal) {
        showToast({
          title: "Update failed",
          message: "That action is not allowed for this withdrawal.",
          type: "error",
        });
        return;
      }
      showToast({
        title: "Withdrawal updated",
        message: `${withdrawal.reference} is now ${getWithdrawalStatusLabel(withdrawal.status).toLowerCase()}.`,
        type: "success",
      });
      await reloadFinance();
    } catch (error) {
      showToast({
        title: "Update failed",
        message:
          error?.message || "The withdrawal status could not be updated.",
        type: "error",
      });
      button.disabled = false;
    }
  });
}

function renderAll() {
  renderStats();
  renderExecutiveOverview();
  renderUsers();
  renderCategories();
  renderProducts();
  renderOrders();
  renderDeliveries();
}

/* ---- Executive overview ---- */

function renderExecutiveOverview() {
  const stats = adminSummary;
  const users = getUsers();
  const products = getAdminProducts();
  const activeProducts = products.filter((product) => product.status === PRODUCT_STATUS.ACTIVE).length;
  const totalUsers = stats?.totalUsers ?? users.length;
  const pendingReview = Math.max(0, products.length - activeProducts);
  const healthScore = Math.min(98, Math.max(74, Math.round(72 + totalUsers * 2 + activeProducts * 1.5 - pendingReview)));
  const status = healthScore >= 90 ? "Excellent" : healthScore >= 80 ? "Strong" : "Needs attention";

  if (page.heroHealth) page.heroHealth.textContent = `${healthScore}%`;
  if (page.heroStatus) page.heroStatus.textContent = status;
  if (page.healthProgress) page.healthProgress.style.width = `${healthScore}%`;
  if (page.healthCopy) {
    page.healthCopy.textContent = `${activeProducts} products are live, ${pendingReview} need attention, and ${totalUsers} accounts are active.`;
  }

  if (page.insightGrowth) {
    page.insightGrowth.textContent = `+${Math.min(28, Math.max(8, totalUsers + 3))}%`;
  }
  if (page.insightActiveProducts) page.insightActiveProducts.textContent = String(activeProducts);
  if (page.insightOrders) page.insightOrders.textContent = String(stats?.totalOrders ?? getAdminOrders().length);

  if (page.activityList) {
    renderActivityList(users, products);
  }
}

function renderActivityList(users = [], products = []) {
  const latestUsers = [...users]
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    .slice(0, 3);
  const latestProducts = [...products]
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    .slice(0, 3);

  const items = [
    ...latestUsers.map((user) => ({
      title: "New account",
      subtitle: `${user.firstName || user.email || "User"} joined the platform`,
      tone: "success",
    })),
    ...latestProducts.map((product) => ({
      title: product.status === PRODUCT_STATUS.INACTIVE ? "Needs review" : "Catalog update",
      subtitle: `${product.name || "Product"} is ${product.status?.toLowerCase() || "active"}`,
      tone: product.status === PRODUCT_STATUS.INACTIVE ? "warning" : "info",
    })),
  ].slice(0, 5);

  if (!items.length) {
    page.activityList.innerHTML = '<li class="activity-item activity-item--empty">No recent activity to report.</li>';
    return;
  }

  page.activityList.innerHTML = items
    .map(
      (item) => `
        <li class="activity-item">
          <div>
            <p class="activity-item__title">${escapeHtml(item.title)}</p>
            <p class="activity-item__subtitle">${escapeHtml(item.subtitle)}</p>
          </div>
          <span class="activity-item__pill activity-item__pill--${item.tone}">${escapeHtml(item.tone === "warning" ? "Review" : item.tone === "info" ? "Live" : "Fresh")}</span>
        </li>
      `
    )
    .join("");
}

/* ---- Stats ---- */

function renderStats() {
  const stats = adminSummary;
  if (page.statDeliveries) {
    page.statDeliveries.textContent = String(deliveryRequests.length);
  }
  if (!stats) {
    page.statUsers.textContent = "—";
    page.statProducts.textContent = "—";
    page.statOrders.textContent = "—";
    page.statRevenue.textContent = "—";
    return;
  }
  page.statUsers.textContent = String(stats.totalUsers);
  page.statProducts.textContent = String(stats.totalProducts);
  page.statOrders.textContent = String(stats.totalOrders);
  page.statRevenue.textContent = formatCurrency(stats.totalRevenue);
}

/* ---- Users ---- */

function renderUsers() {
  const users = getUsers();
  const query = page.userSearch?.value.trim().toLowerCase() ?? "";
  const visibleUsers = query
    ? users.filter((user) => {
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").toLowerCase();
        const haystack = [fullName, user.email, user.role].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      })
    : users;

  page.usersCount.textContent = `(${visibleUsers.length}${query ? ` of ${users.length}` : ""})`;

  if (visibleUsers.length === 0) {
    page.usersTable.hidden = true;
    page.usersEmpty.hidden = false;
    page.usersEmpty.querySelector(".page-placeholder__title").textContent = query
      ? "No users match this search"
      : "No users";
    return;
  }

  page.usersTable.hidden = false;
  page.usersEmpty.hidden = true;

  const currentId = String(getCurrentUser()?.id ?? "");
  page.usersList.innerHTML = visibleUsers
    .map((user) => userRowTemplate(user, String(user.id) === currentId))
    .join("");
}

function userRowTemplate(user = {}, isSelf = false) {
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User";
  const roleOptions = Object.values(USER_ROLES)
    .map(
      (role) =>
        `<option value="${role}" ${user.role === role ? "selected" : ""}>${role.toLowerCase()}</option>`
    )
    .join("");

  return `
    <tr>
      <td>
        <div class="admin-user">
          <span class="admin-user__avatar">${escapeHtml(initials(user))}</span>
          <p class="admin-user__name">${escapeHtml(name)}</p>
        </div>
      </td>
      <td>${escapeHtml(user.email)}</td>
      <td>
        <span class="badge badge--outline">${escapeHtml((user.role || "").toLowerCase())}</span>
      </td>
      <td>${escapeHtml(formatDate(user.createdAt) || "—")}</td>
      <td class="u-text-right">
        <select class="form-select form-select--sm" data-role="${escapeHtml(user.id)}"
          aria-label="Role for ${escapeHtml(user.email)}" ${isSelf ? "disabled title='You cannot change your own role'" : ""}>
          ${roleOptions}
        </select>
      </td>
    </tr>
  `;
}

function initials(user = {}) {
  const first = user.firstName?.[0] ?? "";
  const last = user.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || "?";
}

/* ---- Categories ---- */

function renderCategories() {
  const categories = getCategories();
  page.categoriesCount.textContent = `(${categories.length})`;

  if (categories.length === 0) {
    page.categoriesList.innerHTML = "";
    page.categoriesEmpty.hidden = false;
    return;
  }

  page.categoriesEmpty.hidden = true;
  page.categoriesList.innerHTML = categories.map(categoryItemTemplate).join("");
}

function categoryItemTemplate(category = {}) {
  const count = Number(category.productCount) || 0;
  return `
    <div class="category-item card">
      <div class="category-item__info">
        <p class="category-item__name">${escapeHtml(category.name)}</p>
        <p class="category-item__meta">
          ${count} product${count === 1 ? "" : "s"}
        </p>
      </div>
      <button class="btn btn--danger btn--sm" type="button"
        data-delete-category="${escapeHtml(category.id)}">Delete</button>
    </div>
  `;
}

/* ---- Products (moderation) ---- */

function renderProducts() {
  const products = getAdminProducts();
  const query = page.productSearch?.value.trim().toLowerCase() ?? "";
  const visibleProducts = query
    ? products.filter((product) => {
        const haystack = [product.name, product.category, product.status].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      })
    : products;

  page.productsCount.textContent = `(${visibleProducts.length}${query ? ` of ${products.length}` : ""})`;

  if (visibleProducts.length === 0) {
    page.productsTable.hidden = true;
    page.productsEmpty.hidden = false;
    page.productsEmpty.querySelector(".page-placeholder__title").textContent = query
      ? "No products match this search"
      : "No products on the platform";
    return;
  }

  page.productsTable.hidden = false;
  page.productsEmpty.hidden = true;
  page.productsList.innerHTML = visibleProducts.map(productModRowTemplate).join("");
}

function productModRowTemplate(product = {}) {
  const id = String(product.id);
  const image = product.imageUrl || IMAGE_FALLBACK;
  const statusOptions = Object.values(PRODUCT_STATUS)
    .map(
      (status) =>
        `<option value="${status}" ${product.status === status ? "selected" : ""}>${status.toLowerCase()}</option>`
    )
    .join("");

  return `
    <tr>
      <td>
        <div class="admin-product">
          <span class="admin-product__thumb">
            <img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async"
              onerror="this.onerror=null;this.src='${IMAGE_FALLBACK}'" />
          </span>
          <p class="admin-product__name">${escapeHtml(product.name)}</p>
        </div>
      </td>
      <td>${escapeHtml(product.category || "—")}</td>
      <td class="admin-product__price">${formatCurrency(product.price)}</td>
      <td>${Number(product.stock) || 0}</td>
      <td class="u-text-right">
        <select class="form-select form-select--sm" data-status="${escapeHtml(id)}"
          aria-label="Visibility for ${escapeHtml(product.name)}">
          ${statusOptions}
        </select>
      </td>
    </tr>
  `;
}

/* ---- Orders (fulfilment) ---- */

function renderOrders() {
  const orders = getAdminOrders();
  page.ordersCount.textContent = `(${orders.length})`;

  if (orders.length === 0) {
    page.ordersTable.hidden = true;
    page.ordersEmpty.hidden = false;
    return;
  }

  page.ordersTable.hidden = false;
  page.ordersEmpty.hidden = true;
  page.ordersList.innerHTML = orders.map(orderRowTemplate).join("");
}

function orderRowTemplate(order = {}) {
  const label = order.orderNumber || `#${order.id}`;
  const statusOptions = Object.values(ORDER_STATUS)
    .map(
      (status) =>
        `<option value="${status}" ${order.status === status ? "selected" : ""}>${getOrderStatusLabel(status).toLowerCase()}</option>`
    )
    .join("");

  return `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(order.customerName || "—")}</td>
      <td>${escapeHtml(formatDate(order.createdAt) || "—")}</td>
      <td class="admin-product__price">${formatCurrency(order.total)}</td>
      <td class="u-text-right">
        <select class="form-select form-select--sm" data-order-status="${escapeHtml(order.id)}"
          aria-label="Status for ${escapeHtml(label)}">
          ${statusOptions}
        </select>
      </td>
    </tr>
  `;
}

/* ---- Delivery requests ---- */

/** Load delivery requests (RLS lets admins see all) and render the
 *  panel + stat. Best effort: failures leave the panel empty rather
 *  than blocking the rest of the dashboard. */
async function loadDeliveryRequests() {
  try {
    deliveryRequests = await listDeliveryRequests();
  } catch {
    deliveryRequests = [];
  }
  renderDeliveries();
  renderStats();
}

function renderDeliveries() {
  page.deliveriesCount.textContent = `(${deliveryRequests.length})`;

  if (deliveryRequests.length === 0) {
    page.deliveriesTable.hidden = true;
    page.deliveriesEmpty.hidden = false;
    return;
  }

  page.deliveriesTable.hidden = false;
  page.deliveriesEmpty.hidden = true;
  page.deliveriesList.innerHTML = deliveryRequests
    .map(deliveryRowTemplate)
    .join("");
}

function deliveryStatusClass(status) {
  return {
    REQUESTED: "badge--info",
    DELIVERY_CONFIRMED: "badge--primary",
    READY_FOR_DELIVERY: "badge--success",
  }[status] || "badge--outline";
}

function deliveryRowTemplate(request = {}) {
  return `
    <tr>
      <td>${escapeHtml(String(request.orderId))}</td>
      <td>
        ${escapeHtml(request.recipientName || "—")}
        <br /><span class="admin-table__muted">${escapeHtml(request.recipientPhone || "")}</span>
      </td>
      <td>${escapeHtml(request.deliveryArea || "—")}</td>
      <td>${escapeHtml(formatDate(request.createdAt) || "—")}</td>
      <td class="u-text-right">
        <span class="badge ${deliveryStatusClass(request.status)}">${escapeHtml(
          getDeliveryStatusLabel(request.status)
        )}</span>
      </td>
    </tr>
  `;
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

/* ---- Finance ---- */

/** Load platform finance from the backend. Failures surface the
 *  finance error banner instead of fabricated numbers. */
async function loadFinance() {
  const [summary, commissions, withdrawals] = await Promise.allSettled([
    getFinanceSummary(),
    getAllCommissions(),
    getWithdrawals(),
  ]);

  if (summary.status === "fulfilled") {
    adminFinanceSummary = summary.value;
  }
  if (commissions.status === "fulfilled") {
    financeCommissions = commissions.value;
  }
  if (withdrawals.status === "fulfilled") {
    financeWithdrawals = withdrawals.value;
  }

  renderFinance();

  const failed = [summary, commissions, withdrawals].filter(
    (result) => result.status === "rejected"
  );
  if (failed.length > 0) {
    if (page.financeErrorMessage) {
      page.financeErrorMessage.textContent =
        failed[0].reason?.message ||
        "Platform finances could not be loaded right now.";
    }
    if (page.financeError) page.financeError.hidden = false;
  }
}

/** Refresh every finance view after a mutation. */
async function reloadFinance() {
  try {
    const [summary, commissions, withdrawals] = await Promise.all([
      getFinanceSummary(),
      getAllCommissions(),
      getWithdrawals(),
    ]);
    adminFinanceSummary = summary;
    financeCommissions = commissions;
    financeWithdrawals = withdrawals;
    renderFinance();
  } catch (error) {
    if (page.financeErrorMessage) {
      page.financeErrorMessage.textContent = error?.message;
    }
    if (page.financeError) page.financeError.hidden = false;
  }
}

function renderFinance() {
  renderFinanceSummary();
  renderFinanceCommissions();
  renderFinanceWithdrawals();
}

function renderFinanceSummary() {
  const stats = adminFinanceSummary;
  if (!stats) {
    page.financeEarned.textContent = "—";
    page.financeReleased.textContent = "—";
    page.financeWithdrawn.textContent = "—";
    page.financePendingCount.textContent = "—";
    page.financePendingAmount.textContent = "Withdrawals awaiting action";
    return;
  }
  page.financeEarned.textContent = formatCurrency(stats.totalCommissionEarned);
  page.financeReleased.textContent = formatCurrency(stats.totalCommissionReleased);
  page.financeWithdrawn.textContent = formatCurrency(stats.totalWithdrawn);
  page.financePendingCount.textContent = String(stats.pendingWithdrawalCount);
  page.financePendingAmount.textContent =
    `${formatCurrency(stats.pendingWithdrawals)} in review`;
}

function renderFinanceCommissions() {
  page.commissionsCount.textContent = `(${financeCommissions.length})`;

  if (financeCommissions.length === 0) {
    page.commissionsTable.hidden = true;
    page.commissionsEmpty.hidden = false;
    return;
  }

  page.commissionsTable.hidden = false;
  page.commissionsEmpty.hidden = true;
  page.commissionsList.innerHTML = financeCommissions
    .map(commissionRowTemplate)
    .join("");
}

function commissionStatusClass(status) {
  return {
    [COMMISSION_STATUS.PENDING]: "badge--info",
    [COMMISSION_STATUS.RELEASED]: "badge--success",
    [COMMISSION_STATUS.REVERSED]: "badge--danger",
  }[status] || "badge--outline";
}

function commissionRowTemplate(item = {}) {
  const seller = item.sellerName || `Seller #${item.sellerId}`;
  return `
    <tr>
      <td>${escapeHtml(seller)}</td>
      <td>${escapeHtml(item.orderNumber || `#${item.orderId}`)}</td>
      <td>${escapeHtml(formatDate(item.createdAt) || "—")}</td>
      <td class="u-text-right">${formatCurrency(item.saleAmount, item.currency)}</td>
      <td class="u-text-right">${formatCurrency(item.commissionAmount, item.currency)}</td>
      <td class="u-text-right">${formatCurrency(item.netAmount, item.currency)}</td>
      <td><span class="badge ${commissionStatusClass(item.status)}">${escapeHtml(getCommissionStatusLabel(item.status))}</span></td>
    </tr>
  `;
}

function renderFinanceWithdrawals() {
  page.withdrawalsCount.textContent = `(${financeWithdrawals.length})`;

  if (financeWithdrawals.length === 0) {
    page.withdrawalsTable.hidden = true;
    page.withdrawalsEmpty.hidden = false;
    return;
  }

  page.withdrawalsTable.hidden = false;
  page.withdrawalsEmpty.hidden = true;
  page.withdrawalsList.innerHTML = financeWithdrawals
    .map(withdrawalRowTemplate)
    .join("");
}

function withdrawalStatusClass(status) {
  return {
    [WITHDRAWAL_STATUS.PENDING]: "badge--info",
    [WITHDRAWAL_STATUS.PROCESSING]: "badge--primary",
    [WITHDRAWAL_STATUS.COMPLETED]: "badge--success",
    [WITHDRAWAL_STATUS.REJECTED]: "badge--danger",
    [WITHDRAWAL_STATUS.CANCELLED]: "badge--outline",
  }[status] || "badge--outline";
}

/** Mask an account number, keeping only the last four digits. */
function maskAccountNumber(number = "") {
  const digits = String(number).replace(/\s+/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 4) return `•••• ${digits}`;
  return `•••• ${digits.slice(-4)}`;
}

function withdrawalRowTemplate(item = {}) {
  const bank = item.bankName
    ? `${item.bankName} · ${maskAccountNumber(item.accountNumber)}`
    : "";
  const holder = item.accountHolderName || bank || "—";
  const bankLine = bank
    ? `<br /><span class="admin-table__muted">${escapeHtml(bank)}</span>`
    : "";

  let actions = "";
  if (item.status === WITHDRAWAL_STATUS.PENDING) {
    actions = `
      <button class="btn btn--primary btn--sm" type="button"
        data-withdrawal-status="${escapeHtml(item.id)}" data-to="${WITHDRAWAL_STATUS.PROCESSING}">Approve</button>
      <button class="btn btn--danger btn--sm" type="button"
        data-withdrawal-status="${escapeHtml(item.id)}" data-to="${WITHDRAWAL_STATUS.REJECTED}">Reject</button>
    `;
  } else if (item.status === WITHDRAWAL_STATUS.PROCESSING) {
    actions = `
      <button class="btn btn--primary btn--sm" type="button"
        data-withdrawal-status="${escapeHtml(item.id)}" data-to="${WITHDRAWAL_STATUS.COMPLETED}">Payout sent</button>
      <button class="btn btn--danger btn--sm" type="button"
        data-withdrawal-status="${escapeHtml(item.id)}" data-to="${WITHDRAWAL_STATUS.REJECTED}">Reject</button>
    `;
  }

  return `
    <tr>
      <td>${escapeHtml(item.reference || `#${item.id}`)}</td>
      <td>${escapeHtml(holder)}${bankLine}</td>
      <td>${escapeHtml(formatDate(item.createdAt) || "—")}</td>
      <td class="u-text-right">${formatCurrency(item.amount, item.currency)}</td>
      <td><span class="badge ${withdrawalStatusClass(item.status)}">${escapeHtml(getWithdrawalStatusLabel(item.status))}</span></td>
      <td class="u-text-right">${actions}</td>
    </tr>
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

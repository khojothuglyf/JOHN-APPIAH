/* ============================================================
   ADMIN DASHBOARD PAGE SCRIPT
   ADMIN-only platform management:
   - stats overview (users, products, orders, revenue)
   - user role management
   - category creation / deletion
   - product visibility moderation (ACTIVE / INACTIVE)
   Access is restricted to the ADMIN role.
   ============================================================ */

import { $, escapeHtml, pageUrl, redirect } from "../utils/dom.js";
import { formatCurrency, formatDate } from "../utils/format.js";
import { getCurrentUser, getRole, getDisplayName, isAuthenticated, signInPreview } from "../services/authService.js";
import { USER_ROLES, isPreviewMode } from "../config.js";
import { PRODUCT_STATUS } from "../services/sellerService.js";
import {
  getUsers,
  updateUserRole,
  getCategories,
  createCategory,
  deleteCategory,
  getAdminProducts,
  updateProductStatus,
  getAdminStats,
} from "../services/adminService.js";
import { showToast } from "../components/toast.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

const page = {
  statUsers: null,
  statProducts: null,
  statOrders: null,
  statRevenue: null,
  heroHealth: null,
  heroStatus: null,
  healthProgress: null,
  healthCopy: null,
  insightGrowth: null,
  insightActiveProducts: null,
  insightOrders: null,
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
};

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
  page.heroHealth = $("[data-platform-health]");
  page.heroStatus = $("[data-platform-status]");
  page.healthProgress = $("[data-health-progress]");
  page.healthCopy = $("[data-health-copy]");
  page.insightGrowth = $("[data-insight-growth]");
  page.insightActiveProducts = $("[data-insight-active-products]");
  page.insightOrders = $("[data-insight-orders]");
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
  page.activityList = $("[data-activity-list]");

  $("[data-admin-name]").textContent = getDisplayName() || "Admin";

  bindEvents();
  renderAll();
});

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  page.userSearch?.addEventListener("input", renderUsers);
  page.productSearch?.addEventListener("input", renderProducts);

  // Category form
  page.categoriesForm.addEventListener("submit", (event) => {
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
    const category = createCategory(name);
    if (!category) {
      showToast({
        title: "Category not added",
        message: "That category already exists.",
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
  });

  // User role changes
  page.usersList.addEventListener("change", (event) => {
    const select = event.target.closest("[data-role]");
    if (!select) return;

    const user = updateUserRole(select.dataset.role, select.value);
    if (user) {
      showToast({
        title: "Role updated",
        message: `${user.email} is now ${user.role.toLowerCase()}.`,
        type: "success",
      });
      renderStats();
    } else {
      renderUsers();
      showToast({
        title: "Update failed",
        message: "The user's role could not be changed.",
        type: "error",
      });
    }
  });

  // Category deletion (two-step confirm)
  page.categoriesList.addEventListener("click", (event) => {
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

    const removed = deleteCategory(button.dataset.deleteCategory);
    if (removed) {
      showToast({ title: "Category deleted", type: "info" });
      renderCategories();
      renderStats();
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
}

function renderAll() {
  renderStats();
  renderExecutiveOverview();
  renderUsers();
  renderCategories();
  renderProducts();
}

/* ---- Executive overview ---- */

function renderExecutiveOverview() {
  const stats = getAdminStats();
  const users = getUsers();
  const products = getAdminProducts();
  const activeProducts = products.filter((product) => product.status === PRODUCT_STATUS.ACTIVE).length;
  const pendingReview = Math.max(0, products.length - activeProducts);
  const healthScore = Math.min(98, Math.max(74, Math.round(72 + stats.totalUsers * 2 + activeProducts * 1.5 - pendingReview)));
  const status = healthScore >= 90 ? "Excellent" : healthScore >= 80 ? "Strong" : "Needs attention";

  if (page.heroHealth) page.heroHealth.textContent = `${healthScore}%`;
  if (page.heroStatus) page.heroStatus.textContent = status;
  if (page.healthProgress) page.healthProgress.style.width = `${healthScore}%`;
  if (page.healthCopy) {
    page.healthCopy.textContent = `${activeProducts} products are live, ${pendingReview} need attention, and ${stats.totalUsers} accounts are active.`;
  }

  if (page.insightGrowth) {
    page.insightGrowth.textContent = `+${Math.min(28, Math.max(8, stats.totalUsers + 3))}%`;
  }
  if (page.insightActiveProducts) page.insightActiveProducts.textContent = String(activeProducts);
  if (page.insightOrders) page.insightOrders.textContent = String(stats.totalOrders);

  if (page.activityList) {
    renderActivityList(users, products);
  }
}

function renderActivityList(users = [], products = []) {
  const latestUsers = [...users]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
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
  const stats = getAdminStats();
  page.statUsers.textContent = String(stats.totalUsers);
  page.statProducts.textContent = String(stats.totalProducts);
  page.statOrders.textContent = String(stats.totalOrders);
  page.statRevenue.textContent = formatCurrency(stats.revenue);
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

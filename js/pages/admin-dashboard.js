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
import { getCurrentUser, getRole, getDisplayName, isAuthenticated } from "../services/authService.js";
import { USER_ROLES } from "../config.js";
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
  usersTable: null,
  usersList: null,
  usersEmpty: null,
  usersCount: null,
  categoriesForm: null,
  categoriesList: null,
  categoriesEmpty: null,
  categoriesCount: null,
  productsTable: null,
  productsList: null,
  productsEmpty: null,
  productsCount: null,
};

document.addEventListener("DOMContentLoaded", () => {
  if (!isAuthenticated()) {
    redirect("pages/login.html", { redirect: "pages/admin-dashboard.html" });
    return;
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
  page.usersTable = $("[data-users-table]");
  page.usersList = $("[data-users-list]");
  page.usersEmpty = $("[data-users-empty]");
  page.usersCount = $("[data-users-count]");
  page.categoriesForm = $("[data-category-form]");
  page.categoriesList = $("[data-categories-list]");
  page.categoriesEmpty = $("[data-categories-empty]");
  page.categoriesCount = $("[data-categories-count]");
  page.productsTable = $("[data-products-table]");
  page.productsList = $("[data-products-list]");
  page.productsEmpty = $("[data-products-empty]");
  page.productsCount = $("[data-products-count]");

  $("[data-admin-name]").textContent = getDisplayName() || "Admin";

  bindEvents();
  renderAll();
});

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

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
  page.productsList.addEventListener("change", (event) => {
    const select = event.target.closest("[data-status]");
    if (!select) return;

    const product = updateProductStatus(select.dataset.status, select.value);
    if (product) {
      showToast({
        title: "Visibility updated",
        message: `${product.name} is now ${product.status.toLowerCase()}.`,
        type: "success",
      });
    } else {
      renderProducts();
      showToast({
        title: "Update failed",
        message: "The product could not be updated.",
        type: "error",
      });
    }
  });
}

function renderAll() {
  renderStats();
  renderUsers();
  renderCategories();
  renderProducts();
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
  page.usersCount.textContent = `(${users.length})`;

  if (users.length === 0) {
    page.usersTable.hidden = true;
    page.usersEmpty.hidden = false;
    return;
  }

  page.usersTable.hidden = false;
  page.usersEmpty.hidden = true;

  const currentId = String(getCurrentUser()?.id ?? "");
  page.usersList.innerHTML = users
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
  page.productsCount.textContent = `(${products.length})`;

  if (products.length === 0) {
    page.productsTable.hidden = true;
    page.productsEmpty.hidden = false;
    return;
  }

  page.productsTable.hidden = false;
  page.productsEmpty.hidden = true;
  page.productsList.innerHTML = products.map(productModRowTemplate).join("");
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

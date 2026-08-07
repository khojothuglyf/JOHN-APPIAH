/* ============================================================
   ADMIN SERVICE - TEMPORARY LOCAL ADMIN STORE
   ============================================================
   Powers the admin dashboard: platform users & role management,
   categories, product moderation and stats. Users and categories
   are seeded locally; products come from the seller catalogue
   store. Phase 9+ swaps the internals with the backend admin API
   while keeping the same surface.

   Backend contract (verified against CategoryController + OrderController):
   - GET    /api/v1/categories            -> ApiResponse<CategoryResponse[]>
   - POST   /api/v1/categories            (ADMIN, { name, description })
   - PUT    /api/v1/categories/{id}       (ADMIN, { name, description })
   - DELETE /api/v1/categories/{id}       (ADMIN)
   - GET    /api/v1/orders/admin          (ADMIN, paged)
   - GET    /api/v1/products/mine         (ADMIN, paged)
   - PUT    /api/v1/products/{id}         (moderation via ProductRequest.status)
   (users, role management and stats aggregates: planned - no backend
    endpoints yet)

   User shape: { id, firstName, lastName, email, role, createdAt }
   Category shape: { id, name, description, parentId, subcategories }
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS, USER_ROLES, DEFAULT_CATEGORIES } from "../config.js";
import { getOrders, ORDER_STATUS } from "./ordersService.js";
import {
  PRODUCT_STATUS,
  getSellerProducts,
  updateProduct,
} from "./sellerService.js";

/** Demo platform users shown until the backend is deployed. */
const SEED_USERS = [
  {
    id: 1,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@marketplace.dev",
    role: USER_ROLES.ADMIN,
    createdAt: "2026-01-05T09:00:00.000Z",
  },
  {
    id: 2,
    firstName: "Grace",
    lastName: "Hopper",
    email: "grace@marketplace.dev",
    role: USER_ROLES.SELLER,
    createdAt: "2026-02-12T14:30:00.000Z",
  },
  {
    id: 3,
    firstName: "Alan",
    lastName: "Turing",
    email: "alan@marketplace.dev",
    role: USER_ROLES.SELLER,
    createdAt: "2026-03-01T10:15:00.000Z",
  },
  {
    id: 4,
    firstName: "Margaret",
    lastName: "Hamilton",
    email: "margaret@marketplace.dev",
    role: USER_ROLES.CUSTOMER,
    createdAt: "2026-04-18T16:45:00.000Z",
  },
  {
    id: 5,
    firstName: "Katherine",
    lastName: "Johnson",
    email: "katherine@marketplace.dev",
    role: USER_ROLES.CUSTOMER,
    createdAt: "2026-05-22T08:00:00.000Z",
  },
];

function getStoredUsers() {
  const stored = storage.get(STORAGE_KEYS.adminUsers);
  if (stored === null) {
    storage.set(STORAGE_KEYS.adminUsers, SEED_USERS);
    return [...SEED_USERS];
  }
  return Array.isArray(stored) ? stored : [];
}

function getStoredCategories() {
  const stored = storage.get(STORAGE_KEYS.adminCategories);
  if (stored === null) {
    const seeded = DEFAULT_CATEGORIES.map((name, index) => ({
      id: index + 1,
      name,
    }));
    storage.set(STORAGE_KEYS.adminCategories, seeded);
    return seeded;
  }
  return Array.isArray(stored) ? stored : [];
}

/* ---- Users ---- */

/** All platform users. */
export function getUsers() {
  return getStoredUsers();
}

/** Change a user's role. Returns the updated user or null. */
export function updateUserRole(id, role) {
  if (!Object.values(USER_ROLES).includes(role)) return null;

  const users = getStoredUsers();
  let updated = null;
  const next = users.map((user) => {
    if (String(user.id) !== String(id)) return user;
    updated = { ...user, role };
    return updated;
  });

  if (!updated) return null;
  storage.set(STORAGE_KEYS.adminUsers, next);
  return updated;
}

/* ---- Categories ---- */

/** All categories with live product counts. */
export function getCategories() {
  const products = getSellerProducts();
  return getStoredCategories().map((category) => ({
    ...category,
    productCount: products.filter(
      (product) => String(product.category) === String(category.name)
    ).length,
  }));
}

/** Create a category. Returns it or null when the name is blank. */
export function createCategory(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return null;

  const categories = getStoredCategories();
  if (categories.some((c) => String(c.name).toLowerCase() === clean.toLowerCase())) {
    return null;
  }

  const id =
    categories.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1;
  const category = { id, name: clean };
  categories.push(category);
  storage.set(STORAGE_KEYS.adminCategories, categories);
  return category;
}

/** Delete a category. Returns true when something was removed. */
export function deleteCategory(id) {
  const before = getStoredCategories().length;
  storage.set(
    STORAGE_KEYS.adminCategories,
    getStoredCategories().filter((c) => String(c.id) !== String(id))
  );
  return getStoredCategories().length < before;
}

/* ---- Products (moderation) ---- */

/** All products across the platform (seller catalogue). */
export function getAdminProducts() {
  return getSellerProducts();
}

/** Toggle a product between ACTIVE and INACTIVE. */
export function updateProductStatus(id, status) {
  if (!Object.values(PRODUCT_STATUS).includes(status)) return null;
  return updateProduct(id, { status });
}

/* ---- Stats ---- */

/** Platform-wide summary numbers. */
export function getAdminStats() {
  const orders = getOrders();
  const revenue = orders
    .filter((order) => order.status !== ORDER_STATUS.CANCELLED)
    .reduce((total, order) => total + (Number(order.total) || 0), 0);

  return {
    totalUsers: getStoredUsers().length,
    totalProducts: getSellerProducts().length,
    totalOrders: orders.length,
    revenue,
  };
}

/* ============================================================
   ADMIN SERVICE - SPRING BOOT BACKEND (via http.js)
   ============================================================
   Powers the admin dashboard: platform users & role management,
   categories, order fulfilment, product moderation and platform
   analytics against the existing Java / Spring Boot backend
   through the shared HTTP client (http.js).

   Security:
   - The authenticated Supabase access token is sent as
     `Authorization: Bearer ...` by http.js and validated by the
     backend's Supabase JWT bridge - there is no second auth system.
   - Backend Spring Security (@PreAuthorize("hasRole('ADMIN')")) is
     authoritative for every ADMIN operation. The frontend only
     gates the UI on the signed-in session role and never sends a
     trusted id or role from an unauthorized client.
   - updateUserRole() keeps the backend's protection against
     dangerous self-demotion by refusing to change your own role
     (the backend enforces the same rule server-side).

   Role reconciliation:
   - The backend RoleName is ADMIN | SELLER | CUSTOMER while the UI
     uses USER_ROLES = BUYER | SELLER | ADMIN. The service maps
     CUSTOMER -> BUYER inbound and BUYER -> CUSTOMER outbound so the
     page never sees a raw backend role and never sends one.

   Backend contract (verified against UserController,
   CategoryController, OrderController, AnalyticsController):
   - GET  /api/v1/admin/users                 (ADMIN, paged)
         -> ApiResponse<PagedResponse<UserResponse>>
   - PUT  /api/v1/admin/users/{id}/role       (ADMIN)
         REQUEST:  ChangeRoleRequest { roleName }
         RESPONSE: ApiResponse<UserResponse>
   - GET  /api/v1/categories (public) / POST / PUT /{id} / DELETE
         CategoryRequest { name, description, parentId }
         -> ApiResponse<List<CategoryResponse>> / <CategoryResponse>
   - GET  /api/v1/orders/admin                (ADMIN, paged)
   - PUT  /api/v1/orders/{id}/status   { status }
   - GET  /api/v1/admin/analytics/summary     (ADMIN)
   - GET  /api/v1/admin/analytics/top-products?limit=N (ADMIN)
   - GET  /api/v1/admin/analytics/sales-by-category   (ADMIN)
   - GET  /api/v1/admin/analytics/revenue-timeline?days=N (ADMIN)
   - PUT  /api/v1/products/{id}               (product moderation via
         ProductRequest.status - the same backend operation the
         seller dashboard uses)

   UserResponse: { id, firstName, lastName, email, role }
   CategoryResponse: { id, name, description, parentId,
     subcategories, createdAt, updatedAt }
   AdminSummaryResponse: { totalUsers, totalSellers, totalCustomers,
     totalProducts, activeProducts, lowStockProducts, totalOrders,
     pendingOrders, shippedOrders, deliveredOrders, cancelledOrders,
     totalReviews, completedPayments, totalRevenue }

   Availability: reads keep a local cache (STORAGE_KEYS.adminUsers /
   STORAGE_KEYS.adminCategories) so the dashboard renders instantly
   from previously synced data. There is NO seed/demo data and the
   cache is NEVER authoritative - a failed backend call surfaces an
   error instead of fabricating or seeding records.
   ============================================================ */

import { ApiError, http } from "../utils/http.js";
import { storage } from "../utils/storage.js";
import {
  API_ENDPOINTS,
  endpointPath,
  STORAGE_KEYS,
  USER_ROLES,
} from "../config.js";
import { getCurrentUser } from "./authService.js";
import {
  getOrders,
  syncOrders,
  updateOrderStatus,
} from "./ordersService.js";
import {
  PRODUCT_STATUS,
  getSellerProducts,
  syncSellerProducts,
  updateProduct,
} from "./sellerService.js";

/** Number of users pulled from the backend per sync. */
const USERS_SYNC_SIZE = 100;

/** UI role -> backend RoleName (CUSTOMER is the backend's buyer). */
const ROLE_TO_BACKEND = {
  [USER_ROLES.BUYER]: "CUSTOMER",
  [USER_ROLES.SELLER]: "SELLER",
  [USER_ROLES.ADMIN]: "ADMIN",
};

/** Backend RoleName -> UI role. */
const ROLE_FROM_BACKEND = {
  CUSTOMER: USER_ROLES.BUYER,
  SELLER: USER_ROLES.SELLER,
  ADMIN: USER_ROLES.ADMIN,
};

/** True when a signed-in session exists (even a token-less preview). */
function isSignedIn() {
  return Boolean(getCurrentUser());
}

/** Guard every ADMIN operation behind an ADMIN session. */
function requireAdmin() {
  if (!isSignedIn()) {
    throw new ApiError(401, "Please sign in to manage the platform.");
  }
  if (getCurrentUser()?.role !== USER_ROLES.ADMIN) {
    throw new ApiError(403, "Administrator access is required.");
  }
}

/* ------------------------------------------------------------
   Response mapping (backend <-> UI shapes)
   ------------------------------------------------------------ */

/** Map a backend UserResponse into the UI user shape. */
function mapUser(user = {}) {
  return {
    id: user.id,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || "",
    role: ROLE_FROM_BACKEND[user.role] || USER_ROLES.BUYER,
    createdAt: user.createdAt || null,
  };
}

/** UI role -> backend RoleName (null when it is not a valid role). */
function toBackendRole(role) {
  return ROLE_TO_BACKEND[role] || null;
}

/** Map a CategoryResponse into the UI category shape. */
function mapCategory(category = {}) {
  return {
    id: category.id,
    name: category.name || "",
    description: category.description || "",
    parentId: category.parentId ?? null,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

/** Flatten the backend's nested CategoryResponse list. */
function flattenCategories(list = []) {
  const flat = [];
  const walk = (items) => {
    (Array.isArray(items) ? items : []).forEach((category) => {
      flat.push(mapCategory(category));
      if (Array.isArray(category.subcategories) && category.subcategories.length) {
        walk(category.subcategories);
      }
    });
  };
  walk(list);
  return flat;
}

/** Map a CategorySalesResponse. */
function mapCategorySales(item = {}) {
  return {
    categoryId: item.categoryId,
    categoryName: item.categoryName || "",
    quantitySold: Number(item.quantitySold) || 0,
    revenue: Number(item.revenue) || 0,
  };
}

/** Map a TopProductResponse. */
function mapTopProduct(item = {}) {
  return {
    productId: item.productId,
    name: item.productName || "",
    quantitySold: Number(item.quantitySold) || 0,
    revenue: Number(item.revenue) || 0,
  };
}

/** Map a RevenuePointResponse. */
function mapRevenuePoint(point = {}) {
  return {
    date: point.date,
    amount: Number(point.amount) || 0,
  };
}

/** Map an AdminSummaryResponse. */
function mapSummary(data = {}) {
  return {
    totalUsers: Number(data.totalUsers) || 0,
    totalSellers: Number(data.totalSellers) || 0,
    totalCustomers: Number(data.totalCustomers) || 0,
    totalProducts: Number(data.totalProducts) || 0,
    activeProducts: Number(data.activeProducts) || 0,
    lowStockProducts: Number(data.lowStockProducts) || 0,
    totalOrders: Number(data.totalOrders) || 0,
    pendingOrders: Number(data.pendingOrders) || 0,
    shippedOrders: Number(data.shippedOrders) || 0,
    deliveredOrders: Number(data.deliveredOrders) || 0,
    cancelledOrders: Number(data.cancelledOrders) || 0,
    totalReviews: Number(data.totalReviews) || 0,
    completedPayments: Number(data.completedPayments) || 0,
    totalRevenue: Number(data.totalRevenue) || 0,
  };
}

/* ------------------------------------------------------------
   Users & role management
   ------------------------------------------------------------ */

/** All cached platform users, in sync order. Never authoritative. */
export function getUsers() {
  const stored = storage.get(STORAGE_KEYS.adminUsers);
  return Array.isArray(stored) ? stored : [];
}

/** Replace the cached user list. */
function setUsersCache(users) {
  storage.set(STORAGE_KEYS.adminUsers, users);
}

/** Insert or replace a single user in the cache. */
function upsertUserCache(user) {
  const users = getUsers();
  const index = users.findIndex(
    (entry) => String(entry.id) === String(user.id)
  );
  if (index === -1) users.push(user);
  else users[index] = user;
  setUsersCache(users);
  return user;
}

/**
 * Fetch the platform users from the backend into the local cache.
 * Backend: GET /api/v1/admin/users (ADMIN). Resolves the mapped
 * list. Throws when the session is not an admin or the backend
 * rejects - the cache is never treated as authoritative.
 */
export async function syncUsers({ page = 0, size = USERS_SYNC_SIZE } = {}) {
  requireAdmin();
  const envelope = await http.get(API_ENDPOINTS.admin.users, {
    params: { page, size },
  });
  const content = Array.isArray(envelope?.data?.content)
    ? envelope.data.content
    : [];
  const mapped = content.map(mapUser);
  setUsersCache(mapped);
  return mapped;
}

/**
 * Change a user's role via the backend.
 * Backend: PUT /api/v1/admin/users/{id}/role with { roleName }.
 * Resolves the mapped (cached) user, or null when the role value is
 * invalid (no request is made). Changing your own role is rejected
 * locally to mirror the backend's self-demotion protection. Backend
 * errors (permissions, unknown user/role) throw.
 */
export async function updateUserRole(id, role) {
  if (!Object.values(USER_ROLES).includes(role)) return null;
  requireAdmin();
  if (String(id) === String(getCurrentUser()?.id)) {
    throw new ApiError(400, "You cannot change your own role");
  }
  const envelope = await http.put(
    endpointPath(API_ENDPOINTS.admin.updateUserRole, { id }),
    { roleName: toBackendRole(role) }
  );
  const user = mapUser(envelope?.data);
  upsertUserCache(user);
  return user;
}

/* ------------------------------------------------------------
   Categories (backend /categories CRUD)
   ------------------------------------------------------------ */

/** Cached categories (no product counts). Never authoritative. */
function getCategoriesCache() {
  const stored = storage.get(STORAGE_KEYS.adminCategories);
  return Array.isArray(stored) ? stored : [];
}

/** Replace the cached category list. */
function setCategoriesCache(categories) {
  storage.set(STORAGE_KEYS.adminCategories, categories);
}

/**
 * All cached categories with live product counts (derived from the
 * backend product catalogue, never stored).
 *
 * CATEGORY SOURCE OF TRUTH: the storefront "Shop by Category" nav
 * reads the Supabase `categories` table (categoryService.js) while
 * the backend manages its own categories. There is NO automatic
 * sync between the two stores. A category created/renamed here only
 * exists in the backend catalogue and will NOT appear in the
 * storefront navigation until it is mirrored in Supabase. This is a
 * known synchronization gap, reported rather than silently bridged.
 */
export function getCategories() {
  const products = getSellerProducts();
  return getCategoriesCache().map((category) => ({
    ...category,
    productCount: products.filter(
      (product) =>
        (product.categoryId != null &&
          String(product.categoryId) === String(category.id)) ||
        String(product.category || "") === String(category.name)
    ).length,
  }));
}

/**
 * Fetch categories from the backend into the local cache.
 * Backend: GET /api/v1/categories (public list). The nested
 * response is flattened for the dashboard.
 */
export async function syncCategories() {
  requireAdmin();
  const envelope = await http.get(API_ENDPOINTS.categories.list);
  const flat = flattenCategories(envelope?.data);
  setCategoriesCache(flat);
  return flat;
}

/**
 * Public read of the backend category list.
 * Backend: GET /api/v1/categories (public). Unlike syncCategories()
 * this does NOT require an ADMIN session and does NOT touch the
 * admin cache - it exists so the seller product form can resolve
 * the Spring Boot category id for a storefront (Supabase) category
 * by name. The nested response is flattened for the caller.
 */
export async function fetchCatalogCategories() {
  const envelope = await http.get(API_ENDPOINTS.categories.list);
  return flattenCategories(envelope?.data);
}

/**
 * Create a category in the backend.
 * Backend: POST /api/v1/categories (ADMIN) with { name, description }.
 * Resolves the mapped backend category (cached). Returns null when
 * the name is blank (no request is made). Backend rejections
 * (duplicate name, permissions) throw.
 */
export async function createCategory(name, description = "") {
  const clean = String(name ?? "").trim();
  if (!clean) return null;
  requireAdmin();
  const envelope = await http.post(API_ENDPOINTS.admin.createCategory, {
    name: clean,
    description: String(description ?? "").trim(),
  });
  const category = mapCategory(envelope?.data);
  setCategoriesCache([...getCategoriesCache(), category]);
  return category;
}

/**
 * Rename / update a category in the backend.
 * Backend: PUT /api/v1/categories/{id} (ADMIN). Resolves the mapped
 * backend category (cached). Returns null when the name is blank.
 * Backend rejections throw.
 */
export async function updateCategory(id, { name, description = "" } = {}) {
  const clean = String(name ?? "").trim();
  if (!clean) return null;
  requireAdmin();
  const envelope = await http.put(
    endpointPath(API_ENDPOINTS.admin.updateCategory, { id }),
    { name: clean, description: String(description ?? "").trim() }
  );
  const category = mapCategory(envelope?.data);
  setCategoriesCache(
    getCategoriesCache().map((entry) =>
      String(entry.id) === String(id) ? category : entry
    )
  );
  return category;
}

/**
 * Delete a category in the backend.
 * Backend: DELETE /api/v1/categories/{id} (ADMIN). Resolves true on
 * success (the category is dropped from the cache). Backend
 * rejections (e.g. category in use) throw.
 */
export async function deleteCategory(id) {
  requireAdmin();
  await http.delete(endpointPath(API_ENDPOINTS.admin.deleteCategory, { id }));
  setCategoriesCache(
    getCategoriesCache().filter((entry) => String(entry.id) !== String(id))
  );
  return true;
}

/* ------------------------------------------------------------
   Orders (admin fulfilment, delegated to ordersService)
   ------------------------------------------------------------ */

/** All cached platform orders (backend-synced, newest first). */
export function getAdminOrders() {
  return getOrders();
}

/** Refresh the platform order list from GET /api/v1/orders/admin. */
export function syncAdminOrders(options = {}) {
  return syncOrders({ scope: "admin", throwOnError: true, ...options });
}

/** Advance an order's status via the backend (see ordersService). */
export function updateAdminOrderStatus(orderId, status) {
  return updateOrderStatus(orderId, status);
}

/* ------------------------------------------------------------
   Products (moderation)
   ------------------------------------------------------------ */

/** All cached products on the platform (backend /products/mine). */
export function getAdminProducts() {
  return getSellerProducts();
}

/** Refresh the moderation list from GET /api/v1/products/mine. For
 *  an ADMIN principal the backend returns the platform catalogue. */
export function syncAdminProducts(options = {}) {
  return syncSellerProducts(options);
}

/**
 * Toggle a product between ACTIVE and INACTIVE. Backend:
 * PUT /api/v1/products/{id} with { status } (the same authoritative
 * operation the seller dashboard uses). Resolves the mapped backend
 * product, or null when the status value is invalid. Backend errors
 * reject - no local product is fabricated.
 */
export function updateProductStatus(id, status) {
  if (!Object.values(PRODUCT_STATUS).includes(status)) return null;
  return updateProduct(id, { status });
}

/* ------------------------------------------------------------
   Platform analytics (backend /admin/analytics)
   ------------------------------------------------------------ */

/**
 * Platform summary. Backend: GET /api/v1/admin/analytics/summary.
 * Resolves a mapped { totalUsers, totalSellers, totalCustomers,
 * totalProducts, activeProducts, lowStockProducts, totalOrders,
 * pendingOrders, shippedOrders, deliveredOrders, cancelledOrders,
 * totalReviews, completedPayments, totalRevenue }.
 */
export async function getAdminSummary() {
  requireAdmin();
  const envelope = await http.get(API_ENDPOINTS.admin.analytics.summary);
  return mapSummary(envelope?.data);
}

/** Top products by units sold. Backend: GET .../top-products?limit=N. */
export async function getTopProducts(limit = 10) {
  requireAdmin();
  const envelope = await http.get(
    API_ENDPOINTS.admin.analytics.topProducts,
    { params: { limit } }
  );
  return (Array.isArray(envelope?.data) ? envelope.data : []).map(mapTopProduct);
}

/** Sales grouped by category. Backend: GET .../sales-by-category. */
export async function getSalesByCategory() {
  requireAdmin();
  const envelope = await http.get(API_ENDPOINTS.admin.analytics.salesByCategory);
  return (Array.isArray(envelope?.data) ? envelope.data : []).map(mapCategorySales);
}

/** Daily revenue for the last N days. Backend: GET .../revenue-timeline. */
export async function getRevenueTimeline(days = 30) {
  requireAdmin();
  const envelope = await http.get(
    API_ENDPOINTS.admin.analytics.revenueTimeline,
    { params: { days } }
  );
  return (Array.isArray(envelope?.data) ? envelope.data : []).map(mapRevenuePoint);
}

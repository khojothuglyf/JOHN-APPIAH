/* ============================================================
   APP CONFIGURATION
   Central place for API base URL, endpoint registry, storage
   keys and user roles. Update API_BASE_URL once the Spring Boot
   backend is deployed; nothing else in the app should change.
   ============================================================ */

export const APP_NAME = "Marketplace";

/**
 * Base URL of the Spring Boot REST API.
 * @todo Point this at the deployed backend when available.
 */
export const API_BASE_URL = "http://localhost:8080/api/v1";

/**
 * Fill the {param} placeholders of an endpoint template with real
 * values, e.g. endpointPath("/products/{id}", { id: 7 }) -> "/products/7".
 */
export function endpointPath(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? encodeURIComponent(params[key]) : match
  );
}

/**
 * Endpoint registry - the ONLY source of truth for API paths.
 * Every service function maps to one of these entries so we
 * never invent endpoints at call sites.
 *
 * Paths marked "planned" are NOT implemented by the backend yet;
 * frontend surfaces that use them degrade gracefully (local
 * fallbacks or a retry message) until the backend adds them.
 *
 * Contract format used across the codebase:
 *   METHOD path -> request/response shapes are documented in
 *   the service function that consumes it.
 *
 * All backend responses are wrapped as ApiResponse:
 *   { success:boolean, message:string, data:T, timestamp:string }
 * Services unwrap `data` before returning to the pages.
 */
export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    // planned: no backend endpoints yet
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
    logout: "/auth/logout",
    me: "/auth/me",
  },
  products: {
    list: "/products",
    detail: "/products/{id}",
    mine: "/products/mine",
    create: "/products",
    update: "/products/{id}",
    delete: "/products/{id}",
    featured: "/products",
  },
  categories: {
    list: "/categories",
    detail: "/categories/{id}",
  },
  cart: {
    get: "/cart",
    addItem: "/cart/items",
    updateItem: "/cart/items/{id}",
    removeItem: "/cart/items/{id}",
    clear: "/cart",
  },
  wishlist: {
    get: "/wishlist",
    addItem: "/wishlist/{productId}",
    removeItem: "/wishlist/{productId}",
    check: "/wishlist/check/{productId}",
  },
  orders: {
    list: "/orders",
    detail: "/orders/{id}",
    create: "/orders",
    status: "/orders/{id}/status",
    sellerOrders: "/orders/seller",
    adminOrders: "/orders/admin",
  },
  users: {
    // planned: no backend endpoints yet
    profile: "/users/me",
    updateProfile: "/users/me",
    changePassword: "/users/me/password",
  },
  seller: {
    orders: "/orders/seller",
    updateOrderStatus: "/orders/{id}/status",
    // analytics family: /seller/analytics/summary, /top-products,
    // /sales-by-category, /revenue-timeline
    analytics: "/seller/analytics",
  },
  admin: {
    categories: "/categories",
    createCategory: "/categories",
    // analytics family: /admin/analytics/summary, /top-products,
    // /sales-by-category, /revenue-timeline
    analytics: "/admin/analytics",
    // planned: no backend endpoints yet
    users: "/admin/users",
    updateUserRole: "/admin/users/{id}/role",
    products: "/admin/products",
    updateProductStatus: "/admin/products/{id}/status",
  },
  contact: {
    // planned: no backend endpoints yet
    send: "/contact",
  },
};

/** Storage keys used for localStorage / sessionStorage. */
export const STORAGE_KEYS = {
  token: "marketplace.auth.token",
  user: "marketplace.auth.user",
  cart: "marketplace.cart",
  wishlist: "marketplace.wishlist",
  orders: "marketplace.orders",
  profile: "marketplace.profile",
  sellerProducts: "marketplace.seller.products",
  adminUsers: "marketplace.admin.users",
  adminCategories: "marketplace.admin.categories",
  theme: "marketplace.theme",
  lastVisitedCategory: "marketplace.last.category",
  categoriesCache: "marketplace.categories.cache",
};

/** Application user roles returned by the backend. */
export const USER_ROLES = {
  CUSTOMER: "CUSTOMER",
  SELLER: "SELLER",
  ADMIN: "ADMIN",
};

/** Default number of products per page. */
export const DEFAULT_PAGE_SIZE = 24;

/** Market / currency defaults (align with backend config). */
export const DEFAULT_CURRENCY = "USD";
export const DEFAULT_LOCALE = "en-US";

/** Shared category names used by the navbar until the category
 *  API is live (Phase 3+ will load these from the backend). */
export const DEFAULT_CATEGORIES = [
  "Electronics",
  "Fashion",
  "Home & Living",
  "Beauty & Health",
  "Sports & Outdoors",
  "Toys & Games",
  "Books",
];

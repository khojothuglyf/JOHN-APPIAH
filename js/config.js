/* ============================================================
   APP CONFIGURATION
   Central place for the Supabase credentials, endpoint registry,
   storage keys and user roles. The Supabase URL + anon key come
   from the generated api-config.js (rewritten at deploy time from
   the SUPABASE_URL / SUPABASE_ANON_KEY environment variables);
   nothing else in the app should change.
   ============================================================ */

export {
  API_BASE_URL,
  BACKEND_API_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "./api-config.js";

export const APP_NAME = "TradeSphere";

/**
 * True when the app is served from a local development origin
 * (file://, localhost or a loopback hostname). Used to gate dev-only
 * preview conveniences; always false on the deployed Netlify site.
 */
export function isPreviewMode() {
  if (typeof window === "undefined") return false;
  const { protocol, hostname } = window.location;
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  return protocol === "file:" || localHost;
}

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
 * Endpoint registry - the ONLY source of truth for the LEGACY Spring
 * REST API paths. The storefront services (auth, products, categories,
 * cart, wishlist) now talk to Supabase directly (see js/services/
 * supabase.js); this registry is kept for the still-local services
 * (orders, seller, admin, profile) that document their future REST
 * contract here, and is validated by the test suite.
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
    // planned: forgot/reset need backend endpoints
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
  payments: {
    create: "/payments/orders/{orderId}",
    byOrder: "/payments/orders/{orderId}",
    my: "/payments/my",
    refund: "/payments/{paymentId}/refund",
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
    analytics: {
      summary: "/seller/analytics/summary",
      topProducts: "/seller/analytics/top-products",
      salesByCategory: "/seller/analytics/sales-by-category",
      revenueTimeline: "/seller/analytics/revenue-timeline",
    },
  },
  admin: {
    categories: "/categories",
    createCategory: "/categories",
    updateCategory: "/categories/{id}",
    deleteCategory: "/categories/{id}",
    users: "/admin/users",
    updateUserRole: "/admin/users/{id}/role",
    analytics: {
      summary: "/admin/analytics/summary",
      topProducts: "/admin/analytics/top-products",
      salesByCategory: "/admin/analytics/sales-by-category",
      revenueTimeline: "/admin/analytics/revenue-timeline",
    },
  },
  contact: {
    // planned: no backend endpoints yet
    send: "/contact",
  },
};

/** Storage keys used for localStorage / sessionStorage. */
export const STORAGE_KEYS = {
  token: "marketplace.auth.token",
  refreshToken: "marketplace.auth.refresh",
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
  installHint: "marketplace.install.hint.seen",
};

/** Application user roles returned by the backend. */
export const USER_ROLES = {
  BUYER: "BUYER",
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

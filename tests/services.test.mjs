/* ============================================================
   PHASE 13 - SERVICE LAYER SMOKE TESTS
   Run: node tests/services.test.mjs

   Loads the real frontend service modules in Node with a mocked
   browser environment (window/localStorage/sessionStorage/fetch)
   and verifies:
   - response envelope unwrapping (ApiResponse { success, message,
     data, timestamp } -> data)
   - field mapping (accessToken -> token, categoryName -> category)
   - request shapes sent to the backend (roleName, not role)
   - enum alignment with the backend (OrderStatus, ProductStatus)
   - local fallback behaviour of the still-local services
     (cart, wishlist, orders, seller, admin, profile)
   - config endpoint registry consistency with the backend
   ============================================================ */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = (path) => "file:///" + join(ROOT, path).replace(/\\/g, "/");

/* ---- Browser shims (must exist before services import) ---- */
const makeStore = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
};

globalThis.window = {
  localStorage: makeStore(),
  sessionStorage: makeStore(),
  dispatchEvent: () => {},
  location: { assign: () => {}, pathname: "/index.html" },
};
globalThis.CustomEvent = class {
  constructor(type) {
    this.type = type;
  }
};

let failures = 0;
const check = (cond, label) => {
  if (cond) console.log(`  ok: ${label}`);
  else {
    failures++;
    console.error(`FAIL: ${label}`);
  }
};
const section = (name) => console.log(`\n[${name}]`);

const run = async () => {
  const config = await import(app("js/config.js"));

  /* ==========================================================
     [A] Config + endpoint registry vs the real backend
     ========================================================== */
  section("config");
  const { API_ENDPOINTS, endpointPath, USER_ROLES, STORAGE_KEYS } = config;
  check(endpointPath("/products/{id}", { id: 7 }) === "/products/7", "endpointPath fills {id}");
  check(endpointPath("/products/{id}", {}) === "/products/{id}", "endpointPath leaves missing params");
  check(USER_ROLES.CUSTOMER === "CUSTOMER" && USER_ROLES.SELLER === "SELLER" && USER_ROLES.ADMIN === "ADMIN", "USER_ROLES match backend roles");
  check(STORAGE_KEYS.token === "marketplace.auth.token", "auth token storage key stable");

  const exact = [
    ["auth.login", "/auth/login"],
    ["auth.register", "/auth/register"],
    ["products.list", "/products"],
    ["products.detail", "/products/{id}"],
    ["products.mine", "/products/mine"],
    ["categories.list", "/categories"],
    ["cart.get", "/cart"],
    ["cart.addItem", "/cart/items"],
    ["cart.updateItem", "/cart/items/{id}"],
    ["cart.removeItem", "/cart/items/{id}"],
    ["cart.clear", "/cart"],
    ["wishlist.get", "/wishlist"],
    ["wishlist.addItem", "/wishlist/{productId}"],
    ["wishlist.removeItem", "/wishlist/{productId}"],
    ["wishlist.check", "/wishlist/check/{productId}"],
    ["orders.list", "/orders"],
    ["orders.detail", "/orders/{id}"],
    ["orders.create", "/orders"],
    ["orders.status", "/orders/{id}/status"],
    ["orders.sellerOrders", "/orders/seller"],
    ["orders.adminOrders", "/orders/admin"],
    ["seller.orders", "/orders/seller"],
    ["seller.analytics", "/seller/analytics"],
    ["admin.analytics", "/admin/analytics"],
  ];
  for (const [key, path] of exact) {
    const entry = key.split(".").reduce((o, k) => o?.[k], API_ENDPOINTS);
    check(entry === path, `API_ENDPOINTS.${key} === ${path}`);
  }

  /* Backend endpoints that MUST NOT be advertised as live yet
     (no matching controller exists). */
  const stillPlanned = ["auth.logout", "auth.me", "users.profile", "users.updateProfile", "users.changePassword", "admin.users", "admin.updateUserRole", "admin.products", "admin.updateProductStatus", "contact.send"];
  for (const key of stillPlanned) {
    const entry = key.split(".").reduce((o, k) => o?.[k], API_ENDPOINTS);
    check(entry != null, `planned endpoint still declared: ${key}`);
  }

  /* ==========================================================
     [B] Auth service (backend-wired)
     ========================================================== */
  section("authService");
  const requests = [];
  const wrapped = (data, message = "ok") => ({ success: true, message, data, timestamp: "2026-08-07T00:00:00Z" });
  const PRODUCT = {
    id: 7, name: "Test Headphones", description: "ANC", price: 49.99,
    stock: 5, sku: "SKU-1", imageUrl: "", status: "ACTIVE",
    categoryId: 2, categoryName: "Electronics", sellerId: 1,
    sellerName: "Seller One", createdAt: "2026-08-07T00:00:00Z",
    updatedAt: "2026-08-07T00:00:00Z",
  };

  const route = (url, method, options) => {
    const { pathname } = new URL(url);
    const body = options?.body ? JSON.parse(options.body) : null;
    if (method === "POST" && pathname.endsWith("/auth/login")) {
      return wrapped({ accessToken: "TOK-1", tokenType: "Bearer", expiresIn: 86400, user: { id: 1, firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" } });
    }
    if (method === "POST" && pathname.endsWith("/auth/register")) {
      return wrapped({ accessToken: "TOK-2", tokenType: "Bearer", expiresIn: 86400, user: { id: 2, firstName: "John", lastName: "Doe", email: "john@t.com", role: body.roleName || "CUSTOMER" } });
    }
    if (method === "GET" && pathname.endsWith("/products/7")) return wrapped(PRODUCT);
    if (method === "GET" && pathname.endsWith("/products")) {
      return wrapped({ content: [PRODUCT], page: 0, size: 24, totalElements: 1, totalPages: 1, last: true });
    }
    if (method === "GET" && pathname.endsWith("/categories")) {
      return wrapped([{ id: 2, name: "Electronics", description: "Gadgets" }]);
    }
    throw new Error(`Unmapped route: ${method} ${url}`);
  };

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body || null });
    const result = route(String(url), options.method || "GET", options);
    return {
      ok: true, status: 200,
      headers: { get: (h) => (h.toLowerCase() === "content-type" ? "application/json" : "") },
      json: async () => result,
      text: async () => JSON.stringify(result),
    };
  };

  const auth = await import(app("js/services/authService.js"));
  const session = await auth.login({ email: "jane@t.com", password: "pw" });
  check(session.token === "TOK-1", "login maps accessToken -> token");
  check(session.user?.role === "SELLER", "login keeps user object");
  auth.setSession(session);
  check(auth.getCurrentUser()?.email === "jane@t.com", "setSession persists user");
  check(auth.isAuthenticated(), "isAuthenticated true after login");
  check(auth.getRole() === "SELLER", "getRole returns normalized role");
  check(auth.getDisplayName() === "Jane Doe", "getDisplayName joins names");
  check(auth.getInitials() === "JD", "getInitials from names");

  const regSession = await auth.register({ email: "john@t.com", password: "pw", roleName: "CUSTOMER" });
  check(regSession.token === "TOK-2", "register unwraps response");
  const regReq = requests.find((r) => r.url.includes("/auth/register"));
  check(regReq && regReq.body.includes('"roleName"'), "register sends roleName (not role)");
  check(regReq && !regReq.body.includes('"role"'), "register does not send a bare role key");

  auth.setSession({ token: "TOK-2", user: { firstName: "John", role: "CUSTOMER" } });
  auth.logout();
  check(!auth.isAuthenticated(), "logout clears session");

  /* ==========================================================
     [C] Product service (backend-wired)
     ========================================================== */
  section("productService");
  auth.setSession({ token: "TOK-1", user: { firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" } });
  const product = await import(app("js/services/productService.js"));

  const list = await product.getProducts({ sort: "price_asc" });
  check(list.totalElements === 1, "getProducts unwraps paged data");
  check(Array.isArray(list.content) && list.content.length === 1, "getProducts content is an array");
  check(list.content[0].category?.id === 2, "category.id normalized from categoryId");
  check(list.content[0].category?.name === "Electronics", "category.name normalized from categoryName");
  check(list.content[0].sellerName === "Seller One", "sellerName preserved");

  const sortReq = requests.find((r) => r.url.includes("/products?"));
  check(sortReq && sortReq.url.includes("sort=price%2Casc"), "sort token mapped to Spring sort param");
  check(sortReq && sortReq.url.includes("size=24"), "default page size applied");

  const featured = await product.getFeaturedProducts(8);
  check(featured.content?.length === 1, "featured reuses list endpoint");

  const detail = await product.getProduct(7);
  check(detail.id === 7 && detail.category?.id === 2, "getProduct unwraps + normalizes");

  /* ==========================================================
     [D] Category service (backend-wired + cache)
     ========================================================== */
  section("categoryService");
  const category = await import(app("js/services/categoryService.js"));
  const cats = await category.getCategories();
  check(Array.isArray(cats) && cats.length === 1 && cats[0].name === "Electronics", "getCategories unwraps data array");

  /* ==========================================================
     [E] Cart service (local)
     ========================================================== */
  section("cartService");
  const cart = await import(app("js/services/cartService.js"));
  cart.addItem(PRODUCT, 2);
  cart.addItem(PRODUCT, 1);
  check(cart.getCartItemCount() === 3, "addItem merges quantities");
  check(cart.getCartSubtotal() === 49.99 * 3, "getCartSubtotal sums price x qty");
  cart.addItem({ id: 9, name: "Mug", price: 10 }, 1);
  check(cart.getCartItemCount() === 4, "addItem appends new line");
  cart.updateQuantity(7, 0);
  check(cart.getCartItemCount() === 1, "updateQuantity(0) removes item");
  cart.updateQuantity(9, 5);
  check(cart.getCartItemCount() === 5, "updateQuantity sets quantity");
  cart.removeItem(9);
  check(cart.getCartItemCount() === 0, "removeItem empties cart");
  cart.clearCart();
  check(cart.getCartItemCount() === 0, "clearCart idempotent");

  /* ==========================================================
     [F] Wishlist service (local)
     ========================================================== */
  section("wishlistService");
  const wish = await import(app("js/services/wishlistService.js"));
  check(wish.getWishlistCount() === 0, "wishlist starts empty");
  check(wish.addItem(PRODUCT) === true, "addItem returns true");
  check(wish.isInWishlist(7) === true, "isInWishlist true");
  check(wish.addItem(PRODUCT) === false, "duplicate addItem rejected");
  check(wish.toggleItem(PRODUCT) === false, "toggleItem removes wishlisted item");
  check(wish.toggleItem(PRODUCT) === true, "toggleItem re-adds item");
  wish.removeItem(7);
  check(wish.getWishlistCount() === 0, "removeItem clears");

  /* ==========================================================
     [G] Orders service (local) + enum alignment
     ========================================================== */
  section("ordersService");
  const orders = await import(app("js/services/ordersService.js"));
  check(orders.ORDER_STATUS.PENDING === "PENDING", "ORDER_STATUS.PENDING");
  check(orders.ORDER_STATUS.CONFIRMED === "CONFIRMED", "ORDER_STATUS.CONFIRMED");
  check(orders.ORDER_STATUS.SHIPPED === "SHIPPED", "ORDER_STATUS.SHIPPED");
  check(orders.ORDER_STATUS.DELIVERED === "DELIVERED", "ORDER_STATUS.DELIVERED");
  check(orders.ORDER_STATUS.CANCELLED === "CANCELLED", "ORDER_STATUS.CANCELLED");
  check(orders.ORDER_STATUS.PLACED === undefined, "no legacy PLACED status");
  check(orders.ORDER_STATUS.PROCESSING === undefined, "no legacy PROCESSING status");
  check(orders.getOrderStatusLabel("PENDING") === "Pending", "PENDING label");
  check(orders.getOrderStatusLabel("CANCELLED") === "Cancelled", "CANCELLED label");

  const order = orders.createOrder({
    items: [{ productId: 7, productName: "Headphones", quantity: 2 }],
    shipping: { address: "1 Main St" },
    payment: { method: "CARD" },
    subtotal: 99.98,
    total: 99.98,
  });
  check(order.orderNumber.startsWith("ORD-"), "createOrder generates ORD-xxxx number");
  check(order.status === "PENDING", "createOrder starts PENDING");
  check(orders.getOrderById(order.id)?.id === order.id, "getOrderById finds order");
  const updated = orders.updateOrderStatus(order.id, "SHIPPED");
  check(updated?.status === "SHIPPED", "updateOrderStatus advances to SHIPPED");
  check(orders.updateOrderStatus(order.id, "NOPE") === null, "updateOrderStatus rejects bad status");

  /* ==========================================================
     [H] Seller service (local) + enum alignment
     ========================================================== */
  section("sellerService");
  const seller = await import(app("js/services/sellerService.js"));
  check(seller.PRODUCT_STATUS.ACTIVE === "ACTIVE", "PRODUCT_STATUS.ACTIVE");
  check(seller.PRODUCT_STATUS.INACTIVE === "INACTIVE", "PRODUCT_STATUS.INACTIVE");
  check(seller.PRODUCT_STATUS.DRAFT === undefined, "no legacy DRAFT status");

  const seeds = seller.getSellerProducts();
  check(seeds.length >= 6, "seed catalogue present");
  const created = seller.createProduct({ name: "QA Widget", price: 5, status: "ACTIVE" });
  check(created.id > 0 && created.name === "QA Widget", "createProduct assigns id + fields");
  const updatedProd = seller.updateProduct(created.id, { price: 6 });
  check(updatedProd?.price === 6, "updateProduct merges fields");
  check(seller.deleteProduct(created.id) === true, "deleteProduct removes");

  globalThis.window.localStorage.setItem("marketplace.orders", JSON.stringify([
    { id: 1, orderNumber: "A", status: "PENDING", total: 10, createdAt: new Date().toISOString() },
    { id: 2, orderNumber: "B", status: "CONFIRMED", total: 20, createdAt: new Date().toISOString() },
    { id: 3, orderNumber: "C", status: "CANCELLED", total: 30, createdAt: new Date().toISOString() },
  ]));
  const stats = seller.getSellerStats();
  check(stats.pendingOrders === 2, "pendingOrders = PENDING + CONFIRMED only");
  check(stats.activeOrders === 2, "activeOrders excludes CANCELLED/DELIVERED");
  check(stats.revenue === 30, "revenue excludes CANCELLED");

  /* ==========================================================
     [I] Admin service (local)
     ========================================================== */
  section("adminService");
  const admin = await import(app("js/services/adminService.js"));
  check(admin.getUsers().length === 5, "seed users present");
  const promoted = admin.updateUserRole(4, "SELLER");
  check(promoted?.role === "SELLER", "updateUserRole changes role");
  check(admin.updateUserRole(4, "NOPE") === null, "updateUserRole rejects bad role");
  check(admin.getCategories().length === 7, "seed categories from DEFAULT_CATEGORIES");
  const newCat = admin.createCategory("Phase 13 QA");
  check(newCat?.name === "Phase 13 QA", "createCategory works");
  check(admin.createCategory("") === null, "createCategory rejects blank");
  check(admin.deleteCategory(newCat.id) === true, "deleteCategory works");
  check(admin.updateProductStatus(1, "INACTIVE")?.status === "INACTIVE", "product moderation toggles status");
  const astats = admin.getAdminStats();
  check(astats.totalUsers === 5, "admin stats totalUsers");

  /* ==========================================================
     [J] Profile service (local)
     ========================================================== */
  section("profileService");
  const profile = await import(app("js/services/profileService.js"));
  const seeded = profile.getProfile();
  check(seeded.email === "jane@t.com", "profile seeded from session user");
  const updatedProfile = profile.updateProfile({ firstName: "Janet", lastName: "Roe" });
  check(updatedProfile.firstName === "Janet", "updateProfile merges firstName");
  check(auth.getCurrentUser()?.firstName === "Janet", "updateProfile syncs session user");
  check(profile.changePassword({ currentPassword: "password123", newPassword: "newpass1" })?.password === "newpass1", "changePassword updates password");
  let threw = false;
  try {
    profile.changePassword({ currentPassword: "wrong", newPassword: "x" });
  } catch {
    threw = true;
  }
  check(threw, "changePassword rejects wrong current password");

  console.log(
    failures === 0
      ? "\nSERVICE SMOKE TESTS PASSED"
      : `\nSERVICE SMOKE TESTS FAILED: ${failures}`
  );
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error("SERVICE SMOKE ERROR:", error);
  process.exitCode = 1;
});

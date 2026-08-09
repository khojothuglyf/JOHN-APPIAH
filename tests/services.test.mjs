/* ============================================================
   PHASE 13 - SERVICE LAYER SMOKE TESTS (Supabase)
   Run: node tests/services.test.mjs

   Loads the real frontend service modules in Node with a mocked
   browser environment (window/localStorage/sessionStorage/fetch)
   and verifies:
   - Supabase Auth contract (login -> access_token, signup metadata,
     no roleName, email-confirmation token-less signup)
   - PostgREST contract (Range paging, content-range totals,
     embedded category/seller names, snake_case -> camelCase mapping)
   - the local fallback services (cart, wishlist, orders, seller,
     admin, profile)
   - config endpoint registry consistency
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
     [A] Config + endpoint registry
     ========================================================== */
  section("config");
  const { API_ENDPOINTS, endpointPath, USER_ROLES, STORAGE_KEYS } = config;
  check(endpointPath("/products/{id}", { id: 7 }) === "/products/7", "endpointPath fills {id}");
  check(endpointPath("/products/{id}", {}) === "/products/{id}", "endpointPath leaves missing params");
  check(USER_ROLES.BUYER === "BUYER" && USER_ROLES.SELLER === "SELLER" && USER_ROLES.ADMIN === "ADMIN", "USER_ROLES match backend roles");
  check(STORAGE_KEYS.token === "marketplace.auth.token", "auth token storage key stable");
  check(STORAGE_KEYS.refreshToken === "marketplace.auth.refresh", "refresh token storage key stable");

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

  const stillPlanned = ["auth.logout", "auth.me", "users.profile", "users.updateProfile", "users.changePassword", "admin.users", "admin.updateUserRole", "admin.products", "admin.updateProductStatus", "contact.send"];
  for (const key of stillPlanned) {
    const entry = key.split(".").reduce((o, k) => o?.[k], API_ENDPOINTS);
    check(entry != null, `planned endpoint still declared: ${key}`);
  }

  /* ==========================================================
     [B] Supabase mock routes
     ========================================================== */
  const requests = [];

  const PRODUCT_ROW = {
    id: 7,
    name: "Test Headphones",
    description: "ANC",
    price: 49.99,
    old_price: 59.99,
    stock: 5,
    sku: "SKU-1",
    image_url: "",
    status: "ACTIVE",
    category_id: 2,
    seller_id: "s1",
    created_at: "2026-08-07T00:00:00Z",
    updated_at: "2026-08-07T00:00:00Z",
    category: { name: "Electronics" },
    seller: { first_name: "Seller", last_name: "One" },
  };

  const jsonResponse = (payload, { status = 200, headers = {} } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        const key = String(name).toLowerCase();
        if (key === "content-type") return "application/json";
        return headers[key] ?? "";
      },
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });

  const route = (url, method, options) => {
    const { pathname, searchParams } = new URL(url);
    const body = options?.body ? JSON.parse(options.body) : null;

    /* Auth */
    if (method === "POST" && pathname.endsWith("/auth/v1/token")) {
      if (searchParams.get("grant_type") === "password") {
        return jsonResponse({
          access_token: "TOK-1",
          refresh_token: "RT-1",
          expires_in: 3600,
          token_type: "Bearer",
          user: { id: "u1", email: "jane@t.com", user_metadata: { first_name: "Jane", last_name: "Doe" } },
        });
      }
      return jsonResponse({ access_token: "TOK-1", refresh_token: "RT-1" });
    }
    if (method === "POST" && pathname.endsWith("/auth/v1/signup")) {
      return jsonResponse({ id: "u2", email: body.email, user_metadata: body.data || {} });
    }
    if (method === "POST" && pathname.endsWith("/auth/v1/logout")) {
      return jsonResponse({});
    }
    if (method === "POST" && pathname.endsWith("/auth/v1/recover")) {
      return jsonResponse({});
    }
    if (method === "GET" && pathname.endsWith("/auth/v1/user")) {
      return jsonResponse({ id: "u1", email: "jane@t.com", user_metadata: { first_name: "Jane", last_name: "Doe" } });
    }

    /* PostgREST */
    if (method === "GET" && pathname.endsWith("/rest/v1/profiles")) {
      return jsonResponse(
        [{ id: "u1", first_name: "Jane", last_name: "Doe", email: "jane@t.com", role: "SELLER", created_at: "2026-08-07T00:00:00Z" }],
        { headers: { "content-range": "0-0/1" } }
      );
    }
    if (method === "GET" && pathname.endsWith("/rest/v1/products")) {
      const idFilter = searchParams.get("id");
      if (idFilter) {
        return idFilter === "eq.7"
          ? jsonResponse([PRODUCT_ROW], { headers: { "content-range": "0-0/1" } })
          : jsonResponse([], { headers: { "content-range": "0-0/0" } });
      }
      const range = options?.headers?.Range || "0-23";
      return jsonResponse([PRODUCT_ROW], { headers: { "content-range": `${range}/1` } });
    }
    if (method === "GET" && pathname.endsWith("/rest/v1/categories")) {
      return jsonResponse(
        [{ id: 2, name: "Electronics", description: "Gadgets", created_at: "2026-08-07T00:00:00Z", updated_at: "2026-08-07T00:00:00Z" }],
        { headers: { "content-range": "0-0/1" } }
      );
    }
    if (method === "GET" && pathname.endsWith("/rest/v1/cart_items")) {
      return jsonResponse([], { headers: { "content-range": "0-0/0" } });
    }
    if (method === "POST" && pathname.endsWith("/rest/v1/cart_items")) {
      return jsonResponse([{ id: 100, ...body }]);
    }
    if (method === "PATCH" && pathname.endsWith("/rest/v1/cart_items")) {
      return jsonResponse([{ id: 100, ...body }]);
    }
    if (method === "DELETE" && pathname.endsWith("/rest/v1/cart_items")) {
      return jsonResponse([], { headers: { "content-range": "0-0/0" } });
    }
    if (method === "GET" && pathname.endsWith("/rest/v1/wishlist_items")) {
      return jsonResponse([], { headers: { "content-range": "0-0/0" } });
    }
    if (method === "POST" && pathname.endsWith("/rest/v1/wishlist_items")) {
      return jsonResponse([{ id: 200, ...body }]);
    }
    if (method === "DELETE" && pathname.endsWith("/rest/v1/wishlist_items")) {
      return jsonResponse([], { headers: { "content-range": "0-0/0" } });
    }

    throw new Error(`Unmapped route: ${method} ${url}`);
  };

  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url: String(url),
      method: options.method || "GET",
      body: options.body || null,
      headers: options.headers || null,
    });
    return route(String(url), options.method || "GET", options);
  };

  /* ==========================================================
     [C] Auth service (Supabase Auth)
     ========================================================== */
  section("authService");
  const auth = await import(app("js/services/authService.js"));

  const session = await auth.login({ email: "jane@t.com", password: "pw" });
  check(session.token === "TOK-1", "login maps access_token -> token");
  check(session.refreshToken === "RT-1", "login returns the refresh token");
  check(session.user?.id === "u1", "login keeps the auth user id");
  check(session.user?.role === "SELLER", "login role comes from profiles");
  check(session.user?.firstName === "Jane", "login name comes from profile");
  auth.setSession(session);
  check(auth.getCurrentUser()?.email === "jane@t.com", "setSession persists user");
  check(auth.isAuthenticated(), "isAuthenticated true after login");
  check(auth.getRole() === "SELLER", "getRole returns normalized role");
  check(auth.getDisplayName() === "Jane Doe", "getDisplayName joins names");
  check(auth.getInitials() === "JD", "getInitials from names");
  check(
    requests.some((r) => r.url.includes("grant_type=password")),
    "login calls /auth/v1/token?grant_type=password"
  );

  await auth.refreshSession();
  check(auth.getCurrentUser()?.role === "SELLER", "refreshSession revalidates profile");

  globalThis.window.localStorage.removeItem("marketplace.auth.token");
  await auth.refreshSession();
  check(
    requests.some((r) => r.url.includes("grant_type=refresh_token")),
    "refreshSession exchanges the refresh token"
  );
  check(auth.getCurrentUser()?.role === "SELLER", "session restored after refresh exchange");

  const regSession = await auth.register({ firstName: "John", lastName: "Doe", email: "john@t.com", password: "pw" });
  check(regSession.token === null, "register resolves no token (email confirmation)");
  check(regSession.user?.email === "john@t.com", "register returns the created user");
  const regReq = requests.find((r) => r.url.includes("/auth/v1/signup"));
  check(regReq && regReq.body.includes('"first_name"'), "register sends first_name metadata");
  check(regReq && regReq.body.includes('"requested_role":"buyer"'), "register defaults requested_role to buyer");
  check(regReq && !regReq.body.includes("roleName"), "register no longer sends roleName");
  check(regReq && !regReq.body.includes('"role"'), "register does not send a bare role key");

  await auth.register({ firstName: "Evil", lastName: "Admin", email: "evil@t.com", password: "pw", requestedRole: "admin" });
  const adminReq = requests.filter((r) => r.url.includes("/auth/v1/signup")).pop();
  check(adminReq && adminReq.body.includes('"requested_role":"buyer"'), "register coerces admin request to buyer");
  check(adminReq && !adminReq.body.includes('"requested_role":"admin"'), "register never sends an admin role request");

  await auth.register({ firstName: "Sally", lastName: "Seller", email: "sally@t.com", password: "pw", requestedRole: "seller" });
  const sellerReq = requests.filter((r) => r.url.includes("/auth/v1/signup")).pop();
  check(sellerReq && sellerReq.body.includes('"requested_role":"seller"'), "register sends seller requested_role");

  auth.setSession({ token: "TOK-2", user: { firstName: "John", role: "BUYER" } });
  auth.logout();
  check(!auth.isAuthenticated(), "logout clears session");
  check(
    requests.some((r) => r.method === "POST" && r.url.includes("/auth/v1/logout")),
    "logout revokes the session via /auth/v1/logout"
  );

  const forgot = await auth.forgotPassword("jane@t.com");
  check(forgot.success === true, "forgotPassword succeeds");
  check(
    requests.some((r) => r.url.includes("/auth/v1/recover")),
    "forgotPassword calls /auth/v1/recover"
  );

  /* ==========================================================
     [D] Product service (PostgREST)
     ========================================================== */
  section("productService");
  auth.setSession({ token: "TOK-1", user: { id: "u1", firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" } });
  const product = await import(app("js/services/productService.js"));

  const list = await product.getProducts({ sort: "price_asc" });
  check(list.totalElements === 1, "getProducts parses content-range total");
  check(Array.isArray(list.content) && list.content.length === 1, "getProducts content is an array");
  check(list.content[0].category?.id === 2, "category.id normalized from category_id");
  check(list.content[0].category?.name === "Electronics", "category.name from embedded category");
  check(list.content[0].sellerName === "Seller One", "sellerName from embedded seller");
  check(list.content[0].oldPrice === 59.99, "old_price mapped to oldPrice");

  const sortReq = requests.find((r) => r.url.includes("/rest/v1/products?"));
  check(sortReq && sortReq.url.includes("order=price.asc"), "sort token mapped to PostgREST order");
  check(sortReq && sortReq.url.includes("status=eq.ACTIVE"), "storefront filters to ACTIVE products");
  check(sortReq && sortReq.headers.Range === "0-23", "default page size applied via Range header");
  check(list.page === 0 && list.size === 24, "paged contract carries page/size");
  check(list.totalPages === 1 && list.last === true, "paged contract computes totalPages/last");

  const featured = await product.getFeaturedProducts(8);
  check(featured.content?.length === 1, "featured reuses the products list");
  check(requests[requests.length - 1].headers.Range === "0-7", "featured requests rows 0-7");

  const detail = await product.getProduct(7);
  check(detail.id === 7 && detail.category?.id === 2, "getProduct unwraps + normalizes");

  let notFound = false;
  try {
    await product.getProduct(999);
  } catch (error) {
    notFound = error?.status === 404;
  }
  check(notFound, "getProduct throws ApiError 404 when missing");

  const beforeAll = requests.length;
  const all = await product.getAllMatchingProducts({ keyword: "head" });
  check(Array.isArray(all) && all.length === 1 && all[0].id === 7, "getAllMatchingProducts returns full content");
  check(requests.length === beforeAll + 2, "getAllMatchingProducts probes total then fetches full set");
  check(requests[beforeAll].url.includes("or="), "keyword mapped to PostgREST or(...) filter");

  await product.getProducts({ categoryId: 2 });
  check(
    requests[requests.length - 1].url.includes("category_id=eq.2"),
    "categoryId maps to category_id=eq.2"
  );
  await product.getProducts({ keyword: "mug" });
  check(
    requests[requests.length - 1].url.includes("or="),
    "keyword maps to or(...) search filter"
  );

  /* ==========================================================
     [E] Category service (PostgREST + cache)
     ========================================================== */
  section("categoryService");
  const category = await import(app("js/services/categoryService.js"));
  const cats = await category.getCategories();
  check(Array.isArray(cats) && cats.length === 1 && cats[0].name === "Electronics", "getCategories unwraps data array");

  /* ==========================================================
     [F] Cart service (local cache + Supabase sync)
     ========================================================== */
  section("cartService");
  const cart = await import(app("js/services/cartService.js"));
  cart.addItem(PRODUCT_ROW, 2);
  cart.addItem(PRODUCT_ROW, 1);
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
  check(
    requests.some((r) => r.method === "POST" && r.url.includes("/rest/v1/cart_items")),
    "addItem pushes POST to cart_items"
  );
  check(
    requests.some((r) => r.url.includes("on_conflict=user_id%2Cproduct_id")),
    "cart upsert targets user_id+product_id"
  );

  cart.setCart([{ id: 500, productId: 11, name: "Server Item", price: 5, quantity: 1, subtotal: 5 }]);
  cart.updateQuantity(11, 3);
  check(
    requests.some((r) => r.method === "PATCH" && r.url.includes("/rest/v1/cart_items")),
    "updateQuantity PATCHes cart_items"
  );
  cart.removeItem(11);
  check(
    requests.some((r) => r.method === "DELETE" && r.url.includes("/rest/v1/cart_items")),
    "removeItem DELETEs cart_items"
  );
  const cartSynced = await cart.syncCartFromServer();
  check(cartSynced === true, "syncCartFromServer replaces cache from server");

  /* ==========================================================
     [G] Wishlist service (local cache + Supabase sync)
     ========================================================== */
  section("wishlistService");
  const wish = await import(app("js/services/wishlistService.js"));
  check(wish.getWishlistCount() === 0, "wishlist starts empty");
  check(wish.addItem(PRODUCT_ROW) === true, "addItem returns true");
  check(wish.isInWishlist(7) === true, "isInWishlist true");
  check(wish.addItem(PRODUCT_ROW) === false, "duplicate addItem rejected");
  check(wish.toggleItem(PRODUCT_ROW) === false, "toggleItem removes wishlisted item");
  check(wish.toggleItem(PRODUCT_ROW) === true, "toggleItem re-adds item");
  wish.removeItem(7);
  check(wish.getWishlistCount() === 0, "removeItem clears");
  check(
    requests.some((r) => r.method === "POST" && r.url.includes("/rest/v1/wishlist_items")),
    "addItem pushes POST to wishlist_items"
  );
  check(
    requests.some((r) => r.url.includes("on_conflict=user_id%2Cproduct_id")),
    "wishlist upsert targets user_id+product_id"
  );
  check(
    requests.some((r) => r.method === "DELETE" && r.url.includes("/rest/v1/wishlist_items")),
    "removeItem DELETEs wishlist_items"
  );
  const wishSynced = await wish.syncWishlistFromServer();
  check(wishSynced === true, "syncWishlistFromServer replaces cache from server");

  /* ==========================================================
     [H] Orders service (local) + enum alignment
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
     [I] Seller service (local) + enum alignment
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
     [J] Admin service (local)
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
     [K] Profile service (local)
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

  auth.logout();
  check((await cart.syncCartFromServer()) === false, "cart sync is a no-op when signed out");
  check((await wish.syncWishlistFromServer()) === false, "wishlist sync is a no-op when signed out");

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

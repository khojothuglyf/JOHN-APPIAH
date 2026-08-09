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
    if (method === "GET" && pathname.endsWith("/api/v1/products")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: { content: [], page: 0, size: 24, totalElements: 0, totalPages: 0, last: true },
        timestamp: "2026-08-07T00:00:00Z",
      });
    }

    /* Spring Boot orders backend (Phase 10C) */
    const orderResponse = (overrides = {}) => ({
      id: 42,
      orderNumber: "ORD-260807-A1B2",
      status: "PENDING",
      currency: "USD",
      totalAmount: 99.98,
      discountAmount: 0,
      couponCode: null,
      shippingAddress: "1 Main St, IL",
      city: "Springfield",
      postalCode: "62701",
      country: "US",
      userId: 1,
      customerName: "Jane Doe",
      items: [
        {
          id: 1,
          productId: 100,
          supabaseProductId: "7",
          productName: "Headphones",
          unitPrice: 49.99,
          quantity: 2,
          subtotal: 99.98,
        },
      ],
      createdAt: "2026-08-07T00:00:00",
      updatedAt: "2026-08-07T00:00:00",
      ...overrides,
    });

    if (method === "POST" && pathname.endsWith("/api/v1/orders")) {
      if (body?.items?.some((item) => item.supabaseProductId === "FAIL")) {
        return jsonResponse(
          { success: false, message: "Insufficient stock", data: null, timestamp: "2026-08-07T00:00:00Z" },
          { status: 400 }
        );
      }
      const first = body?.items?.[0] || { supabaseProductId: "7", quantity: 1 };
      return jsonResponse(
        {
          success: true,
          message: "Order placed successfully",
          data: orderResponse({
            shippingAddress: body.shippingAddress,
            city: body.city,
            postalCode: body.postalCode,
            country: body.country,
            items: body.items.map((item, index) => ({
              id: index + 1,
              productId: 100 + index,
              supabaseProductId: item.supabaseProductId,
              productName: "Headphones",
              unitPrice: 49.99,
              quantity: item.quantity,
              subtotal: Number((49.99 * item.quantity).toFixed(2)),
            })),
          }),
          timestamp: "2026-08-07T00:00:00Z",
        },
        { status: 201 }
      );
    }
    if (method === "GET" && pathname.endsWith("/api/v1/orders/seller")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: { content: [orderResponse()], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && pathname.endsWith("/api/v1/orders/admin")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: { content: [orderResponse()], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && pathname.endsWith("/api/v1/orders")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: { content: [orderResponse()], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && /\/api\/v1\/orders\/\d+$/.test(pathname)) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: orderResponse(),
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "PUT" && /\/api\/v1\/orders\/\d+\/status$/.test(pathname)) {
      return jsonResponse({
        success: true,
        message: "Order status updated",
        data: orderResponse({ status: body?.status }),
        timestamp: "2026-08-07T00:00:00Z",
      });
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
     [B] HTTP client: /api/v1 versioning + envelope pass-through
     ========================================================== */
  section("httpClient");
  const { http: httpClient } = await import(app("js/utils/http.js"));

  const before = requests.length;
  const envelope = await httpClient.get(API_ENDPOINTS.products.list, {
    params: { page: 0, size: 24 },
  });
  const httpReq = requests[before];
  check(
    httpReq && httpReq.url.includes("/api/v1/products"),
    "relative endpoints are prefixed with /api/v1"
  );
  check(
    httpReq && httpReq.url.includes("page=0") && httpReq.url.includes("size=24"),
    "query params are serialized"
  );
  check(
    envelope && Array.isArray(envelope.data?.content),
    "http passes the ApiResponse envelope through untouched"
  );

  let absError = null;
  try {
    await httpClient.get("https://example.com/ping");
  } catch (error) {
    absError = error;
  }
  check(
    requests[requests.length - 1].url === "https://example.com/ping",
    "absolute URLs are not prefixed"
  );
  check(absError instanceof Error, "unmapped absolute URL surfaces an error");

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

  check(
    auth.getRoleLandingPath("BUYER") === "pages/buyer-dashboard.html",
    "getRoleLandingPath(BUYER) -> buyer dashboard"
  );
  check(
    auth.getRoleLandingPath("SELLER") === "pages/seller-dashboard.html",
    "getRoleLandingPath(SELLER) -> seller dashboard"
  );
  check(
    auth.getRoleLandingPath("ADMIN") === "pages/admin-dashboard.html",
    "getRoleLandingPath(ADMIN) -> admin dashboard"
  );
  check(
    auth.getRoleLandingPath(undefined) === "pages/buyer-dashboard.html",
    "getRoleLandingPath(unknown) falls back to buyer dashboard"
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
     [H] Orders service (Spring Boot backend) + enum alignment
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

  // Checkout requires a signed-in session. The Supabase access token
  // is forwarded to the backend as a Bearer token by the HTTP client.
  auth.setSession({
    token: "TOK-3",
    user: { id: "u1", firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "BUYER" },
  });

  const orderStart = requests.length;
  const order = await orders.createOrder({
    items: [{ productId: 7, name: "Headphones", price: 1, quantity: 2 }],
    shipping: {
      email: "jane@t.com",
      firstName: "Jane",
      lastName: "Doe",
      address: "1 Main St",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      country: "US",
    },
    payment: { method: "CARD", last4: "4242" },
    subtotal: 9999,
    shippingCost: 500,
    total: 9999,
  });
  const orderReq = requests[orderStart];
  check(orderReq?.method === "POST" && orderReq.url.includes("/api/v1/orders"), "createOrder POSTs /api/v1/orders");
  check(orderReq?.headers?.Authorization === "Bearer TOK-3", "supabase access token is sent as Bearer");
  const orderBody = JSON.parse(orderReq.body);
  check(orderBody.items[0]?.supabaseProductId === "7" && orderBody.items[0]?.quantity === 2, "checkout sends supabaseProductId + quantity");
  check(orderBody.shippingAddress === "1 Main St, IL", "state folds into the shipping address");
  check(orderBody.city === "Springfield" && orderBody.postalCode === "62701" && orderBody.country === "US", "checkout sends shipping city/zip/country");
  check(orderBody.currency === "USD", "checkout sends the default currency");
  check(!("subtotal" in orderBody) && !("total" in orderBody) && !("shippingCost" in orderBody), "checkout never sends frontend totals");
  check(orderBody.items[0]?.price === undefined && orderBody.items[0]?.subtotal === undefined, "checkout never sends frontend prices");

  check(order.id === 42, "createOrder unwraps the backend order id");
  check(order.orderNumber === "ORD-260807-A1B2", "backend orderNumber is used");
  check(order.status === "PENDING", "createOrder starts PENDING");
  check(order.total === 99.98, "backend totalAmount is authoritative (frontend total ignored)");
  check(order.subtotal === 99.98, "subtotal derived from backend items");
  check(order.shippingCost === 0, "shipping cost comes from the backend");
  check(order.currency === "USD", "backend currency is mapped");
  check(order.items[0]?.productId === "7", "item productId maps to the Supabase product id");
  check(order.items[0]?.name === "Headphones" && order.items[0]?.price === 49.99, "item name/price come from the backend");
  check(order.payment?.method === "CARD", "payment display info kept for the confirmation page");
  check(orders.getOrderById(order.id)?.id === order.id, "created order is cached for getOrderById");

  const updated = await orders.updateOrderStatus(order.id, "SHIPPED");
  check(updated?.status === "SHIPPED", "updateOrderStatus advances to SHIPPED");
  const statusReq = requests[requests.length - 1];
  check(statusReq?.url.includes("/api/v1/orders/42/status"), "status update targets /orders/{id}/status");
  check(JSON.parse(statusReq.body)?.status === "SHIPPED", "status update sends { status }");
  check(await orders.updateOrderStatus(order.id, "NOPE") === null, "updateOrderStatus rejects bad status without a request");

  // The backend is authoritative: a failed checkout never fabricates
  // a local order.
  const cacheBeforeFail = orders.getOrders().length;
  let checkoutError = null;
  try {
    await orders.createOrder({
      items: [{ productId: "FAIL", quantity: 1 }],
      shipping: { address: "x", city: "y", zip: "z", country: "c" },
    });
  } catch (error) {
    checkoutError = error;
  }
  check(checkoutError instanceof Error, "backend rejection surfaces an error");
  check(orders.getOrders().length === cacheBeforeFail, "no local order is fabricated on backend failure");

  // Reads sync from the backend (buyer / seller scopes).
  const synced = await orders.syncOrders();
  check(Array.isArray(synced) && synced.length === 1, "syncOrders fetches paged buyer orders");
  check(synced[0]?.orderNumber === "ORD-260807-A1B2", "synced orders are mapped to the frontend shape");
  await orders.syncOrders({ scope: "seller" });
  check(
    requests[requests.length - 1].url.includes("/api/v1/orders/seller"),
    "seller scope hits /orders/seller"
  );

  const fetched = await orders.getOrder(42);
  check(fetched?.id === 42 && fetched?.orderNumber === "ORD-260807-A1B2", "getOrder fetches a single order by id");

  // Signed out: reads degrade to the local cache (no backend call).
  auth.logout();
  const offlineStart = requests.length;
  const offline = await orders.syncOrders();
  check(Array.isArray(offline), "syncOrders degrades to the local cache when signed out");
  check(requests.length === offlineStart, "no backend request is made when signed out");

  // Restore a session for the later profile tests.
  auth.setSession({
    token: "TOK-1",
    user: { id: "u1", firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" },
  });

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

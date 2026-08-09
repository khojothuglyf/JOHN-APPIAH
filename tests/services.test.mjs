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

import { readFileSync } from "node:fs";
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
    ["payments.create", "/payments/orders/{orderId}"],
    ["payments.byOrder", "/payments/orders/{orderId}"],
    ["payments.my", "/payments/my"],
    ["payments.refund", "/payments/{paymentId}/refund"],
    ["seller.orders", "/orders/seller"],
    ["seller.updateOrderStatus", "/orders/{id}/status"],
    ["seller.analytics.summary", "/seller/analytics/summary"],
    ["seller.analytics.topProducts", "/seller/analytics/top-products"],
    ["seller.analytics.salesByCategory", "/seller/analytics/sales-by-category"],
    ["seller.analytics.revenueTimeline", "/seller/analytics/revenue-timeline"],
    ["admin.categories", "/categories"],
    ["admin.createCategory", "/categories"],
    ["admin.updateCategory", "/categories/{id}"],
    ["admin.deleteCategory", "/categories/{id}"],
    ["admin.users", "/admin/users"],
    ["admin.updateUserRole", "/admin/users/{id}/role"],
    ["admin.analytics.summary", "/admin/analytics/summary"],
    ["admin.analytics.topProducts", "/admin/analytics/top-products"],
    ["admin.analytics.salesByCategory", "/admin/analytics/sales-by-category"],
    ["admin.analytics.revenueTimeline", "/admin/analytics/revenue-timeline"],
  ];
  for (const [key, path] of exact) {
    const entry = key.split(".").reduce((o, k) => o?.[k], API_ENDPOINTS);
    check(entry === path, `API_ENDPOINTS.${key} === ${path}`);
  }

  const stillPlanned = ["auth.logout", "auth.me", "users.profile", "users.updateProfile", "users.changePassword", "contact.send"];
  for (const key of stillPlanned) {
    const entry = key.split(".").reduce((o, k) => o?.[k], API_ENDPOINTS);
    check(entry != null, `planned endpoint still declared: ${key}`);
  }

  /* ==========================================================
     [B] Supabase mock routes
     ========================================================== */
  const requests = [];

  /* Payment mock state: one PaymentResponse per order id, and
     incrementing ids so the orders + payment tests each get a
     distinct backend order (the orderResponse() default is 42). */
  const paymentsByOrder = new Map();
  let orderSeq = 42;
  let paymentSeq = 500;

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
      const orderId = orderSeq++;
      return jsonResponse(
        {
          success: true,
          message: "Order placed successfully",
          data: orderResponse({
            id: orderId,
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

    /* Spring Boot payments backend (CARD completes, COD stays PENDING,
       duplicate POST -> 409 so retried checkouts recover idempotently) */
    if (method === "POST" && /\/api\/v1\/payments\/orders\/\d+$/.test(pathname)) {
      const orderId = Number(pathname.match(/\/orders\/(\d+)$/)[1]);
      if (orderId === 999) {
        return jsonResponse(
          { success: false, message: "Cannot pay for an order that is CANCELLED", data: null, timestamp: "2026-08-07T00:00:00Z" },
          { status: 400 }
        );
      }
      if (paymentsByOrder.has(orderId)) {
        return jsonResponse(
          { success: false, message: "This order already has a payment", data: null, timestamp: "2026-08-07T00:00:00Z" },
          { status: 409 }
        );
      }
      const order = orderResponse({ id: orderId });
      const cod = body?.method === "CASH_ON_DELIVERY";
      const payment = {
        id: paymentSeq,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount,
        currency: order.currency,
        method: body?.method,
        status: cod ? "PENDING" : "COMPLETED",
        transactionRef: `PAY-${String(paymentSeq).padStart(8, "0")}`,
        paidAt: cod ? null : "2026-08-09T10:00:00",
        createdAt: "2026-08-09T10:00:00",
      };
      paymentSeq++;
      paymentsByOrder.set(orderId, payment);
      return jsonResponse(
        {
          success: true,
          message: "Payment processed",
          data: payment,
          timestamp: "2026-08-07T00:00:00Z",
        },
        { status: 201 }
      );
    }
    if (method === "GET" && /\/api\/v1\/payments\/orders\/\d+$/.test(pathname)) {
      const orderId = Number(pathname.match(/\/orders\/(\d+)$/)[1]);
      const payment = paymentsByOrder.get(orderId);
      if (!payment) {
        return jsonResponse(
          { success: false, message: "No payment found for order id: " + orderId, data: null, timestamp: "2026-08-07T00:00:00Z" },
          { status: 404 }
        );
      }
      return jsonResponse({
        success: true,
        message: "ok",
        data: payment,
        timestamp: "2026-08-07T00:00:00Z",
      });
    }

    /* Spring Boot seller backend (Phase 10D) */
    const productResponse = (overrides = {}) => ({
      id: 1,
      name: "Test Widget",
      description: "A QA widget",
      price: 19.99,
      stock: 12,
      sku: "TW-001",
      imageUrl: "https://example.com/w.jpg",
      status: "ACTIVE",
      categoryId: 2,
      categoryName: "Electronics",
      sellerId: 900,
      sellerName: "Jane Doe",
      averageRating: 4.5,
      reviewCount: 7,
      createdAt: "2026-08-07T00:00:00",
      updatedAt: "2026-08-07T00:00:00",
      ...overrides,
    });

    if (method === "GET" && pathname.endsWith("/api/v1/products/mine")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: { content: [productResponse()], page: 0, size: 20, totalElements: 1, totalPages: 1, last: true },
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "POST" && pathname.endsWith("/api/v1/products")) {
      if (body?.sku === "DUP") {
        return jsonResponse(
          { success: false, message: "A product with SKU 'DUP' already exists", data: null, timestamp: "2026-08-07T00:00:00Z" },
          { status: 409 }
        );
      }
      return jsonResponse(
        {
          success: true,
          message: "Product created successfully",
          data: productResponse({
            name: body.name,
            description: body.description,
            price: body.price,
            stock: body.stock,
            sku: body.sku,
            imageUrl: body.imageUrl,
            status: body.status,
            categoryId: body.categoryId,
          }),
          timestamp: "2026-08-07T00:00:00Z",
        },
        { status: 201 }
      );
    }
    if (method === "PUT" && /\/api\/v1\/products\/\d+$/.test(pathname)) {
      const id = Number(pathname.match(/\/(\d+)$/)[1]);
      return jsonResponse({
        success: true,
        message: "Product updated successfully",
        data: productResponse({ id, name: body.name, price: body.price, sku: body.sku, status: body.status }),
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "DELETE" && /\/api\/v1\/products\/\d+$/.test(pathname)) {
      return jsonResponse({
        success: true,
        message: "Product deleted successfully",
        data: null,
        timestamp: "2026-08-07T00:00:00Z",
      });
    }

    if (method === "GET" && pathname.endsWith("/api/v1/seller/analytics/summary")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: {
          totalProducts: 5,
          activeProducts: 4,
          lowStockProducts: 1,
          totalOrders: 10,
          pendingOrders: 3,
          shippedOrders: 2,
          deliveredOrders: 4,
          cancelledOrders: 1,
          totalItemsSold: 25,
          totalRevenue: 499.95,
          averageRating: 4.4,
        },
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && pathname.endsWith("/api/v1/seller/analytics/top-products")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: [
          { productId: 1, productName: "Test Widget", quantitySold: 12, revenue: 239.88 },
          { productId: 2, productName: "Fancy Mug", quantitySold: 5, revenue: 74.95 },
        ],
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && pathname.endsWith("/api/v1/seller/analytics/sales-by-category")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: [
          { categoryId: 2, categoryName: "Electronics", quantitySold: 20, revenue: 399.8 },
          { categoryId: 3, categoryName: "Home & Living", quantitySold: 5, revenue: 100.15 },
        ],
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && pathname.endsWith("/api/v1/seller/analytics/revenue-timeline")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: [
          { date: "2026-08-07", amount: 49.99 },
          { date: "2026-08-08", amount: 12.5 },
        ],
        timestamp: "2026-08-07T00:00:00Z",
      });
    }

    /* Spring Boot admin backend (Phase 10C) */
    const userResponse = (overrides = {}) => ({
      id: 1,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@t.com",
      role: "ADMIN",
      createdAt: "2026-08-07T00:00:00",
      ...overrides,
    });

    if (method === "GET" && pathname.endsWith("/api/v1/admin/users")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: {
          content: [
            userResponse(),
            userResponse({ id: 2, firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" }),
            userResponse({ id: 3, firstName: "Bob", lastName: "Buyer", email: "bob@t.com", role: "CUSTOMER" }),
          ],
          page: 0,
          size: 100,
          totalElements: 3,
          totalPages: 1,
          last: true,
        },
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "PUT" && /\/api\/v1\/admin\/users\/\d+\/role$/.test(pathname)) {
      const id = Number(pathname.match(/\/users\/(\d+)\/role$/)[1]);
      if (id === 999) {
        return jsonResponse(
          { success: false, message: "User not found", data: null, timestamp: "2026-08-07T00:00:00Z" },
          { status: 404 }
        );
      }
      return jsonResponse({
        success: true,
        message: "Role updated",
        data: userResponse({ id, role: body?.roleName }),
        timestamp: "2026-08-07T00:00:00Z",
      });
    }

    const categoryResponse = (id, name, description, parentId, subcategories = []) => ({
      id,
      name,
      description,
      parentId,
      subcategories,
      createdAt: "2026-08-07T00:00:00",
      updatedAt: "2026-08-07T00:00:00",
    });
    if (method === "GET" && pathname.endsWith("/api/v1/categories")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: [
          categoryResponse(1, "Electronics", "Gadgets", null, [categoryResponse(2, "Headphones", "", 1)]),
          categoryResponse(3, "Home & Living", "", null),
        ],
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "POST" && pathname.endsWith("/api/v1/categories")) {
      if (body?.name === "DUP") {
        return jsonResponse(
          { success: false, message: "A category named 'DUP' already exists", data: null, timestamp: "2026-08-07T00:00:00Z" },
          { status: 409 }
        );
      }
      return jsonResponse(
        {
          success: true,
          message: "Category created successfully",
          data: categoryResponse(10, body?.name, body?.description || "", null),
          timestamp: "2026-08-07T00:00:00Z",
        },
        { status: 201 }
      );
    }
    if (method === "PUT" && /\/api\/v1\/categories\/\d+$/.test(pathname)) {
      const id = Number(pathname.match(/\/categories\/(\d+)$/)[1]);
      return jsonResponse({
        success: true,
        message: "Category updated successfully",
        data: categoryResponse(id, body?.name, body?.description || "", null),
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "DELETE" && /\/api\/v1\/categories\/\d+$/.test(pathname)) {
      return jsonResponse({
        success: true,
        message: "Category deleted successfully",
        data: null,
        timestamp: "2026-08-07T00:00:00Z",
      });
    }

    if (method === "GET" && pathname.endsWith("/api/v1/admin/analytics/summary")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: {
          totalUsers: 3,
          totalSellers: 1,
          totalCustomers: 2,
          totalProducts: 5,
          activeProducts: 4,
          lowStockProducts: 1,
          totalOrders: 10,
          pendingOrders: 3,
          shippedOrders: 2,
          deliveredOrders: 4,
          cancelledOrders: 1,
          totalReviews: 12,
          completedPayments: 8,
          totalRevenue: 1299.5,
        },
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && pathname.endsWith("/api/v1/admin/analytics/top-products")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: [
          { productId: 1, productName: "Test Widget", quantitySold: 12, revenue: 239.88 },
          { productId: 2, productName: "Fancy Mug", quantitySold: 5, revenue: 74.95 },
        ],
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && pathname.endsWith("/api/v1/admin/analytics/sales-by-category")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: [
          { categoryId: 2, categoryName: "Electronics", quantitySold: 20, revenue: 399.8 },
          { categoryId: 3, categoryName: "Home & Living", quantitySold: 5, revenue: 100.15 },
        ],
        timestamp: "2026-08-07T00:00:00Z",
      });
    }
    if (method === "GET" && pathname.endsWith("/api/v1/admin/analytics/revenue-timeline")) {
      return jsonResponse({
        success: true,
        message: "ok",
        data: [
          { date: "2026-08-07", amount: 49.99 },
          { date: "2026-08-08", amount: 12.5 },
        ],
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
     [E2] Category mapping (Supabase <-> Spring Boot by name)
     ========================================================== */
  section("categoryMapping");
  const mapping = await import(app("js/services/categoryMapping.js"));

  const SUPABASE_CATS = [
    { id: 1, name: "Electronics" },
    { id: 2, name: "Fashion" },
    { id: 3, name: "Home & Living" },
  ];
  const BACKEND_CATS = [
    { id: 101, name: "electronics" },
    { id: 102, name: "Home & Living" },
    { id: 103, name: "Books" },
  ];

  const mapped = mapping.buildCategoryOptions(SUPABASE_CATS, BACKEND_CATS);
  check(mapped.length === 3, "every Supabase category yields one option");
  check(mapped[0].name === "Electronics" && mapped[0].supabaseId === 1 && mapped[0].backendId === 101, "exact name match resolves the backend id");
  check(mapped[0].backendId === 101 && mapped[0].backendId !== mapped[0].supabaseId, "backendId is the backend id, never the Supabase id");
  check(mapped[1].name === "Fashion" && mapped[1].backendId === null, "unmatched category keeps backendId null");
  check(mapped[2].name === "Home & Living" && mapped[2].backendId === 102, "case-insensitive match resolves the backend id");

  const dup = mapping.buildCategoryOptions(
    [
      { id: 1, name: "Electronics" },
      { id: 5, name: "electronics" },
    ],
    [
      { id: 201, name: "Electronics" },
      { id: 202, name: "ELECTRONICS" },
    ]
  );
  check(dup.length === 1 && dup[0].supabaseId === 1 && dup[0].backendId === 201, "duplicate names collapse to the first entry");

  check(mapping.buildCategoryOptions().length === 0, "empty inputs yield no options");
  const single = mapping.buildCategoryOptions([{ id: 1, name: "X" }], []);
  check(single.length === 1 && single[0].backendId === null, "missing backend list leaves backendId null");

  check(mapping.findBackendCategoryId(mapped, "ELECTRONICS") === 101, "findBackendCategoryId matches case-insensitively");
  check(mapping.findBackendCategoryId(mapped, "Fashion") === null, "findBackendCategoryId returns null for an unmatched name");
  check(mapping.findBackendCategoryId(mapped, "Nope") === null, "findBackendCategoryId returns null for unknown names");
  check(mapping.findBackendCategoryId(mapped, "") === null, "findBackendCategoryId rejects blank names");
  check(mapping.findBackendCategoryId(mapped, "Electronics") !== 1, "findBackendCategoryId never falls back to the Supabase id");

  // Seller page wiring: the dropdown stamps the backend id and the
  // save flow resolves it through the mapping guard.
  const sellerSrc = readFileSync(join(ROOT, "js", "pages", "seller-dashboard.js"), "utf8");
  check(sellerSrc.includes('option.dataset.categoryId =\n        category.backendId') || sellerSrc.includes('option.dataset.categoryId ='), "seller dropdown stamps the backend id on each option");
  check(sellerSrc.includes("buildCategoryOptions(") && sellerSrc.includes("findBackendCategoryId("), "seller form maps categories by name and resolves the backend id");
  check(sellerSrc.includes("categoryId: backendCategoryId"), "seller save sends only the mapped backend id");
  check(sellerSrc.includes("Category not available in the backend catalogue yet"), "seller save blocks unmatched categories with the planned message");
  check(!sellerSrc.includes("option.dataset.categoryId = String(category.id)"), "seller dropdown never stamps the Supabase id as categoryId");

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
  check(order.payment === undefined, "createOrder leaves payment unset (recorded separately)");
  check(orders.getOrderById(order.id)?.id === order.id, "created order is cached for getOrderById");

  // The payment is attached from the backend payment response.
  const paid = orders.recordPaymentForOrder(order.id, {
    method: "CARD",
    last4: "4242",
    status: "COMPLETED",
    transactionRef: "TXN-REF-1",
    paidAt: "2026-08-09T10:00:00Z",
  });
  check(
    paid?.payment?.method === "CARD" &&
      paid?.payment?.status === "COMPLETED" &&
      paid?.payment?.transactionRef === "TXN-REF-1",
    "recordPaymentForOrder attaches the backend payment to the cached order"
  );
  check(
    orders.getOrderById(order.id)?.payment?.status === "COMPLETED",
    "payment is persisted on the cached order"
  );

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
     [H2] Payment service (Spring Boot backend) + COD contract
     ========================================================== */
  section("paymentService");
  const payment = await import(app("js/services/paymentService.js"));

  // Enum + method mapping alignment with the backend PaymentStatus /
  // PaymentMethod enums. COD always maps to CASH_ON_DELIVERY.
  check(payment.PAYMENT_STATUS.PENDING === "PENDING", "PAYMENT_STATUS.PENDING");
  check(payment.PAYMENT_STATUS.COMPLETED === "COMPLETED", "PAYMENT_STATUS.COMPLETED");
  check(payment.PAYMENT_STATUS.FAILED === "FAILED", "PAYMENT_STATUS.FAILED");
  check(payment.PAYMENT_STATUS.REFUNDED === "REFUNDED", "PAYMENT_STATUS.REFUNDED");
  check(payment.BACKEND_PAYMENT_METHODS.CARD === "CARD", "CARD maps to the backend CARD method");
  check(payment.BACKEND_PAYMENT_METHODS.COD === "CASH_ON_DELIVERY", "COD maps to the backend CASH_ON_DELIVERY method");
  check(payment.getPaymentStatusLabel("PENDING") === "Awaiting payment", "PENDING label");
  check(payment.getPaymentStatusLabel("COMPLETED") === "Paid", "COMPLETED label");
  check(payment.getPaymentStatusLabel("FAILED") === "Payment failed", "FAILED label");
  check(payment.getPaymentStatusLabel("REFUNDED") === "Refunded", "REFUNDED label");

  // COD initialization: POST /payments/orders/{id} with the backend
  // method, resolved to a PENDING payment (completed only on delivery).
  const codOrder = await orders.createOrder({
    items: [{ productId: 7, name: "Headphones", price: 1, quantity: 2 }],
    shipping: { address: "1 Main St", city: "Springfield", zip: "62701", country: "US" },
  });
  const payStart = requests.length;
  const codPayment = await payment.payForOrder(codOrder.id, payment.BACKEND_PAYMENT_METHODS.COD);
  const payReq = requests[payStart];
  check(payReq?.method === "POST" && /\/api\/v1\/payments\/orders\/\d+$/.test(payReq.url), "payForOrder POSTs /payments/orders/{orderId}");
  check(JSON.parse(payReq.body)?.method === "CASH_ON_DELIVERY", "COD sends only { method: CASH_ON_DELIVERY }");
  check(codPayment?.method === "CASH_ON_DELIVERY", "COD records the backend CASH_ON_DELIVERY method");
  check(codPayment?.status === "PENDING", "COD creates a PENDING payment");
  check(codPayment?.paidAt == null, "COD payment has no paidAt until delivery");
  check(typeof codPayment?.transactionRef === "string" && codPayment.transactionRef.startsWith("PAY-"), "COD payment carries a backend transaction reference");
  check(codPayment?.amount === 99.98 && codPayment?.currency === "USD", "payment amount/currency come from the backend order");

  // Successful recording: the mapped payment is attached to the cached
  // order so the confirmation page and dashboards show the real status.
  const codRecorded = orders.recordPaymentForOrder(codOrder.id, codPayment);
  check(codRecorded?.payment?.method === "CASH_ON_DELIVERY", "recordPaymentForOrder attaches the COD method");
  check(orders.getOrderById(codOrder.id)?.payment?.status === "PENDING", "COD PENDING status is persisted on the cached order");

  // Duplicate-payment recovery: a 409 (already paid) is recovered
  // idempotently by reading the existing payment - no second payment is
  // fabricated and the earlier CASH_ON_DELIVERY record wins.
  const dupStart = requests.length;
  const dupPayment = await payment.payForOrder(codOrder.id, payment.BACKEND_PAYMENT_METHODS.CARD);
  check(requests[dupStart]?.method === "POST", "duplicate payment POSTs first");
  check(
    requests.slice(dupStart).some((r) => r.method === "GET" && /\/api\/v1\/payments\/orders\/\d+$/.test(r.url)),
    "duplicate payment recovers idempotently by reading the existing payment"
  );
  check(
    dupPayment?.method === "CASH_ON_DELIVERY" && dupPayment?.status === "PENDING",
    "recovery returns the existing COD payment, never a fabricated one"
  );

  // A fresh order paid by card completes instantly on the backend.
  const cardOrder = await orders.createOrder({
    items: [{ productId: 7, name: "Headphones", price: 1, quantity: 2 }],
    shipping: { address: "2 Main St", city: "Springfield", zip: "62701", country: "US" },
  });
  const cardPayment = await payment.payForOrder(cardOrder.id, payment.BACKEND_PAYMENT_METHODS.CARD);
  check(cardPayment?.method === "CARD" && cardPayment?.status === "COMPLETED", "card payment completes instantly on the backend");
  check(cardPayment?.paidAt != null, "completed card payment carries a paidAt");
  const cardRecorded = orders.recordPaymentForOrder(cardOrder.id, { ...cardPayment, last4: "4242" });
  check(cardRecorded?.payment?.method === "CARD" && cardRecorded?.payment?.status === "COMPLETED", "recordPaymentForOrder attaches the completed card payment");
  check(orders.getOrderById(cardOrder.id)?.payment?.last4 === "4242", "storefront-only last4 rides along on the cached order");

  // Input validation is local (no backend request).
  const guardStart = requests.length;
  let missingId = null;
  try { await payment.payForOrder(null, "CARD"); } catch (e) { missingId = e; }
  check(missingId?.status === 400, "payForOrder rejects a missing order id");
  check(requests.length === guardStart, "missing order id fails before any request");
  let missingMethod = null;
  try { await payment.payForOrder(cardOrder.id, ""); } catch (e) { missingMethod = e; }
  check(missingMethod?.status === 400, "payForOrder rejects a missing payment method");
  check(requests.length === guardStart, "missing method fails before any request");

  // Backend rejections surface and never fabricate a payment or a local
  // order; the cached order simply keeps whatever it had.
  let payReject = null;
  try { await payment.payForOrder(999, payment.BACKEND_PAYMENT_METHODS.CARD); } catch (e) { payReject = e; }
  check(payReject?.status === 400 && payReject?.message.includes("CANCELLED"), "backend payment rejection surfaces the error");
  const afterFailPayment = orders.getOrderById(cardOrder.id)?.payment;
  check(
    afterFailPayment?.method === "CARD" && afterFailPayment?.status === "COMPLETED",
    "failed payment does not fabricate a payment on cached orders"
  );

  // Reading a payment for an order that has none surfaces the backend 404.
  let noPayment = null;
  try { await payment.getPaymentByOrderId(888); } catch (e) { noPayment = e; }
  check(noPayment?.status === 404, "getPaymentByOrderId surfaces 404 when no payment exists");

  // Authentication guard: signed-out payment calls reject 401 without a
  // request (mirrors createOrder).
  auth.logout();
  const signedOutStart = requests.length;
  let payAuthError = null;
  try { await payment.payForOrder(cardOrder.id, payment.BACKEND_PAYMENT_METHODS.COD); } catch (e) { payAuthError = e; }
  check(payAuthError?.status === 401, "signed-out payForOrder rejects 401");
  let readAuthError = null;
  try { await payment.getPaymentByOrderId(cardOrder.id); } catch (e) { readAuthError = e; }
  check(readAuthError?.status === 401, "signed-out getPaymentByOrderId rejects 401");
  check(requests.length === signedOutStart, "signed-out payment calls make no request");

  // Checkout only clears the cart after the payment is recorded: the
  // page maps the chosen method through BACKEND_PAYMENT_METHODS and only
  // then empties the cart, and it contains no simulated gateway.
  const checkoutSrc = readFileSync(join(ROOT, "js", "pages", "checkout.js"), "utf8");
  check(
    checkoutSrc.indexOf("payForOrder(") !== -1 &&
      checkoutSrc.indexOf("payForOrder(") < checkoutSrc.indexOf("clearCart("),
    "checkout records the payment before clearing the cart"
  );
  check(
    checkoutSrc.indexOf("recordPaymentForOrder(") < checkoutSrc.indexOf("clearCart("),
    "checkout attaches the payment before clearing the cart"
  );
  check(
    checkoutSrc.includes("BACKEND_PAYMENT_METHODS[values.paymentMethod]"),
    "checkout maps the selected method through BACKEND_PAYMENT_METHODS"
  );
  check(
    !/Paystack|paystack|Stripe|PaymentIntent|setTimeout/.test(checkoutSrc),
    "checkout contains no fake/simulated payment gateway behaviour"
  );

  // Restore a session for the later seller tests.
  auth.setSession({
    token: "TOK-1",
    user: { id: "u1", firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" },
  });

  /* ==========================================================
     [I] Seller service (Spring Boot backend) + enum alignment
     ========================================================== */
  section("sellerService");
  const seller = await import(app("js/services/sellerService.js"));
  check(seller.PRODUCT_STATUS.ACTIVE === "ACTIVE", "PRODUCT_STATUS.ACTIVE");
  check(seller.PRODUCT_STATUS.INACTIVE === "INACTIVE", "PRODUCT_STATUS.INACTIVE");
  check(seller.PRODUCT_STATUS.DRAFT === undefined, "no legacy DRAFT status");

  // The backend is authoritative: no seed/demo catalogue is stored and
  // reads start empty until the first successful sync.
  globalThis.window.localStorage.removeItem("marketplace.seller.products");
  check(seller.getSellerProducts().length === 0, "no seed/demo catalogue is stored");

  // Signed-in SELLER session is already active from the orders tests.
  const syncedProducts = await seller.syncSellerProducts();
  check(Array.isArray(syncedProducts) && syncedProducts.length === 1, "syncSellerProducts fetches /products/mine");
  const mineReq = requests.find((r) => r.url.includes("/api/v1/products/mine"));
  check(mineReq?.headers?.Authorization === "Bearer TOK-1", "seller product sync sends the Supabase token as Bearer");
  check(seller.getSellerProduct(1)?.name === "Test Widget", "synced products are cached for the dashboard");
  check(seller.getSellerProduct(1)?.category === "Electronics", "categoryName maps to the UI category field");
  check(seller.getSellerProduct(1)?.categoryId === 2, "categoryId is kept");
  check(seller.getSellerProduct(1)?.sku === "TW-001", "SKU is kept");
  check(seller.getSellerProduct(1)?.rating === 4.5 && seller.getSellerProduct(1)?.reviewsCount === 7, "averageRating/reviewCount map to rating/reviewsCount");
  check(seller.getSellerProduct(1)?.oldPrice === 0, "oldPrice reads back as 0 (not stored by the backend)");
  check(seller.getSellerProduct(1)?.sellerId === 900, "backend sellerId is surfaced read-only");

  // Create -> POST /products with only the ProductRequest fields.
  const createStart = requests.length;
  const created = await seller.createProduct({
    name: "QA Widget",
    description: "A widget",
    price: 5,
    oldPrice: 9,
    stock: 3,
    sku: "QA-001",
    imageUrl: "https://example.com/qa.jpg",
    category: "Electronics",
    categoryId: 2,
    status: "ACTIVE",
  });
  const createReq = requests[createStart];
  check(createReq?.method === "POST" && createReq.url.includes("/api/v1/products"), "createProduct POSTs /api/v1/products");
  const createBody = JSON.parse(createReq.body);
  check(createBody.name === "QA Widget" && createBody.price === 5 && createBody.stock === 3, "createProduct sends name/price/stock");
  check(createBody.sku === "QA-001", "createProduct sends sku");
  check(createBody.categoryId === 2, "createProduct sends categoryId");
  check(createBody.status === "ACTIVE", "createProduct sends status");
  check(createBody.category === undefined && createBody.oldPrice === undefined, "createProduct never sends category name or oldPrice");
  check(createBody.sellerId === undefined, "createProduct never sends a sellerId (backend derives owner)");
  check(createReq.headers.Authorization === "Bearer TOK-1", "createProduct sends the auth token");
  check(created.id === 1 && created.name === "QA Widget" && created.status === "ACTIVE", "createProduct unwraps the backend product");
  check(seller.getSellerProduct(created.id)?.id === 1, "created product is cached for getSellerProduct");

  // Update -> PUT /products/{id}.
  const updatedProdDto = await seller.updateProduct(created.id, {
    name: "QA Widget 2",
    price: 6,
    sku: "QA-002",
    status: "INACTIVE",
    categoryId: 2,
  });
  const updateReq = requests[requests.length - 1];
  check(updateReq?.method === "PUT" && updateReq.url.includes("/api/v1/products/1"), "updateProduct PUTs /products/{id}");
  check(JSON.parse(updateReq.body)?.sku === "QA-002" && JSON.parse(updateReq.body)?.status === "INACTIVE", "updateProduct sends the updated fields");
  check(updatedProdDto?.name === "QA Widget 2" && updatedProdDto?.status === "INACTIVE", "updateProduct returns the mapped backend product");

  // Delete -> DELETE /products/{id}.
  const deleted = await seller.deleteProduct(created.id);
  check(deleted === true, "deleteProduct resolves true");
  check(requests[requests.length - 1].method === "DELETE" && requests[requests.length - 1].url.includes("/api/v1/products/1"), "deleteProduct DELETEs /products/{id}");
  check(seller.getSellerProduct(created.id) === null, "deleted product is dropped from the cache");

  // Backend errors surface - no local product is ever fabricated.
  const cacheBeforeError = seller.getSellerProducts().length;
  let conflictError = null;
  try {
    await seller.createProduct({ name: "Dup", sku: "DUP", price: 1, stock: 1, categoryId: 2 });
  } catch (error) {
    conflictError = error;
  }
  check(conflictError?.status === 409 && conflictError?.message.includes("already exists"), "backend rejection (409 SKU conflict) surfaces an error");
  check(seller.getSellerProducts().length === cacheBeforeError, "failed create does not cache a local product");

  // Authentication guard: signed-out seller operations reject 401 without a request.
  auth.logout();
  const signedOutRequestCount = requests.length;
  let authError = null;
  try {
    await seller.syncSellerProducts();
  } catch (error) {
    authError = error;
  }
  check(authError?.status === 401, "signed-out seller sync rejects 401");
  check(requests.length === signedOutRequestCount, "no backend request is made when signed out");

  // Restore the session for the seller orders + analytics tests.
  auth.setSession({
    token: "TOK-1",
    user: { id: "u1", firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" },
  });

  // Seller orders delegate to the backend orders service.
  const sellerOrder = await seller.syncSellerOrders();
  check(Array.isArray(sellerOrder) && sellerOrder.length === 1, "syncSellerOrders pulls /orders/seller");
  const sellerStatus = await seller.updateSellerOrderStatus(42, "SHIPPED");
  check(sellerStatus?.status === "SHIPPED", "updateSellerOrderStatus advances status via the backend");

  // Analytics summary.
  const summary = await seller.getSellerSummary();
  check(summary.totalProducts === 5 && summary.totalRevenue === 499.95, "getSellerSummary maps totalProducts + totalRevenue");
  check(summary.pendingOrders === 3 && summary.deliveredOrders === 4 && summary.cancelledOrders === 1, "getSellerSummary maps order counters");
  check(summary.totalItemsSold === 25 && summary.averageRating === 4.4, "getSellerSummary maps itemsSold + averageRating");

  // Analytics panels.
  const top = await seller.getTopProducts(5);
  check(Array.isArray(top) && top.length === 2 && top[0].name === "Test Widget", "getTopProducts maps top products");
  check(top[0].quantitySold === 12 && top[0].revenue === 239.88, "top product carries units + revenue");
  check(requests[requests.length - 1].url.includes("limit=5"), "top products sends the limit param");

  const categories = await seller.getSalesByCategory();
  check(categories.length === 2 && categories[0].categoryName === "Electronics", "getSalesByCategory maps category sales");
  check(categories[0].quantitySold === 20 && categories[0].revenue === 399.8, "category sales carry units + revenue");

  const timeline = await seller.getRevenueTimeline(30);
  check(timeline.length === 2 && timeline[0].date === "2026-08-07" && timeline[0].amount === 49.99, "getRevenueTimeline maps daily revenue");
  check(requests[requests.length - 1].url.includes("days=30"), "revenue timeline sends the days param");

  // Analytics also require a signed-in session.
  auth.logout();
  let analyticsAuthError = null;
  try {
    await seller.getSellerSummary();
  } catch (error) {
    analyticsAuthError = error;
  }
  check(analyticsAuthError?.status === 401, "signed-out analytics rejects 401");

  // Restore a session for the later admin tests.
  auth.setSession({
    token: "TOK-1",
    user: { id: "u1", firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" },
  });

  /* ==========================================================
     [J] Admin service (Spring Boot backend)
     ========================================================== */
  section("adminService");
  const admin = await import(app("js/services/adminService.js"));

  // The backend is authoritative: no seed/demo admin data is stored
  // and reads start empty until the first successful sync.
  globalThis.window.localStorage.removeItem("marketplace.admin.users");
  globalThis.window.localStorage.removeItem("marketplace.admin.categories");
  check(admin.getUsers().length === 0, "no seed users are stored");
  check(admin.getCategories().length === 0, "no seed categories are stored");

  // Admin operations require a signed-in ADMIN session.
  auth.logout();
  let signedOutAdminError = null;
  try {
    await admin.syncUsers();
  } catch (error) {
    signedOutAdminError = error;
  }
  check(signedOutAdminError?.status === 401, "signed-out admin sync rejects 401");

  // Non-admin sessions are rejected locally before any request.
  auth.setSession({
    token: "TOK-1",
    user: { id: "u2", firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" },
  });
  const before403 = requests.length;
  let roleGuardError = null;
  try {
    await admin.syncUsers();
  } catch (error) {
    roleGuardError = error;
  }
  check(roleGuardError?.status === 403, "non-admin sync rejects 403");
  check(requests.length === before403, "403 is enforced locally without a request");

  // fetchCatalogCategories is a PUBLIC read: no ADMIN required and the
  // admin category cache is left untouched (the seller form uses it to
  // resolve backend category ids by name).
  const publicCatsStart = requests.length;
  const publicCats = await admin.fetchCatalogCategories();
  check(Array.isArray(publicCats) && publicCats.length === 3, "fetchCatalogCategories flattens the public GET /categories");
  check(publicCats[0].name === "Electronics" && publicCats[1].name === "Headphones", "fetchCatalogCategories flattens nested subcategories");
  check(requests[publicCatsStart]?.method === "GET" && requests[publicCatsStart].url.includes("/api/v1/categories"), "fetchCatalogCategories GETs /categories without admin");
  check(admin.getCategories().length === 0, "public category read does not touch the admin cache");

  // Category CRUD stays ADMIN-authoritative: a seller is rejected
  // locally before any request reaches the backend.
  const sellerCatStart = requests.length;
  let sellerCatError = null;
  try {
    await admin.createCategory("Sneaky");
  } catch (error) {
    sellerCatError = error;
  }
  check(sellerCatError?.status === 403, "non-admin category creation is rejected 403");
  check(requests.length === sellerCatStart, "category CRUD 403 is enforced locally without a request");

  // Restore the ADMIN session for the sync tests.
  auth.setSession({
    token: "TOK-1",
    user: { id: "u1", firstName: "Ada", lastName: "Lovelace", email: "ada@t.com", role: "ADMIN" },
  });

  // Users load from GET /admin/users (paged) with role reconciliation.
  const users = await admin.syncUsers();
  check(Array.isArray(users) && users.length === 3, "syncUsers fetches paged platform users");
  check(users[0].role === "ADMIN" && users[1].role === "SELLER", "backend ADMIN/SELLER roles map to UI roles");
  check(users[2].role === "BUYER", "backend CUSTOMER maps to UI BUYER");
  const usersReq = requests.find((r) => r.url.includes("/api/v1/admin/users"));
  check(usersReq?.headers?.Authorization === "Bearer TOK-1", "admin user sync sends the Supabase token as Bearer");
  check(admin.getUsers().length === 3, "synced users are cached for the dashboard");

  // Role change -> PUT /admin/users/{id}/role with { roleName }.
  const promoteStart = requests.length;
  const promoted = await admin.updateUserRole(3, "SELLER");
  const promoteReq = requests[promoteStart];
  check(promoteReq?.method === "PUT" && promoteReq.url.includes("/api/v1/admin/users/3/role"), "updateUserRole PUTs /admin/users/{id}/role");
  check(JSON.parse(promoteReq.body)?.roleName === "SELLER", "role change sends { roleName }");
  check(promoted?.role === "SELLER", "updateUserRole returns the mapped backend user");
  check(admin.getUsers().find((u) => u.id === 3)?.role === "SELLER", "updated user is cached");

  // BUYER -> CUSTOMER outbound mapping.
  const demoteStart = requests.length;
  await admin.updateUserRole(3, "BUYER");
  check(JSON.parse(requests[demoteStart].body)?.roleName === "CUSTOMER", "UI BUYER maps to backend CUSTOMER outbound");

  check(await admin.updateUserRole(3, "NOPE") === null, "updateUserRole rejects bad role without a request");

  // Self-demotion is blocked locally to mirror the backend rule.
  let selfDemoteError = null;
  try {
    await admin.updateUserRole(auth.getCurrentUser().id, "BUYER");
  } catch (error) {
    selfDemoteError = error;
  }
  check(selfDemoteError?.status === 400 && selfDemoteError?.message.includes("own role"), "self-demotion is rejected with 400");

  // Unknown users surface the backend 404.
  let missingUserError = null;
  try {
    await admin.updateUserRole(999, "SELLER");
  } catch (error) {
    missingUserError = error;
  }
  check(missingUserError?.status === 404, "unknown user surfaces a backend 404");

  // Product moderation reuses PUT /products/{id}.
  const adminProducts = await admin.syncAdminProducts();
  check(Array.isArray(adminProducts) && adminProducts.length === 1, "syncAdminProducts pulls the platform catalogue");
  const moderated = await admin.updateProductStatus(1, "INACTIVE");
  check(moderated?.status === "INACTIVE", "product moderation toggles status via the backend");
  check(requests[requests.length - 1].url.includes("/api/v1/products/1"), "moderation PUTs /products/{id}");
  check(await admin.updateProductStatus(1, "NOPE") === null, "updateProductStatus rejects bad status without a request");

  // Categories load from GET /categories (nested response flattened).
  const adminCats = await admin.syncCategories();
  check(Array.isArray(adminCats) && adminCats.length === 3, "syncCategories flattens nested backend categories");
  check(adminCats[0].name === "Electronics" && adminCats[1].name === "Headphones", "subcategories are flattened into the UI list");
  check(requests.find((r) => r.url.includes("/api/v1/categories") && r.method === "GET")?.url.includes("/api/v1/categories"), "categories load via GET /categories");
  check(admin.getCategories().length === 3, "synced categories are cached");
  check(admin.getCategories().find((c) => c.name === "Electronics")?.productCount === 1, "category product counts derive from the catalogue");

  // Create -> POST /categories; blank names are rejected without a request.
  const createCatStart = requests.length;
  const newCat = await admin.createCategory("Phase 13 QA");
  check(requests[createCatStart]?.method === "POST" && requests[createCatStart].url.includes("/api/v1/categories"), "createCategory POSTs /categories");
  check(JSON.parse(requests[createCatStart].body)?.name === "Phase 13 QA", "createCategory sends the name");
  check(newCat?.name === "Phase 13 QA", "createCategory returns the mapped backend category");
  check(admin.getCategories().length === 4, "created category is cached");
  check(await admin.createCategory("") === null, "createCategory rejects blank names without a request");

  // Duplicate names surface the backend 409.
  let dupCatError = null;
  try {
    await admin.createCategory("DUP");
  } catch (error) {
    dupCatError = error;
  }
  check(dupCatError?.status === 409 && dupCatError?.message.includes("already exists"), "duplicate category surfaces a 409");

  // Delete -> DELETE /categories/{id}.
  const deletedCat = await admin.deleteCategory(newCat.id);
  check(deletedCat === true, "deleteCategory resolves true");
  check(requests[requests.length - 1].method === "DELETE" && requests[requests.length - 1].url.includes(`/api/v1/categories/${newCat.id}`), "deleteCategory DELETEs /categories/{id}");
  check(admin.getCategories().length === 3, "deleted category is dropped from the cache");

  // Admin orders reuse the backend order scope.
  const adminOrders = await admin.syncAdminOrders();
  check(Array.isArray(adminOrders) && adminOrders.length === 1, "syncAdminOrders pulls /orders/admin");
  check(requests[requests.length - 1].url.includes("/api/v1/orders/admin"), "admin order sync targets /orders/admin");
  const adminStatus = await admin.updateAdminOrderStatus(42, "DELIVERED");
  check(adminStatus?.status === "DELIVERED", "updateAdminOrderStatus advances status via the backend");

  // Admin analytics.
  const asummary = await admin.getAdminSummary();
  check(asummary.totalUsers === 3 && asummary.totalRevenue === 1299.5, "getAdminSummary maps platform totals");
  check(asummary.totalOrders === 10 && asummary.pendingOrders === 3, "getAdminSummary maps order counters");
  check(asummary.totalReviews === 12 && asummary.completedPayments === 8, "getAdminSummary maps reviews + payments");

  const atop = await admin.getTopProducts(10);
  check(Array.isArray(atop) && atop[0].name === "Test Widget", "getTopProducts maps top products");
  check(requests[requests.length - 1].url.includes("limit=10"), "top products sends the limit param");

  const acats = await admin.getSalesByCategory();
  check(acats.length === 2 && acats[0].categoryName === "Electronics", "getSalesByCategory maps category sales");

  const atl = await admin.getRevenueTimeline(30);
  check(atl.length === 2 && atl[0].amount === 49.99, "getRevenueTimeline maps daily revenue");
  check(requests[requests.length - 1].url.includes("days=30"), "revenue timeline sends the days param");

  // Restore a session for the later profile tests.
  auth.setSession({
    token: "TOK-1",
    user: { id: "u1", firstName: "Jane", lastName: "Doe", email: "jane@t.com", role: "SELLER" },
  });

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

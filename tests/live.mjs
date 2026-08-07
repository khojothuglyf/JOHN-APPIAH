/* ============================================================
   PHASE 13 - LIVE BACKEND ALIGNMENT
   Run: node tests/live.mjs        (default http://localhost:8080/api/v1)
        BASE_URL=http://localhost:8081 node tests/live.mjs

   Requires the Spring Boot backend to be running. If it is not
   reachable this script prints "SKIPPED" and exits 0 so it never
   fails the normal local test run.

   Verifies the real HTTP contract for every endpoint the frontend
   config advertises as live:
   - ApiResponse envelope: { success, message, data, timestamp }
   - paged collections:   { content, page, size, totalElements,
                            totalPages, last }
   - auth: accessToken / tokenType / expiresIn / user.role
   - full CRUD flow: category -> product -> wishlist -> cart -> order
     -> seller status update -> analytics -> notifications
   ============================================================ */

const BASE = (process.env.BASE_URL || "http://localhost:8080/api/v1").replace(/\/$/, "");

let passed = 0;
let failed = 0;
const check = (cond, label) => {
  if (cond) {
    passed++;
    console.log(`  ok: ${label}`);
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, { token, body } = {}, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON body (e.g. security filter 401) */
      }
      return { status: res.status, ok: res.ok, json, text };
    } catch (error) {
      if (attempt >= retries) throw error;
      await sleep(500);
    }
  }
}

const envelope = (r) =>
  r.json && typeof r.json.success === "boolean" && "message" in r.json && "data" in r.json && "timestamp" in r.json;
const unwrap = (r, label) => {
  check(r.ok && envelope(r), label);
  return r.json?.data;
};

const run = async () => {
  console.log(`\n[probe] ${BASE}/health`);
  let up = true;
  try {
    const h = await api("GET", "/health");
    console.log(`  health status ${h.status}${h.text.slice(0, 120) ? `: ${h.text.slice(0, 120)}` : ""}`);
  } catch {
    up = false;
  }
  if (!up) {
    console.log("\nSKIPPED - backend not reachable (start it, then rerun node tests/live.mjs)");
    process.exit(0);
  }

  /* ---------- Auth ---------- */
  console.log("\n[auth]");
  const bad = await api("POST", "/auth/login", { body: { email: "nobody@nowhere.invalid", password: "WrongPass1" } });
  check(bad.status === 401 && bad.json && bad.json.success === false, "bad login -> 401 error envelope");

  const adminLogin = await api("POST", "/auth/login", { body: { email: "admin@marketplace.com", password: "AdminPass123" } });
  const adminData = unwrap(adminLogin, "admin login unwraps AuthResponse");
  check(adminData?.accessToken && adminData?.user?.role === "ADMIN", "AuthResponse has accessToken + user.role=ADMIN");
  const adminToken = adminData.accessToken;

  const stamp = Date.now();
  const sellerEmail = `phase13-seller-${stamp}@live.test`;
  const sellerReg = await api("POST", "/auth/register", {
    body: { firstName: "Live", lastName: "Seller", email: sellerEmail, password: "LiveTest123!", roleName: "SELLER" },
  });
  const sellerData = unwrap(sellerReg, "seller register unwraps AuthResponse");
  check(sellerData?.user?.role === "SELLER", "register honours roleName=SELLER");
  const sellerToken = sellerData.accessToken;

  const customerEmail = `phase13-customer-${stamp}@live.test`;
  const customerReg = await api("POST", "/auth/register", {
    body: { firstName: "Live", lastName: "Customer", email: customerEmail, password: "LiveTest123!", roleName: "CUSTOMER" },
  });
  const customerData = unwrap(customerReg, "customer register unwraps AuthResponse");
  const customerToken = customerData.accessToken;

  /* ---------- Categories (admin create, public read) ---------- */
  console.log("\n[categories]");
  const catCreate = await api("POST", "/categories", { token: adminToken, body: { name: `Phase13-${stamp}`, description: "Live test category" } });
  const category = unwrap(catCreate, "admin creates category");
  check(category?.id > 0, `category has id (${category?.id})`);
  const catList = await api("GET", "/categories");
  const cats = unwrap(catList, "public GET /categories unwraps list");
  check(Array.isArray(cats) && cats.some((c) => c.id === category.id), "created category visible in list");

  /* ---------- Products (seller create, public read, /mine) ---------- */
  console.log("\n[products]");
  const prodCreate = await api("POST", "/products", {
    token: sellerToken,
    body: {
      name: `Live QA Product ${stamp}`,
      description: "Created by the Phase 13 live alignment suite",
      price: 19.99,
      stock: 100,
      sku: `LIVE-${stamp}`,
      imageUrl: "",
      categoryId: category.id,
      status: "ACTIVE",
    },
  });
  const product = unwrap(prodCreate, "seller creates product");
  check(product?.id > 0 && product?.category?.id === category.id, "product has id + nested category");
  const pub = await api("GET", `/products/${product.id}`);
  const pubProd = unwrap(pub, "public product detail");
  check(pubProd?.id === product.id, "product detail returns same id");
  const mine = await api("GET", "/products/mine", { token: sellerToken });
  const mineData = unwrap(mine, "seller GET /products/mine");
  check(mineData?.content?.some((p) => p.id === product.id), "created product in /products/mine");

  /* ---------- Wishlist (customer) ---------- */
  console.log("\n[wishlist]");
  const wCheckEmpty = await api("GET", `/wishlist/check/${product.id}`, { token: customerToken });
  check(unwrap(wCheckEmpty, "check endpoint") === false, "product not wishlisted initially");
  const wAdd = await api("POST", `/wishlist/${product.id}`, { token: customerToken });
  const wItem = unwrap(wAdd, "wishlist add unwraps WishlistItemResponse");
  check(wItem?.productId === product.id && wItem?.productName, "wishlist item has productId + productName");
  const wList = await api("GET", "/wishlist", { token: customerToken });
  const wData = unwrap(wList, "GET /wishlist unwraps paged data");
  check(wData?.content?.some((i) => i.productId === product.id), "wishlisted product in list");
  const wCheckNow = await api("GET", `/wishlist/check/${product.id}`, { token: customerToken });
  check(unwrap(wCheckNow, "check endpoint after add") === true, "check reports true after add");
  const wRemove = await api("DELETE", `/wishlist/${product.id}`, { token: customerToken });
  check(wRemove.ok && envelope(wRemove), "wishlist remove returns envelope");
  const wCheckGone = await api("GET", `/wishlist/check/${product.id}`, { token: customerToken });
  check(unwrap(wCheckGone, "check endpoint after remove") === false, "check reports false after remove");

  /* ---------- Cart + Order (customer -> seller) ---------- */
  console.log("\n[cart + orders]");
  const cartAdd = await api("POST", "/cart/items", { token: customerToken, body: { productId: product.id, quantity: 2 } });
  const cartAfterAdd = unwrap(cartAdd, "cart add returns CartResponse");
  const cartItem = cartAfterAdd?.items?.find((i) => i.productId === product.id);
  check(!!cartItem, "cart contains added product");
  check(Number(cartAfterAdd?.totalPrice) === 39.98, `cart total = 2 x 19.99 (got ${cartAfterAdd?.totalPrice})`);

  const cartUpdate = await api("PUT", `/cart/items/${cartItem.id}`, { token: customerToken, body: { quantity: 3 } });
  const cartAfterUpdate = unwrap(cartUpdate, "cart quantity update returns CartResponse");
  const cartItem2 = cartAfterUpdate?.items?.find((i) => i.productId === product.id);
  check(Number(cartItem2?.quantity) === 3, "cart quantity updated to 3");

  const orderCreate = await api("POST", "/orders", {
    token: customerToken,
    body: { shippingAddress: "1 Live Test Ave", city: "Testville", postalCode: "12345", country: "Testland", couponCode: null },
  });
  const order = unwrap(orderCreate, "checkout returns OrderResponse");
  check(order?.id > 0 && order?.orderNumber, "order has id + orderNumber");
  check(order?.status === "PENDING", "order starts PENDING");

  const myOrders = unwrap(await api("GET", "/orders", { token: customerToken }), "customer GET /orders");
  check(myOrders?.content?.some((o) => o.id === order.id), "order visible in customer orders");
  const sellerOrders = unwrap(await api("GET", "/orders/seller", { token: sellerToken }), "seller GET /orders/seller");
  check(sellerOrders?.content?.some((o) => o.id === order.id), "order visible in seller orders");

  const statusUpdate = await api("PUT", `/orders/${order.id}/status`, { token: sellerToken, body: { status: "SHIPPED" } });
  const updatedOrder = unwrap(statusUpdate, "seller updates order status");
  check(updatedOrder?.status === "SHIPPED", "order status now SHIPPED");

  const adminOrders = unwrap(await api("GET", "/orders/admin", { token: adminToken }), "admin GET /orders/admin");
  check(adminOrders?.content?.some((o) => o.id === order.id), "order visible in admin orders");

  /* ---------- Analytics ---------- */
  console.log("\n[analytics]");
  const sSummary = unwrap(await api("GET", "/seller/analytics/summary", { token: sellerToken }), "seller summary");
  check(sSummary != null && typeof sSummary.totalProducts === "number", "SellerSummaryResponse has totalProducts");
  const sTop = unwrap(await api("GET", "/seller/analytics/top-products?limit=5", { token: sellerToken }), "seller top-products");
  check(Array.isArray(sTop), "seller top-products is an array");
  const sByCat = unwrap(await api("GET", "/seller/analytics/sales-by-category", { token: sellerToken }), "seller sales-by-category");
  check(Array.isArray(sByCat), "seller sales-by-category is an array");
  const sRev = unwrap(await api("GET", "/seller/analytics/revenue-timeline?days=7", { token: sellerToken }), "seller revenue-timeline");
  check(Array.isArray(sRev), "seller revenue-timeline is an array");

  const aSummary = unwrap(await api("GET", "/admin/analytics/summary", { token: adminToken }), "admin summary");
  check(aSummary != null && typeof aSummary.totalUsers === "number", "AdminSummaryResponse has totalUsers");
  const aTop = unwrap(await api("GET", "/admin/analytics/top-products?limit=5", { token: adminToken }), "admin top-products");
  check(Array.isArray(aTop), "admin top-products is an array");
  const aByCat = unwrap(await api("GET", "/admin/analytics/sales-by-category", { token: adminToken }), "admin sales-by-category");
  check(Array.isArray(aByCat), "admin sales-by-category is an array");
  const aRev = unwrap(await api("GET", "/admin/analytics/revenue-timeline?days=7", { token: adminToken }), "admin revenue-timeline");
  check(Array.isArray(aRev), "admin revenue-timeline is an array");

  /* ---------- Authorization guards ---------- */
  console.log("\n[authorization]");
  const customerHitsAdmin = await api("GET", "/admin/analytics/summary", { token: customerToken });
  check(customerHitsAdmin.status === 403, "customer blocked from admin analytics (403)");
  const sellerHitsAdmin = await api("GET", "/admin/analytics/summary", { token: sellerToken });
  check(sellerHitsAdmin.status === 403, "seller blocked from admin analytics (403)");
  const anonHitsSeller = await api("GET", "/seller/analytics/summary");
  check(anonHitsSeller.status === 401 || anonHitsSeller.status === 403, "anon blocked from seller analytics (401/403)");

  /* ---------- Notifications ---------- */
  console.log("\n[notifications]");
  const notif = unwrap(await api("GET", "/notifications", { token: customerToken }), "customer notifications paged");
  check(notif && Array.isArray(notif.content), "notifications content is an array");
  const unread = unwrap(await api("GET", "/notifications/unread-count", { token: customerToken }), "unread count");
  check(unread != null && typeof unread.count === "number", "UnreadCountResponse has numeric count");

  /* ---------- Cleanup (best effort) ---------- */
  console.log("\n[cleanup]");
  try {
    await api("DELETE", `/cart/items/${cartItem2.id}`, { token: customerToken });
    await api("DELETE", "/cart", { token: customerToken });
    await api("DELETE", `/products/${product.id}`, { token: sellerToken });
    await api("DELETE", `/categories/${category.id}`, { token: adminToken });
    console.log("  ok: cleaned up cart / product / category");
  } catch {
    console.log("  warn: cleanup incomplete (order intentionally kept)");
  }

  console.log(
    failed === 0
      ? `\nLIVE ALIGNMENT PASSED (${passed} checks)`
      : `\nLIVE ALIGNMENT FAILED: ${failed} of ${passed + failed} checks`
  );
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error("LIVE TEST ERROR:", error?.message || error);
  process.exitCode = 1;
});

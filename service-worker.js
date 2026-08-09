/* ============================================================
   SERVICE WORKER - Marketplace PWA
   Offline support + app-shell caching.
   - Precache: the full app shell (HTML / CSS / JS / images /
     icons / shared components / manifest).
   - Navigations: network-first; on failure serve the cached copy,
     then the offline page.
   - Same-origin static assets: cache-first with background refresh.
   - Cross-origin (Google Fonts): cache-first, opaque-safe.
   - API requests: network-only - NEVER cached. Auth tokens and
     user data must never touch the cache.
   The PRECACHE_URLS list and API_ORIGIN are regenerated at build
   time by scripts/build.mjs (see the marked blocks below); the
   committed values are the local-development set.
   ============================================================ */

const VERSION = "1.0.0";
const CACHE_NAME = `marketplace-${VERSION}`;
const RUNTIME_CACHE = "marketplace-runtime";
const OFFLINE_URL = "/pages/offline.html";

/*__PRECACHE_BEGIN__*/
const PRECACHE_URLS = [
  "/components/footer.html",
  "/components/navbar.html",
  "/css/base/animations.css",
  "/css/base/base.css",
  "/css/base/reset.css",
  "/css/base/typography.css",
  "/css/base/variables.css",
  "/css/components/alert.css",
  "/css/components/backtotop.css",
  "/css/components/badges.css",
  "/css/components/breadcrumb.css",
  "/css/components/buttons.css",
  "/css/components/cards.css",
  "/css/components/drawer.css",
  "/css/components/dropdown.css",
  "/css/components/forms.css",
  "/css/components/modal.css",
  "/css/components/pagination.css",
  "/css/components/searchbar.css",
  "/css/components/skeleton.css",
  "/css/components/spinner.css",
  "/css/components/toast.css",
  "/css/layout/container.css",
  "/css/layout/footer.css",
  "/css/layout/grid.css",
  "/css/layout/navbar.css",
  "/css/main.css",
  "/css/pages/admin-dashboard.css",
  "/css/pages/auth.css",
  "/css/pages/cart.css",
  "/css/pages/catalog.css",
  "/css/pages/checkout.css",
  "/css/pages/home.css",
  "/css/pages/orders.css",
  "/css/pages/pages.css",
  "/css/pages/profile.css",
  "/css/pages/seller-dashboard.css",
  "/css/pages/wishlist.css",
  "/css/utilities/utilities.css",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/images/favicon.svg",
  "/images/logo.svg",
  "/images/placeholder.svg",
  "/index.html",
  "/js/api-config.js",
  "/js/app.js",
  "/js/components/backToTop.js",
  "/js/components/cards.js",
  "/js/components/footer.js",
  "/js/components/loader.js",
  "/js/components/navbar.js",
  "/js/components/orderCard.js",
  "/js/components/toast.js",
  "/js/components/wishlistButton.js",
  "/js/config.js",
  "/js/pages/admin-dashboard.js",
  "/js/pages/cart.js",
  "/js/pages/categories.js",
  "/js/pages/checkout.js",
  "/js/pages/forgot-password.js",
  "/js/pages/home.js",
  "/js/pages/login.js",
  "/js/pages/order-confirmation.js",
  "/js/pages/orders.js",
  "/js/pages/product-details.js",
  "/js/pages/products.js",
  "/js/pages/profile.js",
  "/js/pages/register.js",
  "/js/pages/reset-password.js",
  "/js/pages/seller-dashboard.js",
  "/js/pages/wishlist.js",
  "/js/services/adminService.js",
  "/js/services/api.js",
  "/js/services/authService.js",
  "/js/services/cartService.js",
  "/js/services/categoryService.js",
  "/js/services/ordersService.js",
  "/js/services/productService.js",
  "/js/services/profileService.js",
  "/js/services/sellerService.js",
  "/js/services/supabase.js",
  "/js/services/wishlistService.js",
  "/js/sw-register.js",
  "/js/utils/dom.js",
  "/js/utils/form.js",
  "/js/utils/format.js",
  "/js/utils/http.js",
  "/js/utils/reveal.js",
  "/js/utils/storage.js",
  "/js/utils/validators.js",
  "/manifest.webmanifest",
  "/pages/404.html",
  "/pages/about.html",
  "/pages/admin-dashboard.html",
  "/pages/cart.html",
  "/pages/categories.html",
  "/pages/checkout.html",
  "/pages/contact.html",
  "/pages/forgot-password.html",
  "/pages/login.html",
  "/pages/offline.html",
  "/pages/order-confirmation.html",
  "/pages/orders.html",
  "/pages/product-details.html",
  "/pages/products.html",
  "/pages/profile.html",
  "/pages/register.html",
  "/pages/reset-password.html",
  "/pages/seller-dashboard.html",
  "/pages/wishlist.html"
];
/*__PRECACHE_END__*/

/* API origin of the deployed backend (rewritten at build time).
   Requests to this origin (or any request carrying an Authorization
   header) are served network-only and never cached. */
const API_ORIGIN = "https://fqvbmbnxhnnronbbpklx.supabase.co";

/* ---- Install: precache the app shell and take over immediately ---- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ---- Activate: purge stale caches, control all clients ---- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isApiRequest = (url, request) =>
  url.origin === API_ORIGIN ||
  request.headers.has("Authorization") ||
  /\/api\//.test(url.pathname);

/* Network-first with offline fallback (for page navigations). */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return caches.match("/index.html");
  }
}

/* Cache-first with background refresh (static assets, fonts). */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

/* Network-only - never touches the cache. */
function networkOnly(request) {
  return fetch(request);
}

/* ---- Fetch: route every request ---- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  /* API + anything carrying an auth token: network-only. */
  if (isApiRequest(url, request)) {
    event.respondWith(networkOnly(request));
    return;
  }

  /* Cross-origin (Google Fonts): cache-first, tolerate failures. */
  if (url.origin !== self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  /* Page navigations: network-first, fall back to offline. */
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  /* Everything else same-origin: cache-first. */
  event.respondWith(staleWhileRevalidate(request));
});

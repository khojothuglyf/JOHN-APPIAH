/* ============================================================
   SELLER SERVICE - SPRING BOOT BACKEND (via http.js)
   ============================================================
   Powers the seller dashboard: product management (CRUD), order
   fulfilment (advancing order statuses) and sales analytics
   against the existing Java / Spring Boot backend through the
   shared HTTP client (http.js).

   Security:
   - The authenticated Supabase access token is sent as
     `Authorization: Bearer ...` by http.js and validated by the
     backend's Supabase JWT bridge - there is no second auth system.
   - The backend derives the seller from the token principal; the
     browser NEVER sends a sellerId, so ownership cannot be spoofed.

   Product model reconciliation:
   - The page-facing product shape keeps the existing UI fields
     (category name, sku, oldPrice, imageUrl, rating, reviewsCount).
   - The backend ProductRequest stores: name, description, price,
     stock, sku, imageUrl, categoryId, status. oldPrice is a
     storefront-only display concept (Supabase catalogue) and is
     never sent; it reads back as 0.
   - The backend ProductResponse maps: categoryId + categoryName ->
     category/categoryName, averageRating -> rating,
     reviewCount -> reviewsCount.
   - Storefront catalogue stays Supabase-backed; the backend product
     is authoritative for seller-owned inventory. No second catalog.

   Backend contract (verified against ProductController,
   SellerAnalyticsController + OrderController):
   - GET    /api/v1/products/mine       (SELLER/ADMIN, paged)
     RESPONSE: ApiResponse<PagedResponse<ProductResponse>>
   - POST   /api/v1/products
     REQUEST:  ProductRequest { name, description, price, stock,
                sku, imageUrl, categoryId, status }
     RESPONSE: ApiResponse<ProductResponse>  (201)
   - PUT    /api/v1/products/{id}        (same request) -> ApiResponse<ProductResponse>
   - DELETE /api/v1/products/{id}        -> ApiResponse<Void>  (200)
   - GET    /api/v1/orders/seller        (SELLER/ADMIN, paged) -> ApiResponse<PagedResponse<OrderResponse>>
   - PUT    /api/v1/orders/{id}/status   { status } -> ApiResponse<OrderResponse>
   - GET    /api/v1/seller/analytics/summary
            -> ApiResponse<SellerSummaryResponse>
   - GET    /api/v1/seller/analytics/top-products?limit=N
            -> ApiResponse<List<TopProductResponse>>
   - GET    /api/v1/seller/analytics/sales-by-category
            -> ApiResponse<List<CategorySalesResponse>>
   - GET    /api/v1/seller/analytics/revenue-timeline?days=N
            -> ApiResponse<List<RevenuePointResponse>>

   ProductResponse: { id, name, description, price, stock, sku,
     imageUrl, status, categoryId, categoryName, sellerId,
     sellerName, averageRating, reviewCount, createdAt, updatedAt }
   ProductStatus enum matches the backend exactly:
   ACTIVE, INACTIVE.

   Availability: reads keep a local cache (STORAGE_KEYS.sellerProducts)
   so the dashboard renders instantly from previously synced data.
   There is NO seed/demo catalogue and the cache is never treated as
   authoritative - a failed backend call surfaces an error instead of
   fabricating or seeding data.
   ============================================================ */

import { ApiError, http } from "../utils/http.js";
import { storage } from "../utils/storage.js";
import { API_ENDPOINTS, endpointPath, STORAGE_KEYS } from "../config.js";
import { getCurrentUser } from "./authService.js";
import {
  ORDER_STATUS,
  getOrders,
  syncOrders,
  updateOrderStatus,
} from "./ordersService.js";

/** Availability states for a seller product (aligned with the
 *  backend ProductStatus enum). */
export const PRODUCT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
};

/** Number of products pulled from the backend per sync. */
const PRODUCTS_SYNC_SIZE = 100;

/** True when a signed-in session exists (even a token-less preview). */
function isSignedIn() {
  return Boolean(getCurrentUser());
}

/** Guard every backend operation behind a signed-in session. */
function requireSignedIn() {
  if (!isSignedIn()) {
    throw new ApiError(401, "Please sign in to manage your seller account.");
  }
}

/* ------------------------------------------------------------
   Local cache (page-facing reads stay synchronous)
   ------------------------------------------------------------ */

/** All cached seller products, in sync order. Never authoritative. */
export function getSellerProducts() {
  const stored = storage.get(STORAGE_KEYS.sellerProducts);
  return Array.isArray(stored) ? stored : [];
}

/** A single cached seller product by id, or null. */
export function getSellerProduct(id) {
  if (id == null) return null;
  return (
    getSellerProducts().find(
      (product) => String(product.id) === String(id)
    ) ?? null
  );
}

/** Replace the cached product list. */
function setProductsCache(products) {
  storage.set(STORAGE_KEYS.sellerProducts, products);
}

/** Insert or replace a single product in the cache. */
function upsertProductCache(product) {
  const products = getSellerProducts();
  const index = products.findIndex(
    (entry) => String(entry.id) === String(product.id)
  );
  if (index === -1) products.unshift(product);
  else products[index] = product;
  setProductsCache(products);
  return product;
}

/* ------------------------------------------------------------
   Response mapping (backend <-> frontend product shape)
   ------------------------------------------------------------ */

/** Map a ProductResponse into the existing page-facing shape. */
function mapProduct(product = {}) {
  const categoryName = product.categoryName || product.category || "";
  return {
    id: product.id,
    name: product.name || "",
    description: product.description || "",
    price: Number(product.price) || 0,
    oldPrice: Number(product.oldPrice) || 0,
    imageUrl: product.imageUrl || "",
    sku: product.sku || "",
    stock: Number(product.stock) || 0,
    status: product.status,
    category: categoryName,
    categoryId: product.categoryId ?? null,
    categoryName,
    sellerId: product.sellerId ?? null,
    sellerName: product.sellerName || "",
    rating: Number(product.averageRating) || 0,
    reviewsCount: Number(product.reviewCount) || 0,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

/** Page payload -> ProductRequest (backend-only fields). */
function toProductRequest(data = {}) {
  return {
    name: String(data.name || "").trim(),
    description: String(data.description || "").trim(),
    price: Number(data.price),
    stock: Number(data.stock),
    sku: String(data.sku || "").trim(),
    imageUrl: String(data.imageUrl || "").trim(),
    categoryId: data.categoryId != null ? Number(data.categoryId) : null,
    status: data.status || PRODUCT_STATUS.ACTIVE,
  };
}

/* ------------------------------------------------------------
   Products (backend CRUD)
   ------------------------------------------------------------ */

/**
 * Fetch the seller's products from the backend into the local cache.
 * Backend: GET /api/v1/products/mine. Resolves the mapped list.
 * Throws when the backend is unreachable or the token is rejected -
 * the caller decides how to display the error.
 */
export async function syncSellerProducts({
  page = 0,
  size = PRODUCTS_SYNC_SIZE,
} = {}) {
  requireSignedIn();
  const envelope = await http.get(API_ENDPOINTS.products.mine, {
    params: { page, size },
  });
  const content = Array.isArray(envelope?.data?.content)
    ? envelope.data.content
    : [];
  const mapped = content.map(mapProduct);
  setProductsCache(mapped);
  return mapped;
}

/**
 * Create a product in the backend. Only the ProductRequest fields
 * are sent; the backend assigns ownership from the token principal
 * and computes id/createdAt. Resolves the mapped backend product
 * (cached). Throws on backend rejection - nothing is stored locally.
 */
export async function createProduct(data = {}) {
  requireSignedIn();
  const envelope = await http.post(
    API_ENDPOINTS.products.create,
    toProductRequest(data)
  );
  const product = mapProduct(envelope?.data);
  upsertProductCache(product);
  return product;
}

/**
 * Update a product in the backend. Backend: PUT /api/v1/products/{id}.
 * Resolves the mapped (cached) backend product. Throws when the
 * seller does not own the product or the request is rejected.
 */
export async function updateProduct(id, data = {}) {
  requireSignedIn();
  const envelope = await http.put(
    endpointPath(API_ENDPOINTS.products.update, { id }),
    toProductRequest(data)
  );
  const product = mapProduct(envelope?.data);
  upsertProductCache(product);
  return product;
}

/**
 * Delete a product in the backend. Backend: DELETE /api/v1/products/{id}.
 * Resolves true on success (the product is dropped from the cache).
 * Throws when the backend rejects (e.g. product is part of an order).
 */
export async function deleteProduct(id) {
  requireSignedIn();
  await http.delete(endpointPath(API_ENDPOINTS.products.delete, { id }));
  setProductsCache(
    getSellerProducts().filter(
      (product) => String(product.id) !== String(id)
    )
  );
  return true;
}

/* ------------------------------------------------------------
   Orders (delegated to ordersService)
   ------------------------------------------------------------ */

/** Orders available for fulfilment (backend-synced cache, newest first). */
export function getSellerOrders() {
  return getOrders();
}

/** Refresh the seller fulfilment list from the backend. */
export function syncSellerOrders(options = {}) {
  return syncOrders({ scope: "seller", ...options });
}

/** Advance an order's status via the backend (see ordersService). */
export function updateSellerOrderStatus(orderId, status) {
  return updateOrderStatus(orderId, status);
}

/* ------------------------------------------------------------
   Analytics (backend)
   ------------------------------------------------------------ */

/**
 * Dashboard summary. Backend: GET /api/v1/seller/analytics/summary.
 * Resolves a mapped { totalProducts, activeProducts, totalOrders,
 * pendingOrders, shippedOrders, deliveredOrders, cancelledOrders,
 * totalItemsSold, totalRevenue, averageRating, lowStockProducts }.
 */
export async function getSellerSummary() {
  requireSignedIn();
  const envelope = await http.get(API_ENDPOINTS.seller.analytics.summary);
  return mapSummary(envelope?.data);
}

/** Top sellers by units sold. Backend: GET .../top-products?limit=N. */
export async function getTopProducts(limit = 10) {
  requireSignedIn();
  const envelope = await http.get(
    API_ENDPOINTS.seller.analytics.topProducts,
    { params: { limit } }
  );
  return (Array.isArray(envelope?.data) ? envelope.data : []).map(mapTopProduct);
}

/** Sales grouped by category. Backend: GET .../sales-by-category. */
export async function getSalesByCategory() {
  requireSignedIn();
  const envelope = await http.get(API_ENDPOINTS.seller.analytics.salesByCategory);
  return (Array.isArray(envelope?.data) ? envelope.data : []).map(mapCategorySales);
}

/** Daily revenue for the last N days. Backend: GET .../revenue-timeline. */
export async function getRevenueTimeline(days = 30) {
  requireSignedIn();
  const envelope = await http.get(
    API_ENDPOINTS.seller.analytics.revenueTimeline,
    { params: { days } }
  );
  return (Array.isArray(envelope?.data) ? envelope.data : []).map(mapRevenuePoint);
}

/** Map a SellerSummaryResponse. */
function mapSummary(data = {}) {
  return {
    totalProducts: Number(data.totalProducts) || 0,
    activeProducts: Number(data.activeProducts) || 0,
    lowStockProducts: Number(data.lowStockProducts) || 0,
    totalOrders: Number(data.totalOrders) || 0,
    pendingOrders: Number(data.pendingOrders) || 0,
    shippedOrders: Number(data.shippedOrders) || 0,
    deliveredOrders: Number(data.deliveredOrders) || 0,
    cancelledOrders: Number(data.cancelledOrders) || 0,
    totalItemsSold: Number(data.totalItemsSold) || 0,
    totalRevenue: Number(data.totalRevenue) || 0,
    averageRating: Number(data.averageRating) || 0,
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

/** Map a CategorySalesResponse. */
function mapCategorySales(item = {}) {
  return {
    categoryId: item.categoryId,
    categoryName: item.categoryName || "",
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

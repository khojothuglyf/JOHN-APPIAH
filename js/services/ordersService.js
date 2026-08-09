/* ============================================================
   ORDERS SERVICE - SPRING BOOT BACKEND (via http.js)
   ============================================================
   Creates, reads and updates orders against the existing Java /
   Spring Boot backend through the shared HTTP client (http.js).
   The Supabase access token stored in STORAGE_KEYS.token is sent as
   `Authorization: Bearer ...` by http.js and validated by the
   backend's Supabase JWT bridge - there is no second authentication
   system.

   Backend contract (verified against OrderController):
   - GET  /api/v1/orders                 (buyer's own, paged)
   - POST /api/v1/orders                 (checkout from Supabase cart)
     REQUEST:  { items: [{ supabaseProductId, quantity }],
                 shippingAddress, city, postalCode, country,
                 currency }
     RESPONSE: ApiResponse<OrderResponse>  (201)
   - GET  /api/v1/orders/{id}
   - GET  /api/v1/orders/seller | /admin  (paged, role-scoped)
   - PUT  /api/v1/orders/{id}/status
     REQUEST:  { status }

   OrderResponse: { id, orderNumber, status, currency, totalAmount,
     discountAmount, couponCode, shippingAddress, city, postalCode,
     country, userId, customerName, items: [OrderItemResponse],
     createdAt, updatedAt }
   OrderItemResponse: { id, productId, supabaseProductId, productName,
     unitPrice, quantity, subtotal }

   OrderStatus enum matches the backend exactly:
   PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED.

   Trust model: checkout sends only supabaseProductId + quantity and
   the shipping details. Prices, discounts, shipping cost and totals
   are NEVER sent; the backend computes the authoritative order and
   the service maps its orderNumber/currency/totalAmount/items into
   the existing frontend order shape.

   Availability: reads keep a local cache (STORAGE_KEYS.orders) so the
   dashboards render instantly and degrade gracefully when the backend
   is down. createOrder NEVER fabricates a local order - it only
   records what the backend returned and throws when the backend is
   unreachable or rejects the request.
   ============================================================ */

import { ApiError, http } from "../utils/http.js";
import { storage } from "../utils/storage.js";
import {
  API_ENDPOINTS,
  DEFAULT_CURRENCY,
  endpointPath,
  STORAGE_KEYS,
} from "../config.js";
import { getCurrentUser } from "./authService.js";

/** Order lifecycle statuses (aligned with the backend OrderStatus). */
export const ORDER_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

/** Payment methods supported by checkout (display only; the backend
 *  computes all money values and does not accept a payment method in
 *  the order request - payment recording is a separate phase). */
export const PAYMENT_METHODS = {
  CARD: "CARD",
  COD: "COD",
};

/** Number of orders pulled from the backend per sync (no pagination
 *  UI exists yet, so a generous page keeps My Orders/dashboards full). */
const ORDERS_SYNC_SIZE = 100;

/** Human-readable label for an order status. */
export function getOrderStatusLabel(status) {
  const labels = {
    [ORDER_STATUS.PENDING]: "Pending",
    [ORDER_STATUS.CONFIRMED]: "Confirmed",
    [ORDER_STATUS.SHIPPED]: "Shipped",
    [ORDER_STATUS.DELIVERED]: "Delivered",
    [ORDER_STATUS.CANCELLED]: "Cancelled",
  };
  return labels[status] || status || "Unknown";
}

/* ------------------------------------------------------------
   Local cache (page-facing reads stay synchronous)
   ------------------------------------------------------------ */

/** All cached orders, newest first. */
export function getOrders() {
  const orders = storage.get(STORAGE_KEYS.orders);
  if (!Array.isArray(orders)) return [];
  return [...orders].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/** A single cached order by id, or null. */
export function getOrderById(id) {
  if (id == null) return null;
  return getOrders().find((order) => String(order.id) === String(id)) ?? null;
}

/** Replace the cached order list (kept newest first). */
function setOrdersCache(orders) {
  const sorted = [...orders].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  storage.set(STORAGE_KEYS.orders, sorted);
}

/** Insert or replace a single order in the cache. */
function upsertOrderCache(order) {
  const orders = getOrders();
  const index = orders.findIndex((entry) => String(entry.id) === String(order.id));
  if (index === -1) orders.unshift(order);
  else orders[index] = order;
  setOrdersCache(orders);
  return order;
}

/* ------------------------------------------------------------
   Response mapping (backend -> frontend order shape)
   ------------------------------------------------------------ */

/** Map an OrderItemResponse into the storefront line shape. productId
 *  resolves to the Supabase catalogue id so item links keep pointing
 *  at the storefront product pages. */
function mapItem(item = {}) {
  return {
    id: item.id,
    productId: item.supabaseProductId ?? item.productId,
    name: item.productName || "Product",
    price: Number(item.unitPrice) || 0,
    quantity: Number(item.quantity) || 0,
    subtotal: Number(item.subtotal) || 0,
    imageUrl: "",
  };
}

/** Map an OrderResponse into the existing frontend order shape. All
 *  monetary fields come from the backend; nothing is recomputed from
 *  client input. */
function mapOrder(order = {}) {
  const items = (Array.isArray(order.items) ? order.items : []).map(mapItem);
  const subtotal = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  const nameParts = String(order.customerName || "").split(/\s+/).filter(Boolean);

  return {
    id: order.id,
    orderNumber: order.orderNumber || String(order.id),
    status: order.status,
    currency: order.currency || DEFAULT_CURRENCY,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    userId: order.userId,
    customerName: order.customerName || "",
    items,
    subtotal,
    discount: Number(order.discountAmount) || 0,
    shippingCost: 0,
    total: Number(order.totalAmount) || 0,
    shipping: {
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" "),
      email: "",
      address: order.shippingAddress || "",
      city: order.city || "",
      state: "",
      zip: order.postalCode || "",
      country: order.country || "",
    },
  };
}

/* ------------------------------------------------------------
   Backend calls
   ------------------------------------------------------------ */

/** True when a signed-in session exists (even a token-less preview). */
function isSignedIn() {
  return Boolean(getCurrentUser());
}

/**
 * Place an order from the Supabase cart. Only supabaseProductId +
 * quantity (and the shipping details) are sent; the backend resolves
 * prices, applies discounts and computes totals authoritatively.
 * Resolves the mapped backend order (cached for the confirmation
 * page). Throws when the backend is unreachable or rejects - no local
 * order is ever fabricated.
 */
export async function createOrder({ items = [], shipping = {}, payment = {} } = {}) {
  if (!isSignedIn()) {
    throw new ApiError(401, "Please sign in to place an order.");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Your cart is empty.");
  }

  const body = {
    items: items.map((item) => ({
      supabaseProductId: String(item.productId ?? ""),
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
    })),
    shippingAddress: [shipping.address, shipping.state]
      .filter(Boolean)
      .join(", ")
      .trim(),
    city: (shipping.city || "").trim(),
    postalCode: (shipping.zip || "").trim(),
    country: (shipping.country || "").trim(),
    currency: DEFAULT_CURRENCY,
  };

  const envelope = await http.post(API_ENDPOINTS.orders.create, body);
  const order = mapOrder(envelope?.data);
  // Display-only: the backend does not record the payment method yet.
  // This is not used for any money value (subtotal/total come from
  // the backend); it only keeps the confirmation page honest about
  // the option the customer picked.
  order.payment = {
    method: payment?.method || PAYMENT_METHODS.COD,
    last4: payment?.last4 || null,
  };
  upsertOrderCache(order);
  return order;
}

/**
 * Fetch a single order from the backend by id and cache it.
 * Backend: GET /api/v1/orders/{id}.
 */
export async function getOrder(id) {
  const envelope = await http.get(
    endpointPath(API_ENDPOINTS.orders.detail, { id })
  );
  const order = mapOrder(envelope?.data);
  upsertOrderCache(order);
  return order;
}

/**
 * Advance an order's lifecycle status (seller/admin fulfilment).
 * Backend: PUT /api/v1/orders/{id}/status with { status }.
 * Resolves the updated (mapped) order, or null when the status value
 * is invalid. Backend errors (permissions, illegal transition) throw.
 */
export async function updateOrderStatus(orderId, status) {
  if (!Object.values(ORDER_STATUS).includes(status)) return null;

  const envelope = await http.put(
    endpointPath(API_ENDPOINTS.orders.status, { id: orderId }),
    { status }
  );
  const order = mapOrder(envelope?.data);
  upsertOrderCache(order);
  return order;
}

let syncPromise = null;

/**
 * Pull orders from the backend into the local cache. Single-flight:
 * concurrent callers share one request.
 *
 *   scope: "buyer" (default) -> GET /api/v1/orders
 *          "seller"           -> GET /api/v1/orders/seller
 *          "admin"            -> GET /api/v1/orders/admin
 *
 * Resolves the (mapped, cached) list. Signed-out sessions and backend
 * failures keep the existing local cache so dashboards still render.
 */
export function syncOrders({
  scope = "buyer",
  page = 0,
  size = ORDERS_SYNC_SIZE,
  status = null,
} = {}) {
  if (!isSignedIn()) return Promise.resolve(getOrders());
  if (syncPromise) return syncPromise;

  const path =
    scope === "seller"
      ? API_ENDPOINTS.orders.sellerOrders
      : scope === "admin"
        ? API_ENDPOINTS.orders.adminOrders
        : API_ENDPOINTS.orders.list;

  const params = { page, size };
  if (status) params.status = status;

  syncPromise = http
    .get(path, { params })
    .then((envelope) => {
      const content = Array.isArray(envelope?.data?.content)
        ? envelope.data.content
        : [];
      const mapped = content.map(mapOrder);
      setOrdersCache(mapped);
      return mapped;
    })
    .catch((error) => {
      console.warn(
        "[orders] backend sync failed, keeping local cache:",
        error?.message || error
      );
      return getOrders();
    })
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

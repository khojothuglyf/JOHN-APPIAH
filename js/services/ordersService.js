/* ============================================================
   ORDERS SERVICE - TEMPORARY LOCAL ORDERS
   ============================================================
   Creates and reads orders locally so checkout can complete end
   to end before the backend is deployed. Phase 7+ swaps the
   internals with the backend orders API while keeping the same
   surface.

   Backend contract (verified against OrderController):
   - GET  /api/v1/orders
     RESPONSE: ApiResponse<PagedResponse<OrderResponse>>
   - POST /api/v1/orders
     REQUEST:  { shippingAddress, city, postalCode, country }
     RESPONSE: ApiResponse<OrderResponse>
   - GET  /api/v1/orders/{id}
     RESPONSE: ApiResponse<OrderResponse>
   - GET  /api/v1/orders/seller | /admin   (paged, role-scoped)
   - PUT  /api/v1/orders/{id}/status
     REQUEST:  { status }
     RESPONSE: ApiResponse<OrderResponse>

   OrderResponse: { id, orderNumber, status, totalAmount,
     shippingAddress, city, postalCode, country, userId,
     customerName, items: [OrderItemResponse], createdAt, updatedAt }
   OrderItemResponse: { id, productId, productName, unitPrice,
     quantity, subtotal }

   OrderStatus enum matches the backend exactly:
   PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED.
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS } from "../config.js";

/** Order lifecycle statuses (aligned with the backend OrderStatus). */
export const ORDER_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

/** Payment methods supported by checkout. */
export const PAYMENT_METHODS = {
  CARD: "CARD",
  COD: "COD",
};

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

/** All stored orders, newest first. */
export function getOrders() {
  const orders = storage.get(STORAGE_KEYS.orders);
  if (!Array.isArray(orders)) return [];
  return [...orders].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/** A single order by id, or null. */
export function getOrderById(id) {
  if (id == null) return null;
  return getOrders().find((order) => String(order.id) === String(id)) ?? null;
}

/**
 * Advance an order's lifecycle status (seller fulfilment).
 * Returns the updated order, or null when the order or status is
 * invalid. Backend: PUT /api/v1/orders/{id}/status with { status }.
 */
export function updateOrderStatus(orderId, status) {
  if (!Object.values(ORDER_STATUS).includes(status)) return null;

  const orders = storage.get(STORAGE_KEYS.orders);
  if (!Array.isArray(orders)) return null;

  let updated = null;
  const next = orders.map((order) => {
    if (String(order.id) !== String(orderId)) return order;
    updated = { ...order, status };
    return updated;
  });

  if (!updated) return null;
  storage.set(STORAGE_KEYS.orders, next);
  return updated;
}

/**
 * Place an order from a ready payload (items + shipping + payment +
 * computed totals). Persists and returns the created order.
 */
export function createOrder({ items, shipping, payment, subtotal, shippingCost = 0, total } = {}) {
  const now = new Date();
  const order = {
    id: generateId(),
    orderNumber: generateOrderNumber(now),
    status: ORDER_STATUS.PENDING,
    createdAt: now.toISOString(),
    items: Array.isArray(items) ? items : [],
    shipping: shipping || {},
    payment: {
      method: payment?.method || PAYMENT_METHODS.COD,
      last4: payment?.last4 || null,
    },
    subtotal: Number(subtotal) || 0,
    shippingCost: Number(shippingCost) || 0,
    total: Number(total) || 0,
  };

  const orders = getOrders();
  orders.unshift(order);
  storage.set(STORAGE_KEYS.orders, orders);
  return order;
}

/** Unique id (crypto when available, timestamp fallback). */
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Human-friendly reference like ORD-260807-A1B2. */
function generateOrderNumber(date) {
  const ymd = [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ymd}-${suffix}`;
}

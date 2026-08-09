/* ============================================================
   PAYMENT SERVICE - SPRING BOOT BACKEND (via http.js)
   ============================================================
   Records and reads payments against the backend. Checkout creates
   the order first (ordersService.createOrder) and then records the
   payment here via POST /api/v1/payments/orders/{orderId}. Only the
   method is sent - the backend charges the order total, resolves the
   status and generates the transaction reference. No card details or
   gateway credentials ever leave the browser; there is no simulated
   or fake payment flow anywhere in this service.

   Backend contract (verified against PaymentController):
   - POST /api/v1/payments/orders/{orderId}
     REQUEST:  { method: CARD | BANK_TRANSFER | PAYPAL | CASH_ON_DELIVERY }
     RESPONSE: ApiResponse<PaymentResponse>  (201)
   - GET  /api/v1/payments/orders/{orderId}
   - GET  /api/v1/payments/my                  (buyer's own, paged)

   PaymentResponse: { id, orderId, orderNumber, amount, currency,
     method, status, transactionRef, paidAt, createdAt }
   PaymentStatus: PENDING, COMPLETED, FAILED, REFUNDED.

   Method behaviour (backend-authoritative):
   - CARD (and other online methods) complete instantly - the backend
     records COMPLETED with a paidAt.
   - CASH_ON_DELIVERY stays PENDING; the backend completes it when the
     order is delivered.
   Recording is idempotent: a 409 means this order already has a
   payment (e.g. a retried checkout whose earlier response was lost),
   so payForOrder recovers by reading the existing payment instead of
   failing or fabricating a second one.
   ============================================================ */

import { ApiError, http } from "../utils/http.js";
import { API_ENDPOINTS, endpointPath } from "../config.js";
import { getCurrentUser } from "./authService.js";

/** Payment lifecycle statuses (aligned with the backend PaymentStatus). */
export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
};

/** Human-readable label for a payment status. */
export function getPaymentStatusLabel(status) {
  const labels = {
    [PAYMENT_STATUS.COMPLETED]: "Paid",
    [PAYMENT_STATUS.PENDING]: "Awaiting payment",
    [PAYMENT_STATUS.FAILED]: "Payment failed",
    [PAYMENT_STATUS.REFUNDED]: "Refunded",
  };
  return labels[status] || status || "Unknown";
}

/** Map the storefront checkout methods onto the backend
 *  PaymentMethod enum values. COD always maps to the backend's
 *  CASH_ON_DELIVERY value. */
export const BACKEND_PAYMENT_METHODS = {
  CARD: "CARD",
  COD: "CASH_ON_DELIVERY",
};

/** Map a backend PaymentResponse into the frontend payment shape. */
function mapPayment(payment = {}) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    orderNumber: payment.orderNumber,
    amount: Number(payment.amount) || 0,
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    transactionRef: payment.transactionRef,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
  };
}

/** True when a signed-in session exists (mirrors ordersService). */
function isSignedIn() {
  return Boolean(getCurrentUser());
}

/**
 * Record payment for an order. Only the method is sent; the backend
 * charges the order total and resolves the status (instant COMPLETED
 * for card, PENDING for cash on delivery). A 409 (this order already
 * has a payment) is recovered idempotently by reading the existing
 * payment, so a retried checkout never double-charges or fabricates a
 * second payment. Any other rejection throws and leaves the cart with
 * the caller to retry.
 * Backend: POST /api/v1/payments/orders/{orderId}.
 */
export async function payForOrder(orderId, method) {
  if (orderId == null) throw new ApiError(400, "Missing order id.");
  if (!method) throw new ApiError(400, "A payment method is required.");
  if (!isSignedIn()) {
    throw new ApiError(401, "Please sign in to pay for an order.");
  }

  try {
    const envelope = await http.post(
      endpointPath(API_ENDPOINTS.payments.create, { orderId }),
      { method }
    );
    return mapPayment(envelope?.data);
  } catch (error) {
    if (error?.status === 409) {
      return getPaymentByOrderId(orderId);
    }
    throw error;
  }
}

/** Read the payment recorded for an order (owner / seller / admin).
 *  Throws 404 when the order has no payment yet.
 *  Backend: GET /api/v1/payments/orders/{orderId}. */
export async function getPaymentByOrderId(orderId) {
  if (orderId == null) throw new ApiError(400, "Missing order id.");
  if (!isSignedIn()) {
    throw new ApiError(401, "Please sign in to view a payment.");
  }

  const envelope = await http.get(
    endpointPath(API_ENDPOINTS.payments.byOrder, { orderId })
  );
  return mapPayment(envelope?.data);
}

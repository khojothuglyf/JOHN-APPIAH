/* ============================================================
   PAYMENT SERVICE - SPRING BOOT BACKEND (via http.js)
   ============================================================
   Records and reads payments against the backend. Checkout creates
   the order first (ordersService.createOrder) and then initializes
   the payment here via POST /api/v1/payments/orders/{orderId}/initialize.
   Only the method is sent - the backend charges the order total,
   resolves the status, generates the transaction reference and (for
   online methods) returns a Paystack hosted-checkout URL. No card
   details or gateway credentials ever leave the browser: card / mobile
   money / bank transfer details are collected by Paystack's hosted
   checkout page, to which the browser is redirected.

   Backend contract (verified against PaymentController):
   - POST /api/v1/payments/orders/{orderId}/initialize
     REQUEST:  { method: CARD | BANK_TRANSFER | PAYPAL | CASH_ON_DELIVERY }
     RESPONSE: ApiResponse<PaymentResponse>  (201)
   - POST /api/v1/payments/orders/{orderId}/verify   (confirm after return)
   - GET  /api/v1/payments/orders/{orderId}
   - GET  /api/v1/payments/my                  (buyer's own, paged)

   PaymentResponse: { id, orderId, orderNumber, amount, currency,
     method, status, transactionRef, provider, providerEventId,
     providerChannel, authorizationUrl, accessCode, refundReference,
     paidAt, createdAt }
   PaymentStatus: PENDING, COMPLETED, FAILED, REFUNDED.

   Method behaviour (backend-authoritative):
   - Online methods initialize a Paystack session: the payment stays
     PENDING and the response carries authorizationUrl (the hosted
     checkout). The browser redirects there; when the gateway returns
     with ?reference=..&trxref=.., verifyPayment confirms the result.
   - CASH_ON_DELIVERY stays PENDING; the backend completes it when the
     order is delivered.
   Recording is idempotent: a 409 means this order already has a
   payment (e.g. a retried checkout whose earlier response was lost),
   so initializePayment recovers by reading the existing payment
   instead of failing or fabricating a second one.
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

/** Payment processing backends (aligned with the backend
 *  PaymentProvider constants). SIMULATED is the dev/COD fallback;
 *  PAYSTACK processes real online payments via hosted checkout. */
export const PAYMENT_PROVIDERS = {
  PAYSTACK: "PAYSTACK",
  SIMULATED: "SIMULATED",
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

/** Human-readable label for a Paystack payment channel. */
export function getPaymentChannelLabel(channel) {
  const labels = {
    card: "Card",
    mobile_money: "Mobile money",
    bank_transfer: "Bank transfer",
    bank: "Bank",
    ussd: "USSD",
    qr: "QR",
    dedicated_account: "Bank account",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
  };
  return labels[channel] || channel || "Online payment";
}

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
    provider: payment.provider,
    providerEventId: payment.providerEventId,
    providerChannel: payment.providerChannel,
    authorizationUrl: payment.authorizationUrl,
    accessCode: payment.accessCode,
    refundReference: payment.refundReference,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
  };
}

/** True when a signed-in session exists (mirrors ordersService). */
function isSignedIn() {
  return Boolean(getCurrentUser());
}

/**
 * Initialize the payment for an order. Only the method is sent; the
 * backend charges the order total and returns the payment with its
 * status and (for online methods) the hosted-checkout authorizationUrl
 * to redirect to. A 409 (this order already has a payment) is recovered
 * idempotently by reading the existing payment, so a retried checkout
 * never double-charges or fabricates a second payment. Any other
 * rejection throws and leaves the cart with the caller to retry.
 * Backend: POST /api/v1/payments/orders/{orderId}/initialize.
 */
export async function initializePayment(orderId, method) {
  if (orderId == null) throw new ApiError(400, "Missing order id.");
  if (!method) throw new ApiError(400, "A payment method is required.");
  if (!isSignedIn()) {
    throw new ApiError(401, "Please sign in to pay for an order.");
  }

  try {
    const envelope = await http.post(
      endpointPath(API_ENDPOINTS.payments.initialize, { orderId }),
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

/**
 * Verify a payment against the backend - called when the browser
 * returns from the hosted checkout with ?reference=..&trxref=.. so the
 * confirmation page reflects the real gateway outcome. Safe to call
 * for COD / already-final payments (the backend returns them as-is).
 * Backend: POST /api/v1/payments/orders/{orderId}/verify.
 */
export async function verifyPayment(orderId) {
  if (orderId == null) throw new ApiError(400, "Missing order id.");
  if (!isSignedIn()) {
    throw new ApiError(401, "Please sign in to verify a payment.");
  }

  const envelope = await http.post(
    endpointPath(API_ENDPOINTS.payments.verify, { orderId })
  );
  return mapPayment(envelope?.data);
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

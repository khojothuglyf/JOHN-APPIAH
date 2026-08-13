/* ============================================================
   ORDER CONFIRMATION PAGE SCRIPT
   Loads the order created during checkout by its id from the
   query string and renders a success summary. When the browser
   returns from the Paystack hosted checkout (with ?reference=..
   &trxref=..) the payment is first verified against the backend so
   the summary reflects the real gateway outcome. Shows a friendly
   "not found" state when the order id is missing or unknown.
   ============================================================ */

import { $, getQueryParam } from "../utils/dom.js";
import { getOrder, getOrderById, recordPaymentForOrder } from "../services/ordersService.js";
import { verifyPayment } from "../services/paymentService.js";
import { listDeliveryRequests } from "../services/deliveryService.js";
import {
  orderHeaderTemplate,
  orderItemsTemplate,
  orderDetailsTemplate,
} from "../components/orderCard.js";

const page = {
  confirmation: null,
  notFound: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  page.confirmation = $("[data-confirmation]");
  page.notFound = $("[data-confirmation-not-found]");
  if (!page.confirmation) return;

  const orderId = getQueryParam("id");
  const reference = getQueryParam("reference") || getQueryParam("trxref");

  // Returning from the Paystack hosted checkout: confirm the payment
  // against the backend so the rendered status is the real outcome.
  // Best-effort - if verification fails the order still renders and
  // the payment status refreshes on the next sync.
  if (orderId && reference) {
    try {
      const verified = await verifyPayment(orderId);
      if (verified) recordPaymentForOrder(orderId, verified);
    } catch {
      // ignored - the order below still renders
    }
  }

  // Prefer the order cached during checkout; fall back to fetching it
  // from the backend (e.g. after a page refresh or from another tab).
  let order = getOrderById(orderId);
  if (!order && orderId) {
    try {
      order = await getOrder(orderId);
    } catch {
      order = null;
    }
  }

  if (!order) {
    page.confirmation.hidden = true;
    page.notFound.hidden = false;
    return;
  }

  await loadDeliveryRequests(order);

  render(order);
});

/** Attach the buyer's delivery requests for this order (best effort).
 *  The card simply omits the delivery block when Supabase is
 *  unreachable or the order has none. */
async function loadDeliveryRequests(order) {
  try {
    const requests = await listDeliveryRequests();
    order.deliveryRequests = requests.filter(
      (request) => String(request.orderId) === String(order.id)
    );
  } catch {
    order.deliveryRequests = [];
  }
}

function render(order) {
  $("[data-confirmation-text]").textContent =
    `Your order ${order.orderNumber || order.id} has been received. ` +
    "We've sent a confirmation to your email.";

  $("[data-order-header]", page.confirmation).innerHTML = orderHeaderTemplate(order);
  $("[data-order-items]", page.confirmation).innerHTML = orderItemsTemplate(order.items);
  $("[data-order-details]", page.confirmation).innerHTML = orderDetailsTemplate(order);

  page.confirmation.hidden = false;
}

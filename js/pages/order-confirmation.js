/* ============================================================
   ORDER CONFIRMATION PAGE SCRIPT
   Loads the order created during checkout by its id from the
   query string and renders a success summary. Shows a friendly
   "not found" state when the order id is missing or unknown.
   ============================================================ */

import { $, getQueryParam } from "../utils/dom.js";
import { getOrder, getOrderById } from "../services/ordersService.js";
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

  render(order);
});

function render(order) {
  $("[data-confirmation-text]").textContent =
    `Your order ${order.orderNumber || order.id} has been received. ` +
    "We've sent a confirmation to your email.";

  $("[data-order-header]", page.confirmation).innerHTML = orderHeaderTemplate(order);
  $("[data-order-items]", page.confirmation).innerHTML = orderItemsTemplate(order.items);
  $("[data-order-details]", page.confirmation).innerHTML = orderDetailsTemplate(order);

  page.confirmation.hidden = false;
}

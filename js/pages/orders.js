/* ============================================================
   MY ORDERS PAGE SCRIPT
   Syncs the signed-in buyer's orders from the Spring Boot backend,
   then lists them (newest first) as expandable cards. Each card
   shows the order header plus items, shipping, payment and totals
   once expanded. If the backend is unavailable the local cache is
   shown.
   ============================================================ */

import { $, escapeHtml } from "../utils/dom.js";
import { formatCurrency } from "../utils/format.js";
import { getOrders, syncOrders } from "../services/ordersService.js";
import {
  orderHeaderTemplate,
  orderItemsTemplate,
  orderDetailsTemplate,
} from "../components/orderCard.js";

const page = {
  list: null,
  empty: null,
  count: null,
};

document.addEventListener("DOMContentLoaded", () => {
  page.list = $("[data-orders]");
  page.empty = $("[data-orders-empty]");
  page.count = $("[data-orders-count]");
  if (!page.list) return;

  syncOrders().then(() => render());
});

function render() {
  const orders = getOrders();
  if (orders.length === 0) {
    page.list.hidden = true;
    page.empty.hidden = false;
    page.count.textContent = "";
    return;
  }

  page.list.hidden = false;
  page.empty.hidden = true;
  page.count.textContent =
    `${orders.length} order${orders.length === 1 ? "" : "s"} placed`;

  page.list.innerHTML = orders.map(orderCardTemplate).join("");
}

function orderCardTemplate(order = {}) {
  const total = Number(order.total) || 0;
  return `
    <details class="order-card card">
      <summary class="order-card__summary">
        ${orderHeaderTemplate(order)}
        <span class="order-card__chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </summary>
      <div class="order-card__body">
        <h3 class="order-card__subtitle">Items</h3>
        <div class="order-card__items">${orderItemsTemplate(order.items)}</div>
        ${orderDetailsTemplate(order)}
        <div class="order-card__actions">
          <a class="btn btn--outline btn--sm" href="products.html">Continue shopping</a>
          <span class="order-card__total-label">
            Total: <strong>${escapeHtml(formatCurrency(total))}</strong>
          </span>
        </div>
      </div>
    </details>
  `;
}

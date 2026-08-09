/* ============================================================
   ORDER CARD COMPONENT
   Shared templates for rendering an order (confirmation page and
   My Orders list). Pure HTML string builders.
   ============================================================ */

import { escapeHtml, pageUrl } from "../utils/dom.js";
import { formatCurrency, formatDate } from "../utils/format.js";
import { getOrderStatusLabel } from "../services/ordersService.js";
import {
  BACKEND_PAYMENT_METHODS,
  getPaymentStatusLabel,
} from "../services/paymentService.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

/** Badge variant class for an order status. */
export function orderStatusClass(status) {
  const variants = {
    PENDING: "badge--info",
    CONFIRMED: "badge--info",
    SHIPPED: "badge--primary",
    DELIVERED: "badge--success",
    CANCELLED: "badge--danger",
  };
  return variants[status] || "badge--outline";
}

/** Status pill with the matching colour. */
export function orderStatusBadge(status) {
  return `<span class="badge ${orderStatusClass(status)}">${escapeHtml(
    getOrderStatusLabel(status)
  )}</span>`;
}

/** Ordered line items. */
export function orderItemsTemplate(items = []) {
  if (items.length === 0) {
    return '<p class="order-card__empty">No items recorded for this order.</p>';
  }

  return items
    .map((item) => {
      const id = item.productId;
      const href = id == null
        ? "#"
        : pageUrl(`pages/product-details.html?id=${encodeURIComponent(id)}`);
      const image = item.imageUrl || IMAGE_FALLBACK;
      return `
        <div class="order-card__item">
          <a class="order-card__thumb" href="${href}">
            <img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async"
              onerror="this.onerror=null;this.src='${IMAGE_FALLBACK}'" />
          </a>
          <span class="order-card__item-name">
            <a href="${href}">${escapeHtml(item.name || "Product")}</a>
            <span class="order-card__item-qty">× ${Number(item.quantity) || 1}</span>
          </span>
          <strong class="order-card__item-price">
            ${formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1))}
          </strong>
        </div>
      `;
    })
    .join("");
}

/** Shipping + payment + totals block. */
export function orderDetailsTemplate(order = {}) {
  const shipping = order.shipping || {};
  const fullName = [shipping.firstName, shipping.lastName].filter(Boolean).join(" ");
  const address = [shipping.address, shipping.city, shipping.state, shipping.zip, shipping.country]
    .filter(Boolean)
    .join(", ");

  // The payment method comes from the backend PaymentMethod enum:
  // CARD or CASH_ON_DELIVERY (checkout only offers those two).
  const isCard = order.payment?.method === BACKEND_PAYMENT_METHODS.CARD;
  const methodText = isCard
    ? `Card ending in ${order.payment.last4 || "••••"}`
    : "Cash on delivery";
  const statusText = order.payment?.status
    ? getPaymentStatusLabel(order.payment.status)
    : null;
  const paymentText = statusText
    ? `${methodText} · ${statusText}`
    : methodText;

  return `
    <div class="order-card__grid">
      <div>
        <h3 class="order-card__subtitle">Shipping to</h3>
        <p class="order-card__address">
          ${fullName ? `${escapeHtml(fullName)}<br />` : ""}
          ${escapeHtml(shipping.email || "")}
          ${address ? `<br />${escapeHtml(address)}` : ""}
        </p>
      </div>
      <div>
        <h3 class="order-card__subtitle">Payment</h3>
        <p class="order-card__payment">${escapeHtml(paymentText)}</p>
      </div>
      <div class="order-card__totals">
        <div class="cart-summary__row">
          <span>Subtotal</span>
          <strong>${formatCurrency(order.subtotal)}</strong>
        </div>
        <div class="cart-summary__row">
          <span>Shipping</span>
          <strong>${order.shippingCost > 0 ? formatCurrency(order.shippingCost) : "Free"}</strong>
        </div>
        <div class="cart-summary__total">
          <span>Total</span>
          <span>${formatCurrency(order.total)}</span>
        </div>
      </div>
    </div>
  `;
}

/** Shared card header (number, date, status). */
export function orderHeaderTemplate(order = {}) {
  return `
    <div class="order-card__header">
      <div>
        <h2 class="order-card__number">${escapeHtml(order.orderNumber || order.id)}</h2>
        <p class="order-card__meta">
          Placed on ${escapeHtml(formatDate(order.createdAt))}
          ${order.items?.length ? ` · ${order.items.length} item${order.items.length === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      ${orderStatusBadge(order.status)}
    </div>
  `;
}

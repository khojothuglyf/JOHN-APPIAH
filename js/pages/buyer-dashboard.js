/* ============================================================
   BUYER DASHBOARD PAGE SCRIPT
   Role-protected buyer workspace:
   - personalized welcome message
   - quick links to orders, wishlist, cart and profile
   - recent orders from the local orders store
   Access is restricted to BUYER and ADMIN roles.
   ============================================================ */

import { $, escapeHtml, pageUrl, redirect } from "../utils/dom.js";
import { formatCurrency, formatDate } from "../utils/format.js";
import {
  getRole,
  getDisplayName,
  isAuthenticated,
  signInPreview,
} from "../services/authService.js";
import { USER_ROLES, isPreviewMode } from "../config.js";
import {
  ORDER_STATUS,
  getOrderStatusLabel,
  getOrders,
} from "../services/ordersService.js";
import { showToast } from "../components/toast.js";

const RECENT_ORDERS_LIMIT = 3;

document.addEventListener("DOMContentLoaded", () => {
  if (!isAuthenticated()) {
    if (isPreviewMode()) {
      signInPreview(USER_ROLES.BUYER);
      showToast({
        title: "Preview mode",
        message: "Signed in as demo buyer.",
        type: "info",
      });
    } else {
      redirect("pages/login.html", { redirect: "pages/buyer-dashboard.html" });
      return;
    }
  }
  const role = getRole();
  if (role !== USER_ROLES.BUYER && role !== USER_ROLES.ADMIN) {
    redirect("index.html");
    return;
  }

  const name = $("[data-buyer-name]");
  if (!name) return;
  name.textContent = getDisplayName() || "there";

  renderRecentOrders();
});

function renderRecentOrders() {
  const orders = getOrders();
  const list = $("[data-recent-orders]");
  const empty = $("[data-recent-empty]");
  if (!list || !empty) return;

  const count = $("[data-recent-count]");
  if (count) count.textContent = `(${orders.length})`;

  const recent = orders.slice(0, RECENT_ORDERS_LIMIT);

  if (recent.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.innerHTML = recent.map(recentOrderTemplate).join("");
}

function recentOrderTemplate(order = {}) {
  const itemCount = order.items?.length ?? 0;
  const meta = [
    `${itemCount} item${itemCount === 1 ? "" : "s"}`,
    formatDate(order.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <div class="buyer-order card">
      <div class="buyer-order__info">
        <p class="buyer-order__number">${escapeHtml(order.orderNumber || order.id)}</p>
        <p class="buyer-order__meta">${escapeHtml(meta)}</p>
      </div>
      ${orderStatusBadge(order.status)}
      <div class="buyer-order__total">
        <span class="buyer-order__label">Total</span>
        <strong>${formatCurrency(order.total)}</strong>
      </div>
    </div>
  `;
}

function orderStatusBadge(status) {
  const tone = {
    [ORDER_STATUS.PENDING]: "warning",
    [ORDER_STATUS.CONFIRMED]: "info",
    [ORDER_STATUS.SHIPPED]: "info",
    [ORDER_STATUS.DELIVERED]: "success",
    [ORDER_STATUS.CANCELLED]: "danger",
  };
  const modifier = tone[status] || "outline";
  return `<span class="badge badge--${modifier}">${escapeHtml(getOrderStatusLabel(status))}</span>`;
}

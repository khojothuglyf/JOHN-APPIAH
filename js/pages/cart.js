/* ============================================================
   CART PAGE SCRIPT
   Renders the local cart line items, handles quantity steppers,
   removal, clearing and the order summary. Re-renders whenever
   the cart changes (navbar badge, another tab via storage).
   ============================================================ */

import { $, escapeHtml, pageUrl } from "../utils/dom.js";
import { formatCurrency } from "../utils/format.js";
import {
  getCart,
  getCartItemCount,
  getCartSubtotal,
  updateQuantity,
  removeItem,
  clearCart,
} from "../services/cartService.js";
import { showToast } from "../components/toast.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

const page = {
  items: null,
  page: null,
  empty: null,
  countText: null,
  subtotal: null,
  total: null,
};

document.addEventListener("DOMContentLoaded", () => {
  page.items = $("[data-cart-items]");
  page.page = $("[data-cart-page]");
  page.empty = $("[data-cart-empty]");
  page.countText = $("[data-cart-count-text]");
  page.subtotal = $("[data-summary-subtotal]");
  page.total = $("[data-summary-total]");
  if (!page.items) return;

  bindEvents();
  render();

  window.addEventListener("cart:update", render);
});

function bindEvents() {
  page.items.addEventListener("click", (event) => {
    const minus = event.target.closest("[data-qty-minus]");
    const plus = event.target.closest("[data-qty-plus]");
    const remove = event.target.closest("[data-remove]");

    if (minus || plus) {
      const input = event.target
        .closest("[data-cart-item]")
        ?.querySelector("[data-qty-input]");
      const delta = minus ? -1 : 1;
      updateQuantity(itemId(event.target), Number(input?.value) + delta);
    } else if (remove) {
      const name = remove.closest("[data-cart-item]")?.dataset.name;
      removeItem(itemId(remove));
      showToast({
        title: "Removed from cart",
        message: name ? `${name} was removed` : "Item removed",
        type: "info",
      });
    }
  });

  page.items.addEventListener("change", (event) => {
    if (!event.target.matches("[data-qty-input]")) return;
    updateQuantity(itemId(event.target), Number(event.target.value));
  });

  $("[data-clear-cart]")?.addEventListener("click", () => {
    clearCart();
    showToast({
      title: "Cart cleared",
      message: "All items have been removed",
      type: "info",
    });
  });
}

function render() {
  const items = getCart();

  if (items.length === 0) {
    page.page.hidden = true;
    page.empty.hidden = false;
    page.countText.textContent = "";
    return;
  }

  page.page.hidden = false;
  page.empty.hidden = true;

  const count = getCartItemCount();
  page.countText.textContent =
    `${count} item${count === 1 ? "" : "s"} in your cart`;

  page.items.innerHTML = items.map(cartItemTemplate).join("");

  const subtotal = getCartSubtotal();
  page.subtotal.textContent = formatCurrency(subtotal);
  page.total.textContent = formatCurrency(subtotal);
}

function cartItemTemplate(item = {}) {
  const id = String(item.productId);
  const name = item.name || "Product";
  const price = Number(item.price) || 0;
  const quantity = Number(item.quantity) || 1;
  const href = pageUrl(`pages/product-details.html?id=${encodeURIComponent(id)}`);
  const image = item.imageUrl || IMAGE_FALLBACK;

  return `
    <div class="cart-item" data-cart-item="${id}" data-name="${escapeHtml(name)}">
      <a class="cart-item__media" href="${href}">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async"
          onerror="this.onerror=null;this.src='${IMAGE_FALLBACK}'" />
      </a>
      <div class="cart-item__info">
        <a class="cart-item__name" href="${href}">${escapeHtml(name)}</a>
        <span class="cart-item__unit-price">${formatCurrency(price)} each</span>
      </div>
      <div class="cart-item__actions">
        <div class="quantity-stepper quantity-stepper--sm">
          <button class="quantity-stepper__btn" type="button" data-qty-minus
            aria-label="Decrease quantity of ${escapeHtml(name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>
          </button>
          <input class="quantity-stepper__input" type="number" min="1" max="99"
            value="${quantity}" data-qty-input aria-label="Quantity of ${escapeHtml(name)}" />
          <button class="quantity-stepper__btn" type="button" data-qty-plus
            aria-label="Increase quantity of ${escapeHtml(name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <span class="cart-item__line-total">${formatCurrency(price * quantity)}</span>
        <button class="cart-item__remove" type="button" data-remove
          aria-label="Remove ${escapeHtml(name)} from cart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </button>
      </div>
    </div>
  `;
}

/** Id of the cart line item owning a descendant node. */
function itemId(node) {
  return node?.closest("[data-cart-item]")?.dataset.cartItem ?? "";
}

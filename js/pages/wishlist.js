/* ============================================================
   WISHLIST PAGE SCRIPT
   Renders saved wishlist items as product cards with an
   "Add to cart" action. Re-renders whenever the wishlist changes
   (toggle buttons on any card fire wishlist:update).
   ============================================================ */

import { $, escapeHtml } from "../utils/dom.js";
import { getWishlist } from "../services/wishlistService.js";
import { addItem } from "../services/cartService.js";
import { productCardTemplate } from "../components/cards.js";
import { showToast } from "../components/toast.js";

const page = {
  grid: null,
  empty: null,
  count: null,
};

document.addEventListener("DOMContentLoaded", () => {
  page.grid = $("[data-wishlist]");
  page.empty = $("[data-wishlist-empty]");
  page.count = $("[data-wishlist-count]");
  if (!page.grid) return;

  bindEvents();
  render();

  window.addEventListener("wishlist:update", render);
});

function bindEvents() {
  page.grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-to-cart]");
    if (!button) return;

    const product = getWishlist().find(
      (item) => String(item.productId) === String(button.dataset.addToCart)
    );
    if (!product) return;

    addItem(product);
    showToast({
      title: "Added to cart",
      message: product.name || "Item added",
      type: "success",
    });
  });
}

function render() {
  const items = getWishlist();

  if (items.length === 0) {
    page.grid.hidden = true;
    page.empty.hidden = false;
    page.count.textContent = "";
    return;
  }

  page.grid.hidden = false;
  page.empty.hidden = true;
  page.count.textContent =
    `${items.length} saved item${items.length === 1 ? "" : "s"}`;

  page.grid.innerHTML = items
    .map(
      (item) => `
        <div class="wishlist-cell">
          ${productCardTemplate(item)}
          <button class="btn btn--outline btn--sm btn--block" type="button"
            data-add-to-cart="${escapeHtml(item.productId)}">
            Add to Cart
          </button>
        </div>
      `
    )
    .join("");
}

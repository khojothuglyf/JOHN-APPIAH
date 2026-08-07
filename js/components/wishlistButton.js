/* ============================================================
   WISHLIST BUTTON COMPONENT
   Heart toggle shown on every product card. State is driven by
   aria-pressed; the icon swap is pure CSS so no re-render is
   needed after toggling. A single delegated listener (installed
   by initWishlistButtons from app.js) handles every page.
   ============================================================ */

import { escapeHtml } from "../utils/dom.js";
import { isInWishlist, toggleItem } from "../services/wishlistService.js";
import { showToast } from "./toast.js";

const ICON_HEART_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

const ICON_HEART_ON = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

/**
 * Heart button for a product card. Includes enough product data to
 * re-add to the wishlist later without refetching.
 */
export function wishlistButtonTemplate(product = {}) {
  const id = product?.id ?? "";
  const wishlisted = isInWishlist(id);

  return `
    <button class="product-card__wishlist" type="button"
      data-wishlist-toggle
      data-wishlist-id="${escapeHtml(id)}"
      data-wishlist-name="${escapeHtml(product.name || "")}"
      data-wishlist-price="${escapeHtml(product.price ?? "")}"
      data-wishlist-image="${escapeHtml(product.imageUrl || "")}"
      aria-pressed="${wishlisted ? "true" : "false"}"
      aria-label="${wishlisted ? "Remove from wishlist" : "Add to wishlist"}">
      <span class="wishlist-icon wishlist-icon--on">${ICON_HEART_ON}</span>
      <span class="wishlist-icon wishlist-icon--off">${ICON_HEART_OFF}</span>
    </button>
  `;
}

let initialized = false;

/**
 * Install one delegated click listener for all [data-wishlist-toggle]
 * buttons on the page. Safe to call more than once.
 */
export function initWishlistButtons() {
  if (initialized) return;
  initialized = true;

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-wishlist-toggle]");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const product = {
      id: button.dataset.wishlistId,
      name: button.dataset.wishlistName,
      price: Number(button.dataset.wishlistPrice),
      imageUrl: button.dataset.wishlistImage,
    };

    const added = toggleItem(product);
    updateButtonState(button, added);
    showToast({
      title: added ? "Saved to wishlist" : "Removed from wishlist",
      message: added
        ? (button.dataset.wishlistName || "Item") + " is now in your wishlist"
        : "Item removed from your wishlist",
      type: added ? "success" : "info",
    });
  });
}

function updateButtonState(button, added) {
  button.setAttribute("aria-pressed", String(added));
  button.setAttribute(
    "aria-label",
    added ? "Remove from wishlist" : "Add to wishlist"
  );
}

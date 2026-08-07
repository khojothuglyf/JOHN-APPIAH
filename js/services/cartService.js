/* ============================================================
   CART SERVICE - TEMPORARY LOCAL CART
   ============================================================
   Drives the navbar badge now; Phase 5 replaces the internals
   with the backend cart API while keeping the same surface.

   Backend contract (verified against CartController):
   - GET    /api/v1/cart
     RESPONSE: ApiResponse<CartResponse>
     CartResponse: { items: [CartItemResponse], totalItems, totalPrice }
   - POST   /api/v1/cart/items
     REQUEST:  { productId, quantity }  -> ApiResponse<CartResponse>
   - PUT    /api/v1/cart/items/{cartItemId}
     REQUEST:  { quantity }             -> ApiResponse<CartResponse>
   - DELETE /api/v1/cart/items/{cartItemId} -> ApiResponse<CartResponse>
   - DELETE /api/v1/cart                -> ApiResponse<Void>

   CartItemResponse: { id, productId, productName, unitPrice,
     quantity, subtotal, imageUrl, sellerId, addedAt }
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS } from "../config.js";

/** All cart line items (local fallback until the API is live). */
export function getCart() {
  const items = storage.get(STORAGE_KEYS.cart);
  return Array.isArray(items) ? items : [];
}

/** Total number of units in the cart (sum of quantities). */
export function getCartItemCount() {
  return getCart().reduce((total, item) => {
    const quantity = Number(item.quantity);
    return total + (Number.isFinite(quantity) ? quantity : 0);
  }, 0);
}

/** Notify every subscriber (e.g. navbar badge) that the cart changed. */
export function notifyCartUpdated() {
  window.dispatchEvent(new CustomEvent("cart:update"));
}

/** Replace the stored cart and notify listeners. */
export function setCart(items) {
  storage.set(STORAGE_KEYS.cart, Array.isArray(items) ? items : []);
  notifyCartUpdated();
}

/**
 * Add a product to the cart (merging into an existing line item).
 * Persists and notifies the navbar badge.
 */
export function addItem(product = {}, quantity = 1) {
  const qty = Number(quantity) || 1;
  const items = getCart();
  const existing = items.find(
    (item) => String(item.productId) === String(product.id)
  );

  if (existing) {
    existing.quantity += qty;
  } else {
    items.push({
      productId: product.id,
      name: product.name || "Product",
      price: Number(product.price) || 0,
      imageUrl: product.imageUrl || "",
      quantity: qty,
    });
  }

  setCart(items);
}

/**
 * Set a line item's quantity. Zero (or negative) removes the item.
 * Persists and notifies listeners.
 */
export function updateQuantity(productId, quantity) {
  const qty = Number(quantity) || 0;
  const items = qty > 0
    ? getCart().map((item) =>
        String(item.productId) === String(productId)
          ? { ...item, quantity: qty }
          : item
      )
    : getCart().filter((item) => String(item.productId) !== String(productId));

  setCart(items);
}

/** Remove a single line item from the cart. */
export function removeItem(productId) {
  setCart(
    getCart().filter((item) => String(item.productId) !== String(productId))
  );
}

/** Empty the cart and notify listeners. */
export function clearCart() {
  setCart([]);
}

/** Total value of all line items (sum of price x quantity). */
export function getCartSubtotal() {
  return getCart().reduce((total, item) => {
    const price = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 0;
    return total + price * quantity;
  }, 0);
}

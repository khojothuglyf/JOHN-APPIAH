/* ============================================================
   WISHLIST SERVICE - TEMPORARY LOCAL WISHLIST
   ============================================================
   Drives the navbar badge, the wishlist toggle buttons on product
   cards and the wishlist page. Stores product snapshots locally;
   Phase 6+ swaps the internals with the backend wishlist API
   while keeping the same surface.

   Backend contract (verified against WishlistController):
   - GET    /api/v1/wishlist
     RESPONSE: ApiResponse<PagedResponse<WishlistItemResponse>>
     WishlistItemResponse: { id, productId, productName, price,
       imageUrl, sellerName, averageRating, reviewCount, addedAt }
   - POST   /api/v1/wishlist/{productId} -> ApiResponse<WishlistItemResponse>
   - DELETE /api/v1/wishlist/{productId} -> ApiResponse<Void>
   - GET    /api/v1/wishlist/check/{productId} -> ApiResponse<Boolean>
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS } from "../config.js";

/** Wishlist entries (product snapshots; legacy bare ids are kept). */
export function getWishlist() {
  const items = storage.get(STORAGE_KEYS.wishlist);
  if (!Array.isArray(items)) return [];
  return items.map((item) =>
    item && typeof item === "object" ? item : { productId: item }
  );
}

/** Number of items in the wishlist. */
export function getWishlistCount() {
  return getWishlist().length;
}

/** True when a product id is currently wishlisted. */
export function isInWishlist(productId) {
  return getWishlist().some(
    (item) => String(item.productId) === String(productId)
  );
}

/** Add a product snapshot to the wishlist. */
export function addItem(product = {}) {
  const id = product.id;
  if (id == null || isInWishlist(id)) return false;

  const items = getWishlist();
  items.push({
    productId: id,
    name: product.name || "Product",
    price: Number(product.price) || 0,
    imageUrl: product.imageUrl || "",
  });
  setWishlist(items);
  return true;
}

/** Remove a product from the wishlist. */
export function removeItem(productId) {
  const before = getWishlistCount();
  setWishlist(
    getWishlist().filter(
      (item) => String(item.productId) !== String(productId)
    )
  );
  return getWishlistCount() < before;
}

/** Add or remove a product. Returns true when it is now wishlisted. */
export function toggleItem(product = {}) {
  return isInWishlist(product.id) ? !removeItem(product.id) : addItem(product);
}

/** Notify every subscriber (e.g. navbar badge) that the wishlist changed. */
export function notifyWishlistUpdated() {
  window.dispatchEvent(new CustomEvent("wishlist:update"));
}

/** Replace the stored wishlist and notify listeners. */
export function setWishlist(items) {
  storage.set(STORAGE_KEYS.wishlist, Array.isArray(items) ? items : []);
  notifyWishlistUpdated();
}

/* ============================================================
   WISHLIST SERVICE - SUPABASE SYNCED WITH LOCAL CACHE
   ============================================================
   Drives the navbar badge, the wishlist toggle buttons on product
   cards and the wishlist page. The UI surface stays synchronous
   (getWishlist / isInWishlist / toggleItem): local storage is the
   source of truth for rendering, and every change is pushed to
   Supabase (rest/v1/wishlist_items) in the background when a user
   is signed in. On login the server list is pulled down and
   replaces the local cache, so the wishlist survives across devices.

   Behaviour matrix:
   - Signed out: works fully offline via localStorage (no server).
   - Signed in: first render uses local cache, then syncWishlistFromServer
     (called from app.js) replaces it with the server list and fires
     wishlist:update. Add/remove update the UI instantly (optimistic)
     and the server in the background; on a failed server call the
     cache is re-synced from the server so it rolls back.

   Supabase contract:
   - GET    /rest/v1/wishlist_items?select=product_id,created_at,
            product:products(id,name,price,image_url)
   - POST   /rest/v1/wishlist_items?on_conflict=user_id,product_id
            (idempotent add)
   - DELETE /rest/v1/wishlist_items?user_id=eq.<uid>&product_id=eq.<id>

   Local cache items are normalised to a product-card friendly shape:
   { id, productId, name, price, imageUrl, sellerName, rating,
     reviewsCount, addedAt }.
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS } from "../config.js";
import { rest, getAuthToken } from "./supabase.js";
import { getCurrentUser } from "./authService.js";

/** Select embedding the product snapshot needed to render a row. */
const WISHLIST_ITEM_SELECT =
  "product_id,created_at,product:products(id,name,price,image_url)";

/** Signed-in user id (null when signed out). */
function getUserId() {
  return getCurrentUser()?.id ?? null;
}

/** Normalise any stored / server item into the cache shape. */
function normalizeItem(item = {}) {
  if (!item || typeof item !== "object") {
    const bareId = item ?? "";
    return {
      id: bareId,
      productId: bareId,
      name: "Product",
      price: 0,
      imageUrl: "",
    };
  }
  const product = item.product ?? item;
  const productId = item.productId ?? product.id;
  return {
    id: productId,
    productId,
    name: item.name ?? product.name ?? "Product",
    price: Number(item.price ?? product.price) || 0,
    imageUrl: item.imageUrl ?? product.image_url ?? "",
    sellerName: item.sellerName ?? "",
    rating: item.rating ?? null,
    reviewsCount: item.reviewsCount ?? 0,
    addedAt: item.addedAt ?? item.created_at ?? null,
  };
}

/** Wishlist entries as normalised product snapshots. */
export function getWishlist() {
  const items = storage.get(STORAGE_KEYS.wishlist);
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem);
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

/** Push a single add/remove to Supabase when signed in. */
function persistToServer(productId, action) {
  const userId = getUserId();
  if (!userId || productId == null) return;

  const token = getAuthToken();
  const request =
    action === "add"
      ? rest.insert(
          "wishlist_items",
          { user_id: userId, product_id: Number(productId) },
          { upsert: true, onConflict: "user_id,product_id", token }
        )
      : rest.remove(
          "wishlist_items",
          { user_id: `eq.${userId}`, product_id: `eq.${productId}` },
          { token }
        );

  request.catch(() => {
    syncWishlistFromServer();
  });
}

/** Add a product snapshot to the wishlist. Returns true when added. */
export function addItem(product = {}) {
  const id = product.id;
  if (id == null || isInWishlist(id)) return false;

  const items = getWishlist();
  items.push(normalizeItem(product));
  setWishlist(items);
  persistToServer(id, "add");
  return true;
}

/** Remove a product from the wishlist. Returns true when removed. */
export function removeItem(productId) {
  const before = getWishlistCount();
  setWishlist(
    getWishlist().filter(
      (item) => String(item.productId) !== String(productId)
    )
  );
  const removed = getWishlistCount() < before;
  if (removed) persistToServer(productId, "remove");
  return removed;
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

let syncPromise = null;

/**
 * Pull the signed-in user's wishlist from Supabase and replace the
 * local cache. Single-flight: concurrent callers share one request.
 * Resolves true on success, false when signed out or on failure (the
 * local cache is kept on failure). Called from app.js on every page.
 */
export function syncWishlistFromServer() {
  const userId = getUserId();
  if (!userId) return Promise.resolve(false);
  if (syncPromise) return syncPromise;

  syncPromise = rest
    .list("wishlist_items", {
      select: WISHLIST_ITEM_SELECT,
      filters: { user_id: `eq.${userId}` },
      order: "created_at.desc",
      token: getAuthToken(),
    })
    .then(({ data }) => {
      const items = (Array.isArray(data) ? data : [])
        .map(normalizeItem)
        .filter(Boolean);
      if (items.length === 0) storage.remove(STORAGE_KEYS.wishlist);
      else storage.set(STORAGE_KEYS.wishlist, items);
      notifyWishlistUpdated();
      return true;
    })
    .catch((error) => {
      console.warn(
        "[wishlist] server sync failed, keeping local cache:",
        error?.message || error
      );
      return false;
    })
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

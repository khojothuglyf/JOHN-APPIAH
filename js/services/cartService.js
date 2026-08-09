/* ============================================================
   CART SERVICE - SUPABASE SYNCED WITH LOCAL CACHE
   ============================================================
   Drives the navbar badge, the cart page and the checkout
   summary. The UI surface stays synchronous (getCart,
   getCartItemCount, addItem, updateQuantity, ...): local storage
   is the source of truth for rendering, and every change is pushed
   to Supabase (rest/v1/cart_items) in the background when a user
   is signed in. On login the server cart replaces the local cache,
   so the cart survives across devices.

   Behaviour matrix:
   - Signed out: works fully offline via localStorage (no server).
   - Signed in: first render uses local cache, then syncCartFromServer
     (called from app.js) replaces it with the server cart and fires
     cart:update. Add/update/remove/clear update the UI instantly
     (optimistic) and the server in the background; on a failed
     server call the cache is re-synced from the server so it rolls
     back. Successful writes re-sync so the cache adopts the server's
     canonical cartItem ids.

   Supabase contract:
   - GET    /rest/v1/cart_items?select=id,quantity,created_at,
            product:products(id,name,price,image_url,seller_id)
   - POST   /rest/v1/cart_items?on_conflict=user_id,product_id
            (upsert: merge quantity onto the existing line)
   - PATCH  /rest/v1/cart_items?id=eq.<cartItemId>   { quantity }
   - DELETE /rest/v1/cart_items?id=eq.<cartItemId>
   - DELETE /rest/v1/cart_items?user_id=eq.<uid>     (clear)

   Local cache items are normalised to a cart-page friendly shape:
   { id (server cartItemId or local flag), productId, name, price,
     imageUrl, quantity, subtotal, sellerId, addedAt, localOnly }.
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS } from "../config.js";
import { rest, getAuthToken } from "./supabase.js";
import { getCurrentUser } from "./authService.js";

/** Select embedding the product snapshot needed to render a line. */
const CART_ITEM_SELECT =
  "id,quantity,created_at,product:products(id,name,price,image_url,seller_id)";

/** Signed-in user id (null when signed out). */
function getUserId() {
  return getCurrentUser()?.id ?? null;
}

/** Normalise a stored / server item into the cache shape. */
function normalizeItem(item = {}) {
  const product = item.product ?? item;
  const productId = item.productId ?? product.id;
  if (productId == null) return null;

  const price = Number(item.price ?? product.price) || 0;
  const quantity = Math.max(1, Number(item.quantity) || 1);
  return {
    id: item.id ?? productId,
    productId,
    name: item.name ?? product.name ?? "Product",
    price,
    imageUrl: item.imageUrl ?? product.image_url ?? "",
    quantity,
    subtotal: price * quantity,
    sellerId: item.sellerId ?? product.seller_id ?? null,
    addedAt: item.addedAt ?? item.created_at ?? null,
  };
}

/** All cart line items. */
export function getCart() {
  const items = storage.get(STORAGE_KEYS.cart);
  return Array.isArray(items)
    ? items.map(normalizeItem).filter(Boolean)
    : [];
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

/** Re-sync the local cache from the server (rollback / adoption). */
function resync() {
  syncCartFromServer();
}

/**
 * Add a product to the cart (merging into an existing line item).
 * Updates the UI synchronously, then pushes to Supabase when signed in.
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
    const line = normalizeItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      quantity: qty,
    });
    if (line) {
      line.localOnly = true;
      items.push(line);
    }
  }

  setCart(items);

  const userId = getUserId();
  if (userId && product.id != null) {
    pushAdd(userId, product.id, existing?.quantity ?? qty);
  }
}

/** Upsert a cart line on the server, then adopt the server truth. */
function pushAdd(userId, productId, quantity) {
  rest
    .insert(
      "cart_items",
      {
        user_id: userId,
        product_id: Number(productId),
        quantity: Number(quantity) || 1,
      },
      { upsert: true, onConflict: "user_id,product_id", token: getAuthToken() }
    )
    .then(resync)
    .catch(resync);
}

/**
 * Set a line item's quantity. Zero (or negative) removes the item.
 * Updates the UI synchronously, then syncs to the server.
 */
export function updateQuantity(productId, quantity) {
  const qty = Number(quantity) || 0;
  const items =
    qty > 0
      ? getCart().map((item) =>
          String(item.productId) === String(productId)
            ? { ...item, quantity: qty, subtotal: item.price * qty }
            : item
        )
      : getCart().filter(
          (item) => String(item.productId) !== String(productId)
        );

  setCart(items);

  const userId = getUserId();
  if (!userId || productId == null) return;

  const item = getCart().find(
    (entry) => String(entry.productId) === String(productId)
  );

  if (item?.id != null && !item.localOnly) {
    if (qty > 0) {
      rest
        .update(
          "cart_items",
          { id: `eq.${item.id}` },
          { quantity: qty },
          { token: getAuthToken() }
        )
        .then(resync)
        .catch(resync);
    } else {
      rest
        .remove("cart_items", { id: `eq.${item.id}` }, { token: getAuthToken() })
        .then(resync)
        .catch(resync);
    }
  } else if (qty > 0) {
    pushAdd(userId, productId, qty);
  }
}

/** Remove a single line item from the cart. */
export function removeItem(productId) {
  const item = getCart().find(
    (entry) => String(entry.productId) === String(productId)
  );

  setCart(
    getCart().filter(
      (entry) => String(entry.productId) !== String(productId)
    )
  );

  const userId = getUserId();
  if (userId && item?.id != null && !item.localOnly) {
    rest
      .remove("cart_items", { id: `eq.${item.id}` }, { token: getAuthToken() })
      .then(resync)
      .catch(resync);
  }
}

/** Empty the cart and notify listeners. */
export function clearCart() {
  setCart([]);

  const userId = getUserId();
  if (userId) {
    rest
      .remove("cart_items", { user_id: `eq.${userId}` }, { token: getAuthToken() })
      .catch(resync);
  }
}

/** Total value of all line items (sum of price x quantity). */
export function getCartSubtotal() {
  return getCart().reduce((total, item) => {
    const price = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 0;
    return total + price * quantity;
  }, 0);
}

let syncPromise = null;

/**
 * Pull the signed-in user's cart from Supabase and replace the
 * local cache. Single-flight: concurrent callers share one request.
 * Resolves true on success, false when signed out or on failure (the
 * local cache is kept on failure). Called from app.js on every page.
 */
export function syncCartFromServer() {
  const userId = getUserId();
  if (!userId) return Promise.resolve(false);
  if (syncPromise) return syncPromise;

  syncPromise = rest
    .list("cart_items", {
      select: CART_ITEM_SELECT,
      filters: { user_id: `eq.${userId}` },
      order: "created_at.asc",
      token: getAuthToken(),
    })
    .then(({ data }) => {
      const items = (Array.isArray(data) ? data : [])
        .map(normalizeItem)
        .filter(Boolean);
      setCart(items);
      return true;
    })
    .catch((error) => {
      console.warn(
        "[cart] server sync failed, keeping local cache:",
        error?.message || error
      );
      return false;
    })
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

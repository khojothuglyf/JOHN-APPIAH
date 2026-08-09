/* ============================================================
   SELLER SERVICE - TEMPORARY LOCAL SELLER STORE
   ============================================================
   Powers the seller dashboard: product management (CRUD against
   a seeded local catalogue), fulfilment (advancing order statuses
   from the local orders store) and stats. Phase 8+ swaps the
   internals with the backend seller API while keeping the same
   surface.

   Backend contract (verified against ProductController + OrderController):
   - GET    /api/v1/products/mine       (SELLER/ADMIN, paged)
   - POST   /api/v1/products
     REQUEST:  { name, description, price, stock, sku, imageUrl,
                 categoryId, status }    -> ProductResponse
   - PUT    /api/v1/products/{id}        -> ProductResponse
   - DELETE /api/v1/products/{id}        -> 204
   - GET    /api/v1/orders/seller        (SELLER/ADMIN, paged)
   - PUT    /api/v1/orders/{id}/status
     REQUEST:  { status }                -> OrderResponse
   (dashboard aggregate / stats endpoints: planned)

   ProductResponse: { id, name, description, price, stock, sku,
     imageUrl, status, categoryId, categoryName, sellerId,
     sellerName, createdAt, updatedAt }
   ProductStatus enum matches the backend exactly:
   ACTIVE, INACTIVE.
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS } from "../config.js";
import {
  ORDER_STATUS,
  getOrders,
  updateOrderStatus,
} from "./ordersService.js";

/** Availability states for a seller product (aligned with the
 *  backend ProductStatus enum). */
export const PRODUCT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
};

/** Demo catalogue shown until the backend is deployed. */
const SEED_PRODUCTS = [
  {
    id: 1,
    name: "Wireless Bluetooth Headphones",
    description: "Over-ear wireless headphones with active noise cancellation and 30h battery life.",
    price: 49.99,
    oldPrice: 79.99,
    imageUrl: "",
    category: "Electronics",
    stock: 42,
    status: PRODUCT_STATUS.ACTIVE,
    rating: 4.6,
    reviewsCount: 128,
  },
  {
    id: 2,
    name: "Premium Cotton T-Shirt",
    description: "Soft, breathable 100% cotton tee in a regular fit.",
    price: 19.99,
    oldPrice: 0,
    imageUrl: "",
    category: "Fashion",
    stock: 150,
    status: PRODUCT_STATUS.ACTIVE,
    rating: 4.2,
    reviewsCount: 76,
  },
  {
    id: 3,
    name: "Ceramic Coffee Mug",
    description: "Stoneware mug with a matte finish and a 350ml capacity.",
    price: 14.5,
    oldPrice: 18,
    imageUrl: "",
    category: "Home & Living",
    stock: 60,
    status: PRODUCT_STATUS.ACTIVE,
    rating: 4.8,
    reviewsCount: 210,
  },
  {
    id: 4,
    name: "Vitamin C Brightening Serum",
    description: "10% vitamin C face serum for a radiant, even complexion.",
    price: 24.99,
    oldPrice: 0,
    imageUrl: "",
    category: "Beauty & Health",
    stock: 35,
    status: PRODUCT_STATUS.ACTIVE,
    rating: 4.4,
    reviewsCount: 54,
  },
  {
    id: 5,
    name: "Non-Slip Yoga Mat",
    description: "6mm extra-thick yoga mat with alignment lines and carry strap.",
    price: 29.99,
    oldPrice: 0,
    imageUrl: "",
    category: "Sports & Outdoors",
    stock: 80,
    status: PRODUCT_STATUS.INACTIVE,
    rating: 0,
    reviewsCount: 0,
  },
  {
    id: 6,
    name: "Wooden Building Blocks",
    description: "50-piece natural wood stacking blocks for creative play.",
    price: 22,
    oldPrice: 0,
    imageUrl: "",
    category: "Toys & Games",
    stock: 20,
    status: PRODUCT_STATUS.ACTIVE,
    rating: 4.7,
    reviewsCount: 95,
  },
];

/** Seed the local catalogue once, only when no data exists yet. */
function getStored() {
  const stored = storage.get(STORAGE_KEYS.sellerProducts);
  if (stored === null) {
    storage.set(STORAGE_KEYS.sellerProducts, SEED_PRODUCTS);
    return [...SEED_PRODUCTS];
  }
  return Array.isArray(stored) ? stored : [];
}

/** All products owned by the seller. */
export function getSellerProducts() {
  return getStored();
}

/** A single seller product by id, or null. */
export function getSellerProduct(id) {
  return getSellerProducts().find(
    (product) => String(product.id) === String(id)
  ) ?? null;
}

/** Create a product; assigns the next numeric id and resets rating. */
export function createProduct(data = {}) {
  const products = getSellerProducts();
  const nextId =
    products.reduce((max, product) => Math.max(max, Number(product.id) || 0), 0) + 1;

  const product = {
    id: nextId,
    name: data.name || "Untitled product",
    description: data.description || "",
    price: Number(data.price) || 0,
    oldPrice: Number(data.oldPrice) || 0,
    imageUrl: data.imageUrl || "",
    category: data.category || "",
    categoryId: data.categoryId ?? null,
    sku: data.sku || "",
    stock: Number(data.stock) || 0,
    status: data.status || PRODUCT_STATUS.INACTIVE,
    rating: 0,
    reviewsCount: 0,
  };

  products.push(product);
  storage.set(STORAGE_KEYS.sellerProducts, products);
  return product;
}

/** Update an existing product (partial merge). Returns it or null. */
export function updateProduct(id, data = {}) {
  const products = getSellerProducts();
  let updated = null;

  const next = products.map((product) => {
    if (String(product.id) !== String(id)) return product;
    updated = { ...product, ...data, id: product.id };
    return updated;
  });

  if (!updated) return null;
  storage.set(STORAGE_KEYS.sellerProducts, next);
  return updated;
}

/** Delete a product. Returns true when something was removed. */
export function deleteProduct(id) {
  const before = getSellerProducts().length;
  storage.set(
    STORAGE_KEYS.sellerProducts,
    getSellerProducts().filter((product) => String(product.id) !== String(id))
  );
  return getSellerProducts().length < before;
}

/** Orders available for fulfilment (all placed orders, newest first). */
export function getSellerOrders() {
  return getOrders();
}

/** Advance an order's status (see ordersService). */
export function updateSellerOrderStatus(orderId, status) {
  return updateOrderStatus(orderId, status);
}

/** Dashboard summary numbers. */
export function getSellerStats() {
  const orders = getSellerOrders();
  const activeOrders = orders.filter(
    (order) =>
      order.status !== ORDER_STATUS.CANCELLED &&
      order.status !== ORDER_STATUS.DELIVERED
  ).length;
  const pendingOrders = orders.filter((order) =>
    [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED].includes(order.status)
  ).length;
  const revenue = orders
    .filter((order) => order.status !== ORDER_STATUS.CANCELLED)
    .reduce((total, order) => total + (Number(order.total) || 0), 0);

  return {
    totalProducts: getSellerProducts().length,
    activeOrders,
    pendingOrders,
    revenue,
  };
}

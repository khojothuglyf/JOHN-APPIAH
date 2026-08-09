/* ============================================================
   PRODUCT SERVICE - SUPABASE POSTGREST
   ============================================================
   Paged product queries. The homepage uses getFeaturedProducts;
   the catalog reuses getProducts with search / sort / category
   filters.

   Supabase contract:
   - GET /rest/v1/products (PostgREST)
     - select embeds category + seller names.
     - filters: status=eq.ACTIVE, category_id=eq.<id>,
       or=(name.ilike.*kw*,description.ilike.*kw*)
     - order: price.asc / price.desc / created_at.desc
     - paging: Range header (e.g. "0-23"), total via content-range
   - GET /rest/v1/products?id=eq.<id>

   The service keeps the previous page-facing contract so the UI
   is untouched: getProducts resolves
   { content, page, size, totalElements, totalPages, last } and
   product rows carry both snake_case API fields and the camelCase
   UI fields (category, categoryId, categoryName, sellerName,
   oldPrice, imageUrl, ...).
   ============================================================ */

import { rest, parseContentRange } from "./supabase.js";
import { ApiError } from "./api.js";
import { DEFAULT_PAGE_SIZE } from "../config.js";

/** Cap on products fetched for the advanced client-side filter
 *  mode (price range, rating, availability, seller, discount).
 *  Beyond this the facets/limits are an approximation. */
export const MAX_FILTER_FETCH = 500;

/** PostgREST select with embedded category + seller names. */
const PRODUCT_SELECT =
  "id,name,description,price,old_price,stock,sku,image_url,status," +
  "category_id,seller_id,created_at,updated_at," +
  "category:categories(name),seller:profiles(first_name,last_name)";

/** Normalize a PostgREST product row for the UI templates. */
export function normalizeProduct(row = {}) {
  const categoryName = row.category?.name ?? "";
  const sellerName = row.seller
    ? [row.seller.first_name, row.seller.last_name].filter(Boolean).join(" ")
    : "";
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    price: Number(row.price) || 0,
    oldPrice: Number(row.old_price) || 0,
    stock: Number(row.stock) || 0,
    sku: row.sku ?? "",
    imageUrl: row.image_url ?? "",
    status: row.status,
    categoryId: row.category_id ?? null,
    categoryName,
    sellerId: row.seller_id ?? null,
    sellerName,
    rating: null,
    reviewsCount: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category:
      row.category_id != null
        ? { id: row.category_id, name: categoryName }
        : null,
  };
}

/** Escape LIKE wildcards in user search terms. */
function escapeLike(value) {
  return String(value).replace(/[%_\\]/g, (match) => `\\${match}`);
}

/** Map catalog sort tokens to PostgREST order params. */
function toPostgrestOrder(sort) {
  switch (sort) {
    case "price_asc":
      return "price.asc";
    case "price_desc":
      return "price.desc";
    case "newest":
      return "created_at.desc";
    default:
      return "created_at.desc";
  }
}

/** Build PostgREST filters shared by the paged queries. */
function buildFilters(params = {}) {
  const filters = { status: "eq.ACTIVE" };
  if (params.categoryId != null && params.categoryId !== "") {
    filters.category_id = `eq.${params.categoryId}`;
  }
  if (params.keyword) {
    const keyword = escapeLike(params.keyword);
    filters.or = `(name.ilike.*${keyword}*,description.ilike.*${keyword}*)`;
  }
  return filters;
}

/** Products shown in the homepage "Featured Products" band. */
export async function getFeaturedProducts(limit = 8) {
  const count = Math.max(1, Number(limit) || 8);
  const { data } = await rest.list("products", {
    select: PRODUCT_SELECT,
    filters: { status: "eq.ACTIVE" },
    order: "created_at.desc",
    range: { start: 0, end: count - 1 },
  });
  return {
    content: (Array.isArray(data) ? data : []).map(normalizeProduct),
  };
}

/** Single product by id. Resolves to a Product object. */
export async function getProduct(id) {
  const { data } = await rest.list("products", {
    select: PRODUCT_SELECT,
    filters: { id: `eq.${id}` },
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new ApiError(404, "Product not found. It may have been removed.");
  }
  return normalizeProduct(row);
}

/**
 * Fetch the full set of products matching the base (server-side)
 * filters so advanced filters (price range, rating, availability,
 * seller, discount) can run client-side. Uses a cheap size=1 probe
 * to learn totalElements, then fetches up to MAX_FILTER_FETCH rows.
 *
 * Resolves to a flat array of normalized Product objects.
 */
export async function getAllMatchingProducts(params = {}) {
  const probe = await getProducts({ ...params, page: 0, size: 1 });
  const total = Number(probe.totalElements) || 0;
  const size = Math.min(Math.max(total, 1), MAX_FILTER_FETCH);
  const body = await getProducts({ ...params, page: 0, size });
  return Array.isArray(body.content) ? body.content : [];
}

/** Paged product listing with optional search / filter params. */
export async function getProducts(params = {}) {
  const page = Math.max(0, Number(params.page) || 0);
  const size = Math.max(1, Number(params.size) || DEFAULT_PAGE_SIZE);
  const order = toPostgrestOrder(params.sort);

  const { data, headers } = await rest.list("products", {
    select: PRODUCT_SELECT,
    filters: buildFilters(params),
    order,
    range: { start: page * size, end: page * size + size - 1 },
  });

  const content = (Array.isArray(data) ? data : []).map(normalizeProduct);
  const totalElements = parseContentRange(headers) ?? content.length;
  const totalPages =
    size > 0 ? Math.max(1, Math.ceil(totalElements / size)) : 0;

  return {
    content,
    page,
    size,
    totalElements,
    totalPages,
    last: page + 1 >= totalPages,
  };
}

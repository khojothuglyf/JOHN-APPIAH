/* ============================================================
   PRODUCT SERVICE
   ============================================================
   Paged product queries. The homepage uses getFeaturedProducts;
   the catalog reuses getProducts with search / sort / category
   filters.

   Backend contract (verified against ProductController):
   - GET /api/v1/products?page=0&size=24&categoryId=1&sort=price,asc
     RESPONSE: ApiResponse<PagedResponse<ProductResponse>>
     PagedResponse: { content: Product[], page, size, totalElements,
                      totalPages, last:boolean }
     ProductResponse: { id, name, description, price, stock, sku,
                        imageUrl, status, categoryId, categoryName,
                        sellerId, sellerName, createdAt, updatedAt }
   - GET /api/v1/products/{id}
     RESPONSE: ApiResponse<ProductResponse>
   - GET /api/v1/products/mine         (SELLER/ADMIN, paged)
   - POST /api/v1/products             (SELLER/ADMIN)
   - PUT  /api/v1/products/{id}        (SELLER/ADMIN)
   - DELETE /api/v1/products/{id}      (SELLER/ADMIN)

   Notes on backend gaps:
   - No /products/featured endpoint: getFeaturedProducts reuses the
     list endpoint (newest first), which is the closest behaviour.
   - Search is sent as `keyword` (backend filters name/description/sku).
   - No rating sort yet; the catalog sort tokens are mapped to Spring
     sort params and unsupported ones are dropped, so the page never
     errors.
   ============================================================ */

import { http } from "./api.js";
import {
  API_ENDPOINTS,
  DEFAULT_PAGE_SIZE,
  endpointPath,
} from "../config.js";

/** Normalize a backend ProductResponse for the UI templates. */
function normalizeProduct(product = {}) {
  return {
    ...product,
    category:
      product.categoryId != null
        ? { id: product.categoryId, name: product.categoryName || "" }
        : product.category,
  };
}

/** Map catalog sort tokens to Spring Data sort params. */
function toSpringSort(sort) {
  switch (sort) {
    case "price_asc":
      return "price,asc";
    case "price_desc":
      return "price,desc";
    case "newest":
      return "createdAt,desc";
    case "rating":
      return undefined;
    default:
      return undefined;
  }
}

/** Products shown in the homepage "Featured Products" band. */
export async function getFeaturedProducts(limit = 8) {
  const body = await http.get(API_ENDPOINTS.products.featured, {
    params: { page: 0, size: limit },
  });
  const data = body?.data ?? body ?? {};
  return {
    ...data,
    content: (Array.isArray(data.content) ? data.content : []).map(
      normalizeProduct
    ),
  };
}

/** Single product by id. Resolves to a Product object. */
export async function getProduct(id) {
  const body = await http.get(endpointPath(API_ENDPOINTS.products.detail, { id }));
  return normalizeProduct(body?.data ?? body ?? {});
}

/** Paged product listing with optional search / filter params. */
export async function getProducts(params = {}) {
  const query = {
    page: 0,
    size: DEFAULT_PAGE_SIZE,
    ...params,
  };
  const sort = toSpringSort(query.sort);
  delete query.sort;
  if (sort) query.sort = sort;

  const body = await http.get(API_ENDPOINTS.products.list, { params: query });
  const data = body?.data ?? body ?? {};
  return {
    ...data,
    content: (Array.isArray(data.content) ? data.content : []).map(
      normalizeProduct
    ),
  };
}

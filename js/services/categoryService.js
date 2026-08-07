/* ============================================================
   CATEGORY SERVICE
   ============================================================
   Categories drive the homepage grid and the "Shop by Category"
   navigation.

   Backend contract (verified against CategoryController):
   - GET /api/v1/categories
     RESPONSE: ApiResponse<CategoryResponse[]>
     CategoryResponse: { id, name, description, parentId,
                         subcategories, createdAt, updatedAt }
   - GET /api/v1/categories/{id}
   - POST /api/v1/categories          (ADMIN, { name, description })
   - PUT  /api/v1/categories/{id}     (ADMIN, { name, description })
   - DELETE /api/v1/categories/{id}   (ADMIN)

   Note: the backend CategoryResponse has no productCount / imageUrl;
   the card template falls back to the description label when the
   count is absent.

   Performance: results are cached in sessionStorage for the tab
   lifetime (5 min TTL) plus a module-level cache for repeated calls
   on the same page. Concurrent callers share a single request.
   ============================================================ */

import { http } from "./api.js";
import { API_ENDPOINTS, STORAGE_KEYS } from "../config.js";
import { sessionStorage } from "../utils/storage.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

let memoryCache = null;
let inFlight = null;

/** All product categories, ordered for display. */
export async function getCategories() {
  if (memoryCache) return memoryCache;

  const cached = sessionStorage.get(STORAGE_KEYS.categoriesCache);
  if (cached && Array.isArray(cached.data) && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    memoryCache = cached.data;
    return memoryCache;
  }

  if (!inFlight) {
    inFlight = (async () => {
      try {
        const body = await http.get(API_ENDPOINTS.categories.list);
        const data = body?.data ?? body;
        const categories = Array.isArray(data) ? data : [];
        memoryCache = categories;
        sessionStorage.set(STORAGE_KEYS.categoriesCache, {
          data: categories,
          fetchedAt: Date.now(),
        });
        return categories;
      } finally {
        inFlight = null;
      }
    })();
  }

  return inFlight;
}

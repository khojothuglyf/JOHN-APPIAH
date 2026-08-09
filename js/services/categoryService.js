/* ============================================================
   CATEGORY SERVICE - SUPABASE POSTGREST
   ============================================================
   Categories drive the homepage grid and the "Shop by Category"
   navigation.

   Supabase contract:
   - GET /rest/v1/categories?select=id,name,description&order=id.asc
     RESPONSE: array of Category rows
     Category: { id, name, description, created_at, updated_at }

   Performance: results are cached in sessionStorage for the tab
   lifetime (5 min TTL) plus a module-level cache for repeated calls
   on the same page. Concurrent callers share a single request.
   ============================================================ */

import { rest } from "./supabase.js";
import { STORAGE_KEYS } from "../config.js";
import { sessionStorage } from "../utils/storage.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

let memoryCache = null;
let inFlight = null;

/** All product categories, ordered for display. */
export async function getCategories() {
  if (memoryCache) return memoryCache;

  const cached = sessionStorage.get(STORAGE_KEYS.categoriesCache);
  if (
    cached &&
    Array.isArray(cached.data) &&
    Date.now() - cached.fetchedAt < CACHE_TTL_MS
  ) {
    memoryCache = cached.data;
    return memoryCache;
  }

  if (!inFlight) {
    inFlight = (async () => {
      try {
        const { data } = await rest.list("categories", {
          select: "id,name,description,created_at,updated_at",
          order: "id.asc",
        });
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

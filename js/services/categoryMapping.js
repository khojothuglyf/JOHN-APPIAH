/* ============================================================
   CATEGORY MAPPING - SUPABASE <-> SPRING BOOT BACKEND
   ============================================================
   The storefront reads the Supabase `categories` table
   (categoryService.js) while the Spring Boot backend keeps its own
   `categories` table for seller products, orders and analytics. The
   two stores share no id, so the category NAME is the temporary
   cross-system mapping key (both sides enforce a unique name and
   seed the same canonical set).

   These helpers turn the two lists into one option list that
   carries BOTH ids per category:
       { name, supabaseId, backendId }
   - Matching is case-insensitive on the trimmed name.
   - `backendId` is null when a Supabase category has no backend
     counterpart. It must NEVER be guessed and NEVER fall back to
     the Supabase id - the Spring Boot API rejects Supabase ids, so
     such categories are unavailable for backend product creation.
   ============================================================ */

/** Normalize a category name for comparison. */
function normalizeName(name) {
  return String(name ?? "").trim().toLowerCase();
}

/**
 * Map Supabase categories to their Spring Boot counterparts by name.
 * Every Supabase category yields exactly one entry carrying both
 * ids; categories without a backend match keep `backendId: null`.
 * Duplicate names (within either list) collapse to the first entry.
 */
export function buildCategoryOptions(
  supabaseCategories = [],
  backendCategories = []
) {
  const backendByName = new Map();
  for (const category of Array.isArray(backendCategories)
    ? backendCategories
    : []) {
    const key = normalizeName(category.name);
    if (!key || backendByName.has(key)) continue;
    backendByName.set(key, category.id != null ? category.id : null);
  }

  const options = [];
  const seen = new Set();
  for (const category of Array.isArray(supabaseCategories)
    ? supabaseCategories
    : []) {
    const name = String(category.name ?? "").trim();
    const key = normalizeName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    options.push({
      name,
      supabaseId: category.id != null ? category.id : null,
      backendId: backendByName.has(key) ? backendByName.get(key) : null,
    });
  }
  return options;
}

/**
 * Resolve the Spring Boot category id for a selected category name.
 * Returns null (never the Supabase id) when the name is blank or has
 * no backend match - the caller must block the submission.
 */
export function findBackendCategoryId(options = [], name) {
  const key = normalizeName(name);
  if (!key) return null;
  for (const option of Array.isArray(options) ? options : []) {
    if (normalizeName(option.name) === key) {
      return option.backendId != null ? option.backendId : null;
    }
  }
  return null;
}

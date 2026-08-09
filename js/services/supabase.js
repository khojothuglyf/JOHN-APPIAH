/* ============================================================
   SUPABASE CLIENT (zero runtime dependencies)
   Raw REST calls to Supabase Auth (/auth/v1) and PostgREST
   (/rest/v1). Used by the feature services (auth, products,
   categories, cart, wishlist) instead of the old Spring REST API.

   Authentication headers:
   - `apikey`: the Supabase anon/public key (always sent).
   - `Authorization: Bearer <token>`: the signed-in access token;
     the anon key is used when no user is signed in, so public
     RLS policies (categories/products reads) still work.

   Errors are normalised to ApiError (status + user-facing message).
   ============================================================ */

import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_KEYS } from "../config.js";
import { storage } from "../utils/storage.js";
import { ApiError } from "./api.js";

const AUTH_PATH = "/auth/v1";
const REST_PATH = "/rest/v1";
const DEFAULT_TIMEOUT = 15000;

/** Read the signed-in access token (null when signed out). */
export function getAuthToken() {
  return storage.get(STORAGE_KEYS.token) || null;
}

/**
 * Core request helper.
 * @param {string} path  path appended to SUPABASE_URL (e.g. /rest/v1/products)
 * @param {object} options { method, body, headers, token, withHeaders, timeout }
 */
async function supabaseRequest(
  path,
  {
    method = "GET",
    body = null,
    headers = {},
    token = null,
    withHeaders = false,
    timeout = DEFAULT_TIMEOUT,
  } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        payload?.message ||
        payload?.error_description ||
        payload?.error ||
        payload?.msg ||
        (typeof payload === "string" && payload) ||
        response.statusText ||
        "Request failed.";
      throw new ApiError(response.status, message, payload);
    }

    return withHeaders ? { body: payload, headers: response.headers } : payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === "AbortError") {
      throw new ApiError(0, "The request timed out. Please try again.");
    }
    throw new ApiError(
      0,
      "Network error. Check your connection and try again."
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the total row count from a PostgREST content-range header. */
export function parseContentRange(headers) {
  if (!headers) return null;
  const value =
    typeof headers.get === "function"
      ? headers.get("content-range")
      : headers["content-range"];
  if (!value) return null;
  const total = String(value).split("/")[1];
  if (!total || total === "*") return null;
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : null;
}

/* ============================================================
   Auth endpoints (Supabase GoTrue)
   ============================================================ */

export const supabaseAuth = {
  /** Create an account. Metadata flows into the profiles trigger. */
  signUp({ email, password, firstName, lastName, requestedRole }) {
    return supabaseRequest(`${AUTH_PATH}/signup`, {
      method: "POST",
      body: {
        email,
        password,
        data: {
          first_name: firstName || "",
          last_name: lastName || "",
          requested_role: requestedRole === "seller" ? "seller" : "buyer",
        },
      },
    });
  },

  /** Sign in with email + password. */
  signInWithPassword({ email, password }) {
    return supabaseRequest(`${AUTH_PATH}/token?grant_type=password`, {
      method: "POST",
      body: { email, password },
    });
  },

  /** Exchange a refresh token for a fresh session. */
  refreshSession(refreshToken) {
    return supabaseRequest(`${AUTH_PATH}/token?grant_type=refresh_token`, {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
  },

  /** Current authenticated user (requires the access token). */
  getUser(token) {
    return supabaseRequest(`${AUTH_PATH}/user`, { token });
  },

  /** Revoke the session on the server (best effort). */
  signOut(token) {
    return supabaseRequest(`${AUTH_PATH}/logout`, { method: "POST", token });
  },

  /** Send a password recovery email. */
  recover(email) {
    return supabaseRequest(`${AUTH_PATH}/recover`, {
      method: "POST",
      body: { email },
    });
  },
};

/* ============================================================
   PostgREST endpoints (/rest/v1)
   Filters use PostgREST syntax: { column: "eq.7" }, { column: "ilike.*x*" },
   { or: "(name.ilike.*x*,description.ilike.*x*)" }.
   ============================================================ */

export const rest = {
  /**
   * GET rows. Resolves to { data: rows, headers } where headers
   * carry the content-range used to read the total row count.
   */
  list(
    table,
    {
      select = "*",
      filters = {},
      order = null,
      range = null,
      token = null,
      prefer = null,
    } = {}
  ) {
    const url = new URL(`${SUPABASE_URL}${REST_PATH}/${table}`);
    url.searchParams.set("select", select);
    for (const [column, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(column, value);
    }
    if (order) url.searchParams.set("order", order);

    const headers = { Prefer: prefer || "count=exact" };
    if (range) {
      headers.Range = `${range.start}-${range.end}`;
      headers["Range-Unit"] = "items";
    }

    return supabaseRequest(url.pathname + url.search, {
      headers,
      token,
      withHeaders: true,
    }).then(({ body, headers: responseHeaders }) => ({
      data: Array.isArray(body) ? body : [],
      headers: responseHeaders,
    }));
  },

  /** INSERT a row; with upsert + onConflict, merges on conflict. */
  insert(table, body, { token = null, upsert = false, onConflict = null } = {}) {
    let query = "";
    const headers = { Prefer: "return=representation" };
    if (upsert && onConflict) {
      headers.Prefer = "resolution=merge-duplicates,return=representation";
      query = `?on_conflict=${encodeURIComponent(onConflict)}`;
    }
    return supabaseRequest(`${REST_PATH}/${table}${query}`, {
      method: "POST",
      body,
      headers,
      token,
    });
  },

  /** PATCH rows matching the filters. */
  update(table, filters, body, { token = null } = {}) {
    const url = new URL(`${SUPABASE_URL}${REST_PATH}/${table}`);
    for (const [column, value] of Object.entries(filters)) {
      url.searchParams.set(column, value);
    }
    return supabaseRequest(url.pathname + url.search, {
      method: "PATCH",
      body,
      headers: { Prefer: "return=representation" },
      token,
    });
  },

  /** DELETE rows matching the filters. */
  remove(table, filters, { token = null } = {}) {
    const url = new URL(`${SUPABASE_URL}${REST_PATH}/${table}`);
    for (const [column, value] of Object.entries(filters)) {
      url.searchParams.set(column, value);
    }
    return supabaseRequest(url.pathname + url.search, {
      method: "DELETE",
      token,
    });
  },
};

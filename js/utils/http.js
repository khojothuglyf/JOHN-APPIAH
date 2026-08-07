/* ============================================================
   HTTP CLIENT
   Single fetch wrapper used by every service. Handles:
   - base URL + endpoint resolution
   - JSON serialization / parsing
   - auth token injection
   - query-string params
   - timeout via AbortController
   - normalized errors (ApiError)
   ============================================================ */

import { API_BASE_URL, STORAGE_KEYS } from "../config.js";
import { storage } from "./storage.js";

const DEFAULT_TIMEOUT = 15000;

/** Error thrown for any non-2xx response or network failure. */
export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function resolveUrl(path, params) {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
  }
  return url;
}

function readToken() {
  return storage.get(STORAGE_KEYS.token);
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      body?.detail ||
      (typeof body === "string" && body) ||
      response.statusText ||
      "Request failed.";
    throw new ApiError(response.status, message, body);
  }

  return body;
}

/**
 * Core request helper.
 * @param {string} path   API path (see API_ENDPOINTS) or absolute URL.
 * @param {object} options { method, body, params, headers, auth, timeout }
 */
export async function request(path, options = {}) {
  const {
    method = "GET",
    body = null,
    params = null,
    headers = {},
    auth = true,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const requestHeaders = {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    };

    if (auth) {
      const token = readToken();
      if (token) requestHeaders.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(resolveUrl(path, params), {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    return await parseResponse(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === "AbortError") {
      throw new ApiError(0, "The request timed out. Please try again.");
    }
    throw new ApiError(0, "Network error. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

export const http = {
  get: (path, options = {}) => request(path, { ...options, method: "GET" }),
  post: (path, body, options = {}) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options = {}) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options = {}) =>
    request(path, { ...options, method: "PATCH", body }),
  delete: (path, options = {}) => request(path, { ...options, method: "DELETE" }),
};

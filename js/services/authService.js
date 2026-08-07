/* ============================================================
   AUTH SERVICE
   ============================================================
   Login / registration / password recovery are now wired to the
   backend REST API. The session helpers (setSession, getCurrentUser,
   logout, ...) remain the single way the UI reads auth state.

   Backend contract:
   - POST /api/v1/auth/login
     REQUEST:  { email, password }
     RESPONSE: ApiResponse<AuthResponse>
       AuthResponse: { accessToken, tokenType, expiresIn,
                       user: { id, firstName, lastName, email, role } }
   - POST /api/v1/auth/register
     REQUEST:  { firstName, lastName, email, password, roleName }
     RESPONSE: ApiResponse<AuthResponse> (same shape as login)
   - POST /api/v1/auth/forgot-password   (planned: not in backend yet)
     REQUEST:  { email }
     RESPONSE: { message }
   - POST /api/v1/auth/logout            (planned: not in backend yet)

   The functions below unwrap the ApiResponse envelope and expose
   the session as { token, user } to the rest of the app.
   ============================================================ */

import { http } from "./api.js";
import { storage } from "../utils/storage.js";
import { STORAGE_KEYS, USER_ROLES, API_ENDPOINTS } from "../config.js";

/** Resolve a role that is safe to render in the UI. */
function normalizeRole(role) {
  return Object.prototype.hasOwnProperty.call(USER_ROLES, role)
    ? role
    : USER_ROLES.CUSTOMER;
}

/**
 * Map a backend AuthResponse ({ accessToken, user }) into the
 * session shape the app uses ({ token, user }).
 */
function toSession(body) {
  const { accessToken, user } = body?.data ?? body ?? {};
  return {
    token: accessToken || body?.accessToken || null,
    user: user || null,
  };
}

/** Sign in with email + password. Resolves to { token, user }. */
export async function login(credentials) {
  return toSession(await http.post(API_ENDPOINTS.auth.login, credentials));
}

/** Create a new account. Resolves to { token, user }. */
export async function register(payload) {
  return toSession(await http.post(API_ENDPOINTS.auth.register, payload));
}

/** Request a password reset link for an email address. */
export async function forgotPassword(email) {
  return http.post(API_ENDPOINTS.auth.forgotPassword, { email });
}

/** Current signed-in user object, or null. */
export function getCurrentUser() {
  return storage.get(STORAGE_KEYS.user);
}

/** True when a user session exists. */
export function isAuthenticated() {
  return Boolean(getCurrentUser());
}

/** Role of the signed-in user (CUSTOMER | SELLER | ADMIN | null). */
export function getRole() {
  const user = getCurrentUser();
  return user?.role ? normalizeRole(user.role) : null;
}

/** Persist a session after login / registration. */
export function setSession({ token, user }) {
  if (token) storage.set(STORAGE_KEYS.token, token);
  storage.set(STORAGE_KEYS.user, { ...user, role: normalizeRole(user?.role) });
}

/** Clear the session on logout. */
export function logout() {
  storage.remove(STORAGE_KEYS.token);
  storage.remove(STORAGE_KEYS.user);
}

/** Full name shorthand used across the UI. */
export function getDisplayName() {
  const user = getCurrentUser();
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

/** Initials shown in the avatar / dropdown header. */
export function getInitials() {
  const user = getCurrentUser();
  if (!user) return "";
  const first = user.firstName?.[0] ?? "";
  const last = user.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || "?";
}

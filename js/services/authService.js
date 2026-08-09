/* ============================================================
   AUTH SERVICE - SUPABASE AUTH
   ============================================================
   Login / registration / password recovery are wired to Supabase
   Auth (via js/services/supabase.js). The session helpers
   (setSession, getCurrentUser, logout, ...) remain the single way
   the UI reads auth state.

   Session shape exposed to the app: { token, refreshToken, user }.
   user: { id, email, firstName, lastName, role, createdAt } where
   role comes from the profiles table (the auth.user object has no
   role).

   Notes:
   - When email confirmation is enabled, signUp returns a user but
     no access token. register() then resolves { token: null, user }
     and the page shows a "check your email" state instead of
     signing in.
   - The very first registered user becomes the ADMIN automatically
     (supabase/schema.sql trigger).
   ============================================================ */

import { ApiError } from "./api.js";
import { rest, supabaseAuth } from "./supabase.js";
import { storage, sessionStorage as sessionStore } from "../utils/storage.js";
import { STORAGE_KEYS, USER_ROLES } from "../config.js";

/** Resolve a role that is safe to render in the UI. */
function normalizeRole(role) {
  return Object.prototype.hasOwnProperty.call(USER_ROLES, role)
    ? role
    : USER_ROLES.CUSTOMER;
}

/**
 * Build the app user shape from the Supabase auth user + profile.
 * The profile (from public.profiles) carries firstName/lastName/role.
 */
function userFromAuth(authUser = {}, profile = null) {
  const meta = authUser.user_metadata ?? authUser.raw_user_meta_data ?? {};
  return {
    id: authUser.id ?? profile?.id ?? null,
    email: authUser.email ?? profile?.email ?? "",
    firstName:
      profile?.first_name || meta.first_name || authUser.firstName || "",
    lastName:
      profile?.last_name || meta.last_name || authUser.lastName || "",
    role: profile?.role
      ? normalizeRole(profile.role)
      : USER_ROLES.CUSTOMER,
    createdAt: profile?.created_at ?? authUser.created_at ?? null,
  };
}

/** Fetch a user's public profile row (best effort). */
async function fetchProfile(userId, token) {
  if (!userId || !token) return null;
  try {
    const { data } = await rest.list("profiles", {
      select: "id,first_name,last_name,email,role,created_at",
      filters: { id: `eq.${userId}` },
      token,
    });
    return Array.isArray(data) ? data[0] ?? null : null;
  } catch {
    return null;
  }
}

/** Sign in with email + password. Resolves to { token, refreshToken, user }. */
export async function login({ email, password }) {
  const body = await supabaseAuth.signInWithPassword({ email, password });
  const token = body.access_token ?? null;
  const authUser = body.user ?? null;
  const profile = await fetchProfile(authUser?.id, token);
  return {
    token,
    refreshToken: body.refresh_token ?? null,
    user: authUser ? userFromAuth(authUser, profile) : null,
  };
}

/**
 * Create a new account. Resolves to { token, refreshToken, user }.
 * token is null when Supabase requires email confirmation first.
 */
export async function register(payload) {
  const body = await supabaseAuth.signUp({
    email: payload.email,
    password: payload.password,
    firstName: payload.firstName,
    lastName: payload.lastName,
  });
  const token = body.access_token ?? null;
  const authUser = body.user ?? body ?? null;
  const profile = token ? await fetchProfile(authUser?.id, token) : null;
  return {
    token,
    refreshToken: body.refresh_token ?? null,
    user: authUser ? userFromAuth(authUser, profile) : null,
  };
}

/** Request a password reset link for an email address. */
export async function forgotPassword(email) {
  await supabaseAuth.recover(email);
  return { success: true };
}

/** Current signed-in user object, or null. Local sessions win
 *  over tab-scoped preview sessions. */
export function getCurrentUser() {
  return storage.get(STORAGE_KEYS.user) ?? sessionStore.get(STORAGE_KEYS.user);
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
export function setSession({ token, user, refreshToken }) {
  if (token) storage.set(STORAGE_KEYS.token, token);
  if (refreshToken) storage.set(STORAGE_KEYS.refreshToken, refreshToken);
  storage.set(STORAGE_KEYS.user, {
    ...(user || {}),
    role: normalizeRole(user?.role),
  });
}

/** Clear the session on logout (local and preview). */
export function logout() {
  const token = storage.get(STORAGE_KEYS.token);
  if (token) {
    supabaseAuth.signOut(token).catch(() => {});
  }
  storage.remove(STORAGE_KEYS.token);
  storage.remove(STORAGE_KEYS.refreshToken);
  storage.remove(STORAGE_KEYS.user);
  sessionStore.remove(STORAGE_KEYS.token);
  sessionStore.remove(STORAGE_KEYS.refreshToken);
  sessionStore.remove(STORAGE_KEYS.user);
  window.dispatchEvent(new CustomEvent("auth:changed"));
}

/**
 * Demo identity used by dev preview mode. Matches the seeded ADMIN
 * user in adminService so role-change protections line up.
 */
const PREVIEW_USER = {
  id: "preview-admin",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@marketplace.dev",
  role: USER_ROLES.ADMIN,
  createdAt: "2026-01-05T09:00:00.000Z",
};

/**
 * Sign in a demo session for dev preview mode. Stored in
 * sessionStorage (tab-scoped, never persists across tabs/restarts)
 * so the real sign-in / create-account entry points stay visible.
 * No token is stored, so refreshSession short-circuits and the page
 * never calls the backend. Dispatches "auth:changed" so the navbar
 * re-renders.
 */
export function signInPreview(role = USER_ROLES.ADMIN) {
  sessionStore.set(STORAGE_KEYS.user, {
    ...PREVIEW_USER,
    role: normalizeRole(role),
    preview: true,
  });
  window.dispatchEvent(new CustomEvent("auth:changed"));
}

/** True when the active session is the dev preview demo account. */
export function isPreviewSession() {
  return Boolean(getCurrentUser()?.preview);
}

/**
 * Revalidate the stored session against Supabase Auth and refresh the
 * cached user (so role/name changes from the server are picked up).
 * Expired access tokens are refreshed from the stored refresh token
 * when possible. Clears the session when the token is rejected (401)
 * so route guards always reflect server truth; network failures keep
 * the local session. Dispatches "auth:changed" for the navbar to
 * re-render. Resolves to the current user (or null after a 401).
 */
export async function refreshSession() {
  let token = storage.get(STORAGE_KEYS.token);
  const refreshToken = storage.get(STORAGE_KEYS.refreshToken);

  if (!token && refreshToken) {
    try {
      const body = await supabaseAuth.refreshSession(refreshToken);
      token = body.access_token ?? null;
      if (token) {
        storage.set(STORAGE_KEYS.token, token);
        if (body.refresh_token) {
          storage.set(STORAGE_KEYS.refreshToken, body.refresh_token);
        }
      }
    } catch {
      // Token refresh failed; fall through to getUser / logout below.
    }
  }

  if (!token) {
    return getCurrentUser();
  }

  try {
    const authUser = await supabaseAuth.getUser(token);
    const profile = await fetchProfile(authUser?.id, token);
    const user = userFromAuth(authUser, profile);
    storage.set(STORAGE_KEYS.user, {
      ...user,
      role: normalizeRole(user?.role),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      logout();
    }
  }
  window.dispatchEvent(new CustomEvent("auth:changed"));
  return getCurrentUser();
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

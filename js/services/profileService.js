/* ============================================================
   PROFILE SERVICE - TEMPORARY LOCAL PROFILE STORE
   ============================================================
   Powers the profile page: personal details and password change.
   The profile is seeded from the signed-in session user on first
   use and stored locally. Phase 10+ swaps the internals with the
   backend user API while keeping the same surface.

   Backend contract (planned - the /users/me endpoints are not in
   the backend yet, so this service stays local until they land):
   - GET  /api/v1/users/me
     RESPONSE: ApiResponse<UserResponse>
   - PUT  /api/v1/users/me
     REQUEST:  { firstName, lastName, email }
     RESPONSE: ApiResponse<UserResponse>
   - PUT  /api/v1/users/me/password
     REQUEST:  { currentPassword, newPassword }
     RESPONSE: ApiResponse<Void>

   UserResponse: { id, firstName, lastName, email, role }

   LOCAL FALLBACK NOTES:
   - While the backend endpoint is missing, the current-password
     check runs against the locally stored profile. A demo profile
     is seeded with password "password123" so the flow can be tested
     end to end (same convention as the seeded seller/admin stores).
   - Saving profile details also updates the stored session user so
     the navbar name / avatar reflect the change on next load.
   ============================================================ */

import { storage } from "../utils/storage.js";
import { STORAGE_KEYS } from "../config.js";
import { getCurrentUser } from "./authService.js";

/** Demo password for the local fallback (see header comment). */
const DEMO_PASSWORD = "password123";

/** Build the seeded profile from the signed-in session user. */
function seedProfile() {
  const user = getCurrentUser() || {};
  return {
    id: user.id ?? null,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || "",
    role: user.role || null,
    password: DEMO_PASSWORD,
    createdAt: new Date().toISOString(),
  };
}

/** Stored profile, seeding it from the session user on first use. */
function getStored() {
  const stored = storage.get(STORAGE_KEYS.profile);
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    return stored;
  }
  const profile = seedProfile();
  storage.set(STORAGE_KEYS.profile, profile);
  return profile;
}

/** Persist a profile and return it. */
function save(profile) {
  storage.set(STORAGE_KEYS.profile, profile);
  return profile;
}

/** Keep the signed-in session user in sync with profile changes. */
function syncSessionUser(profile) {
  const user = getCurrentUser();
  if (!user) return;
  storage.set(STORAGE_KEYS.user, {
    ...user,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
  });
}

/** Current profile (seeded from the session user on first use). */
export function getProfile() {
  return getStored();
}

/** Update personal details and sync the stored session user. */
export function updateProfile(fields = {}) {
  const profile = getStored();
  const updated = save({
    ...profile,
    firstName: fields.firstName ?? profile.firstName,
    lastName: fields.lastName ?? profile.lastName,
    email: fields.email ?? profile.email,
  });
  syncSessionUser(updated);
  return updated;
}

/**
 * Change the account password. Throws an Error with a user-facing
 * message when the current password is wrong. Resolves to the
 * updated profile.
 */
export function changePassword({ currentPassword, newPassword } = {}) {
  const profile = getStored();
  if (String(currentPassword ?? "") !== profile.password) {
    throw new Error("Your current password is incorrect.");
  }
  return save({ ...profile, password: String(newPassword ?? "") });
}

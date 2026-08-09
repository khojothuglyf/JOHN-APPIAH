/* ============================================================
   PROFILE PAGE SCRIPT
   Requires a signed-in session. Renders the account summary and
   lets the user edit personal details or change their password
   through the local profile store (Phase 10).
   ============================================================ */

import { $, pageUrl, redirect } from "../utils/dom.js";
import { validators, validate } from "../utils/validators.js";
import {
  readFormData,
  clearFieldErrors,
  showFieldErrors,
  setSubmitState,
  initPasswordToggles,
} from "../utils/form.js";
import {
  isAuthenticated,
  getDisplayName,
} from "../services/authService.js";
import {
  getProfile,
  updateProfile,
  changePassword,
} from "../services/profileService.js";
import { showToast } from "../components/toast.js";

const ROLE_LABELS = {
  BUYER: "Buyer",
  SELLER: "Seller",
  ADMIN: "Administrator",
};

const ROLE_BADGES = {
  BUYER: "badge--info",
  SELLER: "badge--warning",
  ADMIN: "badge--danger",
};

const page = {
  profileForm: null,
  passwordForm: null,
};

document.addEventListener("DOMContentLoaded", () => {
  if (!isAuthenticated()) {
    redirect("pages/login.html", { redirect: "pages/profile.html" });
    return;
  }

  page.profileForm = $("#profile-form");
  page.passwordForm = $("#password-form");
  if (!page.profileForm) return;

  const profile = getProfile();
  fillProfileForm(profile);
  renderHeader(profile);

  initPasswordToggles(page.profileForm);
  initPasswordToggles(page.passwordForm);

  bindEvents();
});

function bindEvents() {
  page.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFieldErrors(page.profileForm);

    const values = readFormData(page.profileForm);
    const errors = validate(values, {
      firstName: [validators.required, validators.minLength(2)],
      lastName: [validators.required, validators.minLength(2)],
      email: [validators.required, validators.email],
    });

    if (Object.keys(errors).length) {
      showFieldErrors(page.profileForm, errors);
      return;
    }

    setSubmitState(page.profileForm, true);
    try {
      const updated = updateProfile({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
      });
      renderHeader(updated);
      showToast({
        title: "Profile updated",
        message: "Your details have been saved.",
        type: "success",
      });
    } catch (error) {
      showToast({
        title: "Couldn't save changes",
        message: error.message || "Please try again.",
        type: "error",
      });
    } finally {
      setSubmitState(page.profileForm, false);
    }
  });

  page.passwordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFieldErrors(page.passwordForm);

    const values = readFormData(page.passwordForm);
    const errors = validate(values, {
      currentPassword: [validators.required],
      newPassword: [validators.required, validators.password],
      confirmPassword: [
        validators.required,
        validators.match("newPassword", "new password"),
      ],
    });

    if (Object.keys(errors).length) {
      showFieldErrors(page.passwordForm, errors);
      return;
    }

    setSubmitState(page.passwordForm, true);
    try {
      changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      page.passwordForm.reset();
      showToast({
        title: "Password updated",
        message: "Use your new password next time you sign in.",
        type: "success",
      });
    } catch (error) {
      showToast({
        title: "Couldn't update password",
        message: error.message || "Please try again.",
        type: "error",
      });
    } finally {
      setSubmitState(page.passwordForm, false);
    }
  });
}

function fillProfileForm(profile) {
  $("[name='firstName']", page.profileForm).value = profile.firstName || "";
  $("[name='lastName']", page.profileForm).value = profile.lastName || "";
  $("[name='email']", page.profileForm).value = profile.email || "";
}

function renderHeader(profile) {
  const first = profile.firstName?.[0] ?? "";
  const last = profile.lastName?.[0] ?? "";
  $("[data-profile-avatar]").textContent =
    (first + last).toUpperCase() || "–";

  $("[data-profile-name]").textContent =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
    getDisplayName() ||
    profile.email ||
    "Your account";

  $("[data-profile-email]").textContent = profile.email || "";

  const role = profile.role || "";
  const badge = $("[data-profile-role]");
  if (badge) {
    badge.className = `badge ${ROLE_BADGES[role] || "badge--primary"} profile-header__role`;
    badge.textContent = ROLE_LABELS[role] || role || "Buyer";
  }
}

/* ============================================================
   FORM UTILITY
   Shared helpers for validation display, submit loading state
   and alert banners - used by every page form (auth, contact,
   checkout, dashboards, ...).
   ============================================================ */

import { $$ } from "./dom.js";

/** Read all named fields of a form as a plain object. */
export function readFormData(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = value;
  });
  return data;
}

/** Show (or clear) a single field error inside its .form-group. */
export function showFieldError(group, message) {
  const errorEl = group.querySelector(".form-error");
  if (errorEl) errorEl.textContent = message || "";
  group.classList.toggle("form-group--invalid", Boolean(message));
}

/** Remove all field error states from a form. */
export function clearFieldErrors(form) {
  $$(".form-group--invalid", form).forEach((group) => {
    showFieldError(group, "");
  });
}

/** Apply a validation result object { fieldName: message }. */
export function showFieldErrors(form, errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const group = form.querySelector(`[data-field="${field}"]`);
    if (group) showFieldError(group, message);
  });

  const firstInvalid = form.querySelector(
    ".form-group--invalid input, .form-group--invalid select, .form-group--invalid textarea"
  );
  firstInvalid?.focus();
}

/** Toggle the submit button loading state (spinner + disabled). */
export function setSubmitState(form, loading) {
  const button = form.querySelector("[data-submit]");
  if (!button) return;
  button.disabled = loading;
  button.classList.toggle("btn--loading", loading);

  const spinner = form.querySelector("[data-submit-spinner]");
  if (spinner) spinner.hidden = !loading;
}

/** Hide the auth card alert banner. */
export function clearAlert(form) {
  const alert = form.closest(".auth-card")?.querySelector("[data-alert]");
  if (alert) alert.hidden = true;
}

/** Show the auth card alert banner with a message. */
export function showAlert(form, message, title = "") {
  const alert = form.closest(".auth-card")?.querySelector("[data-alert]");
  if (!alert) return;

  const titleEl = alert.querySelector("[data-alert-title]");
  if (titleEl) titleEl.textContent = title;

  const messageEl = alert.querySelector("[data-alert-message]");
  if (messageEl) messageEl.textContent = message;

  alert.hidden = false;
}

/** Wire up show/hide toggles for password inputs. */
export function initPasswordToggles(form) {
  form.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button
        .closest(".password-field")
        ?.querySelector("[data-password-input]");
      if (!input) return;

      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      button.setAttribute("aria-pressed", String(show));

      const openIcon = button.querySelector("[data-eye-open]");
      const closedIcon = button.querySelector("[data-eye-closed]");
      if (openIcon) openIcon.hidden = !show;
      if (closedIcon) closedIcon.hidden = show;
    });
  });
}

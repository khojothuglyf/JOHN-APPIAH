/* ============================================================
   FORGOT PASSWORD PAGE SCRIPT
   Requests a reset link for the submitted email and swaps the
   form for a success state on success.
   ============================================================ */

import { $, escapeHtml } from "../utils/dom.js";
import { validators, validate } from "../utils/validators.js";
import {
  readFormData,
  clearFieldErrors,
  showFieldErrors,
  setSubmitState,
  clearAlert,
  showAlert,
} from "../utils/form.js";
import { forgotPassword } from "../services/authService.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#forgot-form");
  if (!form) return;

  const successSection = $("[data-success]");
  const emailInput = $("#forgot-email");
  const successMessage = $("[data-success-message]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    clearAlert(form);

    const values = readFormData(form);
    const errors = validate(values, {
      email: [validators.required, validators.email],
    });

    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }

    const email = values.email.trim();
    setSubmitState(form, true);
    try {
      await forgotPassword(email);

      form.hidden = true;
      document.querySelectorAll("[data-form-footer]").forEach((node) => {
        node.hidden = true;
      });
      if (successMessage) {
        successMessage.innerHTML = `We've sent a password reset link to <strong>${escapeHtml(email)}</strong>. Check your inbox and spam folder.`;
      }
      if (successSection) successSection.hidden = false;
      emailInput?.focus();
    } catch (error) {
      setSubmitState(form, false);
      showAlert(form, error.message, "Could not send reset link");
    }
  });
});

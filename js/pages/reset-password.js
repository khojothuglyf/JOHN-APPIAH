/* ============================================================
   RESET PASSWORD PAGE SCRIPT
   UI-only until the backend exposes POST /auth/reset-password:
   validates the new password + confirmation client-side and swaps
   the form for a success state. Wire submitPasswordReset(...)
   (authService) here when the endpoint lands.
   ============================================================ */

import { $ } from "../utils/dom.js";
import { validators, validate } from "../utils/validators.js";
import {
  readFormData,
  clearFieldErrors,
  showFieldErrors,
  initPasswordToggles,
} from "../utils/form.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#reset-form");
  if (!form) return;

  const successSection = $("[data-success]");
  initPasswordToggles(form);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFieldErrors(form);

    const values = readFormData(form);
    const errors = validate(values, {
      password: [validators.required, validators.password],
      confirmPassword: [
        validators.required,
        validators.match("password", "password"),
      ],
    });

    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }

    // TODO: call authService.submitPasswordReset(values) once the
    // backend exposes POST /auth/reset-password. For now this is UI only.
    form.hidden = true;
    document.querySelectorAll("[data-form-footer]").forEach((node) => {
      node.hidden = true;
    });
    successSection.hidden = false;
  });
});

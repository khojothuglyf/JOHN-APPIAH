/* ============================================================
   REGISTER PAGE SCRIPT
   Validates the form, calls authService.register and sends the
   new user to their role's landing page. Already-authenticated
   visitors are sent home.
   ============================================================ */

import { $, pageUrl } from "../utils/dom.js";
import { validators, validate } from "../utils/validators.js";
import {
  readFormData,
  clearFieldErrors,
  showFieldErrors,
  setSubmitState,
  initPasswordToggles,
  clearAlert,
  showAlert,
} from "../utils/form.js";
import {
  register,
  setSession,
  isAuthenticated,
} from "../services/authService.js";
import { USER_ROLES } from "../config.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#register-form");
  if (!form) return;

  if (isAuthenticated()) {
    window.location.assign(pageUrl("index.html"));
    return;
  }

  initPasswordToggles(form);

  const rules = {
    firstName: [validators.required, validators.minLength(2)],
    lastName: [validators.required, validators.minLength(2)],
    email: [validators.required, validators.email],
    password: [validators.required, validators.password],
    confirmPassword: [
      validators.required,
      validators.match("password", "password"),
    ],
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    clearAlert(form);

    const values = readFormData(form);
    const errors = validate(values, rules);

    if (!form.elements.terms.checked) {
      errors.terms = "You must accept the Terms of Service to continue.";
    }

    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }

    setSubmitState(form, true);
    try {
      const { token, user } = await register({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        password: values.password,
        roleName: values.role || USER_ROLES.CUSTOMER,
      });
      setSession({ token, user });

      const target =
        user.role === USER_ROLES.SELLER
          ? pageUrl("pages/seller-dashboard.html")
          : pageUrl("index.html");
      window.location.assign(target);
    } catch (error) {
      setSubmitState(form, false);
      showAlert(form, error.message, "Registration failed");
    }
  });
});

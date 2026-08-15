/* ============================================================
   LOGIN PAGE SCRIPT
   Validates the form, calls authService.login and redirects to
   the intended page (or the role's dashboard). Already-authenticated
   visitors are sent to their own role's dashboard.
   ============================================================ */

import { $, getQueryParam, pageUrl } from "../utils/dom.js";
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
  login,
  setSession,
  isAuthenticated,
  getRole,
  getRoleLandingPath,
} from "../services/authService.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#login-form");
  if (!form) return;

  if (isAuthenticated()) {
    window.location.assign(pageUrl(getRoleLandingPath(getRole())));
    return;
  }

  initPasswordToggles(form);

  const rules = {
    email: [validators.required, validators.email],
    password: [validators.required],
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    clearAlert(form);

    const values = readFormData(form);
    const errors = validate(values, rules);

    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }

    setSubmitState(form, true);
    try {
      const { token, user } = await login({
        email: values.email.trim(),
        password: values.password,
      });
      setSession({ token, user });

      const redirectTo = getQueryParam("redirect");
      const safeRedirect =
        redirectTo &&
        !redirectTo.startsWith("//") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(redirectTo);
      const target = safeRedirect
        ? redirectTo.startsWith("/")
          ? redirectTo
          : pageUrl(redirectTo)
        : pageUrl(getRoleLandingPath(getRole()));
      window.location.assign(target);
    } catch (error) {
      setSubmitState(form, false);
      showAlert(form, error.message, "Sign in failed");
    }
  });
});

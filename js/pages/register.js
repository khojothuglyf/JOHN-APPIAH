/* ============================================================
   REGISTER PAGE SCRIPT
   Validates the form, calls authService.register and sends the
   new user to their role's landing page. Already-authenticated
   visitors are sent home. Users pick an account type (Buyer by
   default or Seller); no Admin signup option exists.
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

  // Preselect the account type when arriving from the login page's
  // "Create a Buyer/Seller account" links (?accountType=buyer|seller).
  // The selector stays visible and editable; only a literal "seller"
  // switches away from the Buyer default, so a tampered value (e.g.
  // "admin") can never preselect anything else.
  if (getQueryParam("accountType") === "seller") {
    const sellerRadio = form.querySelector(
      'input[name="accountType"][value="seller"]'
    );
    if (sellerRadio) sellerRadio.checked = true;
  }

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
      // Account type: Buyer (default) or Seller. Anything else - including
      // a tampered "admin" value - is coerced to Buyer here and again in
      // authService and the Supabase trigger.
      const requestedRole = ["buyer", "seller"].includes(values.accountType)
        ? values.accountType
        : "buyer";

      const { token, user } = await register({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        password: values.password,
        requestedRole,
      });

      if (!token) {
        // Supabase email confirmation is enabled: tell the user to
        // verify before they can sign in.
        setSubmitState(form, false);
        showAlert(
          form,
          "We've sent a confirmation link to your email. Click it to activate your account, then sign in.",
          "Check your inbox"
        );
        return;
      }

      setSession({ token, user });

      const target =
        user?.role === USER_ROLES.SELLER
          ? pageUrl("pages/seller-dashboard.html")
          : pageUrl("index.html");
      window.location.assign(target);
    } catch (error) {
      setSubmitState(form, false);
      showAlert(form, error.message, "Registration failed");
    }
  });
});

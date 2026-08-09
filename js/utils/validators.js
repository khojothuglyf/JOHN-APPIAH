/* ============================================================
   VALIDATORS
   Client-side validation rules + form runner.
   ============================================================ */

/** Individual validation rules. Each returns an error string or "". */
export const validators = {
  required: (value) => (String(value ?? "").trim() ? "" : "This field is required."),

  email: (value) => {
    const clean = String(value ?? "").trim();
    if (!clean) return "";
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(clean) ? "" : "Enter a valid email address.";
  },

  password: (value) => {
    const clean = String(value ?? "");
    if (!clean) return "";
    if (clean.length < 8) return "Password must be at least 8 characters.";
    return /[A-Za-z]/.test(clean) && /\d/.test(clean)
      ? ""
      : "Password must contain letters and numbers.";
  },

  minLength: (min) => (value) => {
    const length = String(value ?? "").length;
    return length >= min ? "" : `Must be at least ${min} characters.`;
  },

  maxLength: (max) => (value) => {
    const length = String(value ?? "").length;
    return length <= max ? "" : `Must be at most ${max} characters.`;
  },

  numeric: (value) => {
    const clean = String(value ?? "").trim();
    if (!clean) return "";
    return Number.isFinite(Number(clean)) ? "" : "Enter a valid number.";
  },

  positive: (value) => {
    const clean = String(value ?? "").trim();
    if (!clean) return "";
    return Number(clean) > 0 ? "" : "Value must be greater than zero.";
  },

  match: (otherField, otherLabel = "confirmation") => (value, values) =>
    value === values[otherField] ? "" : `Does not match ${otherLabel}.`,
};

/**
 * Validate a set of { fieldName: value } against a rules map:
 *   rules = { email: [validators.required, validators.email] }
 * Returns { fieldName: errorMessage }.
 */
export function validate(values, rules) {
  const errors = {};

  for (const [field, fieldRules] of Object.entries(rules)) {
    for (const rule of fieldRules) {
      const message = rule(values[field], values);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }

  return errors;
}

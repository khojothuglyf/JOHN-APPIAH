/* ============================================================
   FORMAT UTILITY
   Display helpers for currency, dates, text.
   ============================================================ */

import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from "../config.js";

/** Format a number as a currency string. */
export function formatCurrency(
  amount,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Number(amount) || 0);
}

/** Format a date (ISO string or timestamp) for display. */
export function formatDate(value, locale = DEFAULT_LOCALE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Truncate a string to a max length with an ellipsis. */
export function truncate(text, max = 120) {
  const clean = String(text ?? "").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}...` : clean;
}

/** Build a URL-safe slug from a string. */
export function slugify(text) {
  return String(text ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Calculate the discount percentage between old and new price. */
export function discountPercent(price, oldPrice) {
  const current = Number(price);
  const previous = Number(oldPrice);
  if (!current || !previous || previous <= current) return 0;
  return Math.round(((previous - current) / previous) * 100);
}

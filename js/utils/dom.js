/* ============================================================
   DOM UTILITY
   Small, dependency-free DOM helpers.
   ============================================================ */

/** Query a single element. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** Query all matching elements as a real array. */
export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];

/** Create a DOM node from an HTML string. */
export function createElement(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/** Escape a string for safe interpolation into HTML. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Debounce a function (e.g. for live search). */
export function debounce(fn, wait = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Throttle a function to at most one call per animation frame
 * (e.g. scroll/resize handlers that touch the DOM).
 */
export function rAFThrottle(fn) {
  let scheduled = false;
  return function (...args) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn.apply(this, args);
    });
  };
}

/** Read a query parameter from the current URL. */
export function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/**
 * How many directory levels deep the current page sits relative to the
 * served root. index.html -> 0, pages/login.html -> 1.
 */
export function currentPageDepth() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return Math.max(0, segments.length - 1);
}

/**
 * Resolve a site-relative path (e.g. "pages/products.html") correctly
 * from any page, including pages nested one directory deep.
 */
export function pageUrl(path) {
  const depth = currentPageDepth();
  return (depth ? "../".repeat(depth) : "") + path;
}

/**
 * Rewrite relative hrefs/srcs inside injected partial content so they
 * resolve from the hosting page. Absolute (/...), protocol-relative and
 * already-prefixed (../) references are left untouched.
 */
export function rewriteRelativeUrls(root) {
  const depth = currentPageDepth();
  if (depth === 0) return;
  const prefix = "../".repeat(depth);

  ["href", "src"].forEach((attr) => {
    root.querySelectorAll(`[${attr}]`).forEach((node) => {
      const value = node.getAttribute(attr);
      if (!value) return;
      if (/^(https?:|mailto:|tel:|#|\/|\.\.\/)/.test(value)) return;
      node.setAttribute(attr, prefix + value);
    });
  });
}

/** Navigate to a site-relative page preserving a query string. */
export function redirect(path, params = {}) {
  const search = new URLSearchParams(params).toString();
  window.location.assign(pageUrl(path) + (search ? `?${search}` : ""));
}

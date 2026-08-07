/* ============================================================
   NAVBAR COMPONENT
   Loads components/navbar.html and wires up:
   - mobile drawer (open/close, escape key)
   - search form submission
   - role-aware account menu (CUSTOMER / SELLER / ADMIN)
   - live cart + wishlist badges
   - sticky shadow + active link highlighting
   ============================================================ */

import { $, $$, escapeHtml, pageUrl, rAFThrottle, rewriteRelativeUrls } from "../utils/dom.js";
import { storage } from "../utils/storage.js";
import { STORAGE_KEYS, USER_ROLES } from "../config.js";
import {
  getCurrentUser,
  getRole,
  getDisplayName,
  getInitials,
  isAuthenticated,
  logout,
} from "../services/authService.js";
import { getCartItemCount } from "../services/cartService.js";
import { getWishlistCount } from "../services/wishlistService.js";

const PARTIAL_URL = "components/navbar.html";

const SVG_ICONS = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  package:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  layout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
  logout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
};

/** Role -> dashboard destination. */
const ROLE_DASHBOARD = {
  [USER_ROLES.ADMIN]: "pages/admin-dashboard.html",
  [USER_ROLES.SELLER]: "pages/seller-dashboard.html",
};

export async function mountNavbar(root) {
  try {
    const response = await fetch(pageUrl(PARTIAL_URL));
    if (!response.ok) {
      throw new Error(`Failed to load navbar (${response.status})`);
    }
    root.innerHTML = await response.text();
    rewriteRelativeUrls(root);
  } catch (error) {
    console.error(error);
    root.innerHTML =
      '<a class="navbar-fallback" href="index.html">Marketplace</a>';
    return;
  }

  initNavbar(root);
  markActiveLinks(root);
  updateBadges(root);

  window.addEventListener("cart:update", () => updateBadges(root));
  window.addEventListener("wishlist:update", () => updateBadges(root));
}

function initNavbar(root) {
  const header = root.querySelector("#site-header");

  // Sticky shadow (throttled to one callback per frame)
  window.addEventListener(
    "scroll",
    rAFThrottle(() => {
      header?.classList.toggle("site-header--scrolled", window.scrollY > 4);
    }),
    { passive: true }
  );

  // Search
  const form = root.querySelector("[data-search-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("[data-search-input]", form)?.value.trim() || "";
    const category = $("[data-search-category]", form)?.value || "";
    const params = new URLSearchParams();
    if (query) params.set("keyword", query);
    if (category) params.set("category", category);
    window.location.assign(
      pageUrl("pages/products.html") + (params.toString() ? `?${params}` : "")
    );
  });

  // Account menu
  renderAuthMenu(root);

  // Drawer (mobile navigation)
  initDrawer(root);
}

function renderAuthMenu(root) {
  const container = root.querySelector("[data-navbar-auth]");
  if (!container) return;

  if (isAuthenticated()) {
    const role = getRole();
    const dashboardUrl = ROLE_DASHBOARD[role];

    container.innerHTML = `
      <div class="dropdown" data-nav-auth-dropdown>
        <button class="icon-button" type="button" data-auth-trigger
          aria-haspopup="menu" aria-expanded="false" aria-label="Account menu"
          title="${escapeHtml(getDisplayName())}">
          ${SVG_ICONS.user}
        </button>
        <div class="dropdown__menu" role="menu">
          <div class="dropdown__header">
            <span class="dropdown__header-name">${escapeHtml(getDisplayName())}</span>
            <span class="dropdown__header-role">${escapeHtml(role.toLowerCase())}</span>
          </div>
          <a class="dropdown__item" href="pages/profile.html">${SVG_ICONS.user}My Profile</a>
          <a class="dropdown__item" href="pages/orders.html">${SVG_ICONS.file}My Orders</a>
          ${dashboardUrl ? `<a class="dropdown__item" href="${dashboardUrl}">${SVG_ICONS.layout}Dashboard</a>` : ""}
          <div class="dropdown__divider"></div>
          <button class="dropdown__item dropdown__item--danger" type="button" data-logout>
            ${SVG_ICONS.logout}Sign Out
          </button>
        </div>
      </div>
    `;

    const dropdown = container.querySelector("[data-nav-auth-dropdown]");
    const trigger = container.querySelector("[data-auth-trigger]");

    const openDropdown = (open) => {
      dropdown?.classList.toggle("dropdown--open", open);
      trigger?.setAttribute("aria-expanded", String(open));
    };

    trigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      openDropdown(!dropdown?.classList.contains("dropdown--open"));
    });

    document.addEventListener("click", (event) => {
      if (!dropdown?.contains(event.target)) openDropdown(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") openDropdown(false);
    });

    container.querySelector("[data-logout]")?.addEventListener("click", () => {
      logout();
      storage.remove(STORAGE_KEYS.cart);
      storage.remove(STORAGE_KEYS.wishlist);
      window.location.assign(pageUrl("index.html"));
    });
  } else {
    container.innerHTML = `
      <div class="navbar-auth u-flex u-items-center u-gap-2">
        <a class="btn btn--ghost btn--sm" href="pages/login.html">Sign In</a>
        <a class="btn btn--primary btn--sm" href="pages/register.html">Create Account</a>
      </div>
    `;
  }
}

function initDrawer(root) {
  const drawer = root.querySelector("[data-drawer]");
  const toggle = root.querySelector("[data-navbar-toggle]");

  const open = () => {
    drawer?.classList.add("drawer--open");
    drawer?.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    drawer?.classList.remove("drawer--open");
    drawer?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  toggle?.addEventListener("click", open);
  root.querySelectorAll("[data-drawer-close]").forEach((node) => {
    node.addEventListener("click", close);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function markActiveLinks(root) {
  const current = window.location.pathname.split("/").pop() || "index.html";

  root.querySelectorAll("a[data-nav-link]").forEach((link) => {
    const linkFile = link
      .getAttribute("href")
      .split("/")
      .pop()
      .split("?")[0];
    if (linkFile === current) {
      link.classList.add("is-active");
    }
  });
}

function flashBadge(badge) {
  if (!badge || badge.hidden) return;
  badge.classList.remove("is-pop");
  void badge.offsetWidth;
  badge.classList.add("is-pop");
}

function updateBadges(root) {
  const cartBadge = root.querySelector("[data-cart-count]");
  const cartCount = getCartItemCount();
  if (cartBadge) {
    cartBadge.textContent = cartCount > 99 ? "99+" : String(cartCount);
    cartBadge.hidden = cartCount === 0;
    flashBadge(cartBadge);
  }

  const wishlistBadge = root.querySelector("[data-wishlist-count]");
  const wishlistCount = getWishlistCount();
  if (wishlistBadge) {
    wishlistBadge.textContent = String(wishlistCount);
    wishlistBadge.hidden = wishlistCount === 0;
    flashBadge(wishlistBadge);
  }
}

# Marketplace System - Frontend

A professional, responsive e-commerce web application. This repository contains
**only the frontend** (HTML5, CSS3, ES6+ JavaScript). The backend is a separate
Spring Boot (Java) REST API service.

> **Current status:** Phases 1-13 (foundation, authentication, live homepage,
> product pages, shopping cart, wishlist, checkout + orders, seller dashboard,
> admin dashboard, user profile, animations & polish, performance optimisation,
> testing & QA) are complete. Business features are added
> phase by phase. See [Roadmap](#roadmap).

---

## Quick Start

This project uses **ES6 modules** (`import` / `export`), so it must be served
over HTTP - it will not work by double-clicking `index.html`.

**Recommended (VS Code):**

1. Install the **Live Server** extension (Ritwick Dey).
2. Right-click `index.html` in the project root and choose **Open with Live Server**.
3. The app opens at `http://127.0.0.1:5500`.

Any static server works too:

```bash
# Python
python -m http.server 5500
```

---

## Project Structure

```
marketplace-system-frontend
│
├── assets/                  # Shared static assets (fonts, etc.)
├── components/              # Reusable HTML partials (fetched by JS)
│   ├── navbar.html          # Site header (top bar, search, categories, drawer)
│   └── footer.html          # Site footer
├── css/
│   ├── main.css             # Entry point - imports everything below
│   ├── base/                # Design tokens, reset, typography, globals
│   ├── layout/              # Container, grid, navbar, footer
│   ├── components/          # Buttons, cards, forms, modal, toast, ... 
│   ├── pages/               # Page-specific styles (home, shared shell)
│   └── utilities/           # Single-purpose helper classes
├── images/                  # SVG logo, favicon, placeholders
├── js/
│   ├── app.js               # Entry: mounts shared components on every page
│   ├── config.js            # API base URL, endpoint registry, keys, roles
│   ├── components/          # JS behaviour for navbar, footer, loader
│   ├── pages/               # Per-page scripts (home, ...)
│   ├── services/            # Feature services (auth, cart, wishlist, ...)
│   └── utils/               # http, storage, dom, format, validators
├── pages/                   # HTML pages (one per route)
│   ├── login.html ... 404.html
├── index.html               # Homepage (foundation shell)
└── README.md
```

---

## How Pages Work

Every page includes two placeholders that are filled at runtime:

```html
<div data-component="navbar"></div>
<main> ...page content... </main>
<div data-component="footer"></div>

<script type="module" src="../js/app.js"></script>
<script type="module" src="../js/pages/<page>.js"></script>
```

`js/app.js` calls the component loader, which fetches the HTML partial from
`components/` and initialises its behaviour (search, role-aware account menu,
cart/wishlist badges, mobile drawer). Page-specific logic lives in
`js/pages/<page>.js`.

### Adding a new page

1. Create `pages/<name>.html` using the shared skeleton above.
2. Add `<script type="module" src="../js/pages/<name>.js">` for page logic.
3. Add any page-specific styles to `css/pages/<name>.css` and link them in the
   `<head>` (shared styles are already loaded via `css/main.css`).

---

## Design System

Design tokens are defined once in `css/base/variables.css` and referenced
everywhere else - **never hardcode values in component CSS**.

- **Colors:** primary (indigo-blue), accent (amber), neutral gray scale,
  semantic success/warning/danger/info with soft backgrounds.
- **Type:** Inter font stack, 400-800 weights, fluid heading scale.
- **Spacing:** 4px-based scale (`--space-1` .. `--space-10`).
- **Radius:** 6 / 10 / 16 / full pill.
- **Shadows:** sm / md / lg.
- **Motion:** 150ms / 250ms ease; reduced-motion is respected.

### Common classes

| Area | Classes |
| ---- | ------- |
| Layout | `.container`, `.grid`, `.grid--fill`, `.grid--2/3/4` |
| Buttons | `.btn`, `.btn--primary/accent/outline/ghost/danger/...`, `.btn--sm/lg/block` |
| Cards | `.card`, `.card--hover`, `.product-card`, `.category-card` |
| Forms | `.form-group`, `.form-label`, `.form-input`, `.form-select`, `.form-textarea`, `.form-error` |
| Feedback | `.alert`, `.toast`, `.skeleton`, `.spinner`, `.modal` |
| Navigation | `.navbar-*`, `.drawer`, `.dropdown`, `.breadcrumb`, `.pagination` |
| Utilities | `.u-flex`, `.u-items-center`, `.u-gap-*`, `.u-text-muted`, `.u-hide-mobile` |

---

## JavaScript Architecture

- **ES6 modules**, no global scope pollution. Requires Live Server (see Quick Start).
- `js/config.js` is the **single source of truth** for API paths, storage keys
  and user roles.
- `js/utils/http.js` is the only place that talks to `fetch`. It handles JSON,
  auth tokens (`Authorization: Bearer`), query params, timeouts and normalised
  errors (`ApiError`).
- Feature logic lives in `js/services/` so UI code stays clean and backend
  calls can be swapped without touching markup.
- State that needs to survive reloads uses `localStorage`; transient UI state
  uses `sessionStorage` (see `js/utils/storage.js`).

### Temporary services

The backend is not deployed yet, so some services hold local fallbacks:

| Service | Purpose | Replaced in |
| ------- | ------- | ----------- |
| `services/cartService.js` | Local cart (navbar badge + cart page) | When the backend is deployed |
| `services/wishlistService.js` | Local wishlist (badge, toggle buttons, wishlist page) | When the backend is deployed |
| `services/ordersService.js` | Local orders (checkout + My Orders) | When the backend is deployed |
| `services/sellerService.js` | Local seller catalogue + fulfilment (seller dashboard) | When the backend is deployed |
| `services/adminService.js` | Local users, categories, moderation (admin dashboard) | When the backend is deployed |
| `services/profileService.js` | Local profile details + password change (user profile) | When the backend is deployed |

`services/authService.js` is already wired to the backend REST API. Each
temporary service documents the exact backend contract it will switch to.
Call sites in the UI are unaffected by the swap.

---

## API Integration

### Endpoint registry

All endpoints live in one place: `API_ENDPOINTS` in `js/config.js`. UI code
never invents URLs; it references the registry. Update `API_BASE_URL` there
when the backend is deployed.

### Contract format

Every service function that talks to the backend documents its contract in a
header comment:

```
- METHOD:   GET
- ENDPOINT: /api/v1/products?page=0&size=24
- REQUEST:  { page:number, size:number, q?:string, categoryId?:number }
- RESPONSE: { content: Product[], page, size, totalElements, totalPages, last }
```

Example usage:

```js
import { http } from "./api.js";
import { API_ENDPOINTS } from "../config.js";

export async function getProducts(params) {
  return http.get(API_ENDPOINTS.products.list, { params });
}
```

Responses come back as parsed JSON. Non-2xx responses throw `ApiError` with
`status`, a human `message` (extracted from the backend error payload) and the
raw `data`.

---

## Roles

The navbar account menu and dashboard links adapt to the signed-in role:

| Role | Extra navbar actions |
| ---- | -------------------- |
| CUSTOMER | Orders, Profile, Wishlist |
| SELLER | Seller Dashboard, Orders, Profile |
| ADMIN | Admin Dashboard, Orders, Profile |

---

## Testing (Phase 13)

No build tooling or framework is required - the suites are plain Node ESM scripts.

```bash
# Reference integrity + CSS class coverage + shell structure (no deps)
npm run test:static

# Service layer smoke tests with a mocked browser/fetch environment
npm run test:services

# Everything above
npm test

# Live contract alignment against the running Spring Boot backend
# (auto-skips with "SKIPPED" if the backend is not reachable)
npm run test:live        # expects http://localhost:8080/api/v1
BASE_URL=http://localhost:8081 npm run test:live
```

What each suite guards:

- **`tests/static.test.mjs`** - every HTML href/src resolves, every JS import
  resolves, all pages render the shared navbar/footer/bootstrapping shell, and
  every CSS class used in static markup has a matching rule (220 classes).
- **`tests/services.test.mjs`** - loads the real service modules in Node and
  verifies response-envelope unwrapping (`ApiResponse { success, message, data,
  timestamp }`), field mapping (`accessToken -> token`, `categoryId ->
  category.id`, `roleName` on register), Spring paging/sort parameters, order
  and product status enums vs the backend, and the local fallbacks for cart,
  wishlist, orders, seller, admin and profile.
- **`tests/live.mjs`** - runs a full journey against a real backend: admin
  login, seller/customer registration, category + product creation, wishlist
  add/check/remove, cart add/update, checkout, seller order status update,
  seller/admin analytics, authorization guards (401/403) and notifications.

---

## Roadmap

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Project setup, CSS/JS architecture, navigation, global styles | ✅ Done |
| 2 | Authentication pages (login, register, forgot password) | ✅ Done |
| 3 | Homepage (live categories + featured products) | ✅ Done |
| 4 | Product pages (listing, details, categories) | ✅ Done |
| 5 | Shopping cart | ✅ Done |
| 6 | Wishlist | ✅ Done |
| 7 | Checkout + orders | ✅ Done |
| 8 | Seller dashboard | ✅ Done |
| 9 | Admin dashboard | ✅ Done |
| 10 | User profile | ✅ Done |
| 11 | Animations & polish | ✅ Done |
| 12 | Performance optimisation | ✅ Done |
| 13 | Testing & QA | ✅ Done |

---

## Conventions

- Semantic HTML; CSS and JS are never mixed into markup unnecessarily.
- Meaningful, consistent class names; no duplicate code.
- All forms validate client-side with `js/utils/validators.js` before submitting.
- Loading states use skeletons/spinners; failures surface through alerts/toasts.

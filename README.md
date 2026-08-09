# Marketplace System - Frontend

A professional, responsive e-commerce web application. This repository contains
**only the frontend** (HTML5, CSS3, ES6+ JavaScript). The storefront data
(auth, catalog, cart, wishlist) is backed by **Supabase** (Auth + PostgREST via
raw `fetch` - no SDK); a legacy Spring Boot (Java) REST backend is optional.

> **Current status:** Phases 1-14 (foundation, authentication, live homepage,
> product pages, shopping cart, wishlist, checkout + orders, seller dashboard,
> admin dashboard, user profile, animations & polish, performance optimisation,
> testing & QA, Amazon-style advanced search & filters + store-ready PWA) are
> complete, plus **Supabase integration** (storefront-first: auth, catalog,
> cart + wishlist synced to Supabase). Business features are added
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

> **PWA tip:** the service worker is registered from `/service-worker.js`, so
> use a stable root URL (e.g. `http://127.0.0.1:5500`) - it will not install
> correctly on a sub-path.

---

## Production build (`dist/`)

No framework - just a tiny Node script that prepares the publish directory:

```bash
npm run build
```

`scripts/build.mjs` copies the site into `dist/` (excluding `tests/`,
`scripts/`, `supabase/`, `.git`), then:

- writes `dist/js/api-config.js` from the `SUPABASE_URL` / `SUPABASE_ANON_KEY`
  environment variables (fails the build if either is missing on Netlify),
- regenerates `dist/service-worker.js` with the exact precache file list and
  the resolved API origin,
- writes `robots.txt` and `sitemap.xml`, and injects `canonical` + Open Graph
  meta into every page when `SITE_URL` is set.

---

## Deployment (Netlify)

**Prerequisites**

- A Supabase project with the schema applied (see
  [Supabase setup](#supabase-setup) below).
- CORS: in Supabase → Project Settings → API → Allowed Origins, add your
  deploy origin (e.g. `https://shop.example.com`). For local development add
  `http://127.0.0.1:5500` (and any other port your static server uses).

**Environment variables (Netlify → Site settings → Environment variables)**

| Variable | Required | Example |
| --- | --- | --- |
| `SUPABASE_URL` | yes | `https://fqvbmbnxhnnronbbpklx.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | `eyJhbGciOi...` (anon/public key) |
| `SITE_URL` | no | `https://shop.example.com` (enables SEO) |

> `API_BASE_URL` is optional (kept for the legacy REST client); when unset it
> defaults to `SUPABASE_URL`.

**Options**

1. **Git / CLI (recommended):** push the repo; Netlify auto-detects
   `netlify.toml` (`command = "npm run build"`, `publish = "dist"`), or run
   `netlify deploy --prod` locally.
2. **Manual drag & drop:** run `npm run build`, then drag the **`dist/`
   folder** into the Netlify Deploys panel.

The site ships with security headers (CSP, HSTS, X-Frame-Options, ...),
SPA/404 redirects (`_redirects`) and sensible caching set in `netlify.toml`.

---

## Supabase setup

The storefront talks to Supabase directly with raw `fetch` calls - **no SDK**.
See `supabase/schema.sql` for the full schema.

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Run the schema:** open Dashboard → SQL → New query, paste the contents of
   `supabase/schema.sql`, and run it. This creates the tables, row-level
   security policies, auth triggers and the seeded catalog. Re-running it is
   safe (guarded by `IF NOT EXISTS` / `DROP ... IF EXISTS`).
3. **Configure CORS:** Dashboard → Project Settings → API → Allowed Origins →
   add `http://127.0.0.1:5500` (local dev) and your Netlify origin
   (e.g. `https://shop.example.com`).
4. **Copy the keys:** Dashboard → Project Settings → API. Put the **Project
   URL** in `SUPABASE_URL` and the **anon/public key** in `SUPABASE_ANON_KEY`.
   For local development, paste them into `js/api-config.js` (the committed
   copy is the local fallback; Netlify overrides it at build time).
5. **Email confirmations:** if "Enable email confirmations" is on
   (Authentication → Providers → Email), new registrations land on a
   "check your inbox" state until the user confirms. The very **first**
   confirmed user is automatically promoted to **ADMIN**
   (`assign_first_user_admin` trigger).

> **Auth note:** the app reads the user role from `public.profiles`, which is
> created automatically on signup (`handle_new_user` trigger). If you create
> the first admin user before running the schema, run
> `update public.profiles set role = 'ADMIN' where id = '<uuid>'` afterwards.

---

## Progressive Web App (PWA)

The site is a fully installable PWA:

- **Installable on** Android (Chrome), iOS (Safari), Windows/macOS/Linux
  (Edge/Chrome), ChromeOS.
- `manifest.webmanifest` - name, icons, theme (`#2f6fed`) and background
  (`#f6f7fb`) colors, standalone display.
- `service-worker.js` - precaches the app shell for offline use, network-first
  navigations, cache-first static assets, and **never caches API requests or
  auth tokens**.
- `pages/offline.html` - friendly fallback when the network is gone.
- Auto-updates: the service worker checks for changes on load and on window
  focus and activates new versions immediately.
- Install prompts: Android/desktop browsers show a "Get the Marketplace app"
  banner; iOS Safari shows a one-time "Add to Home Screen" hint.

To install once deployed: use the browser's install button (address bar /
menu), or open the in-app "Install" banner. On iOS: Share → **Add to Home
Screen**.

The manifest ships with `shortcuts` (Search, Wishlist, Cart, Orders) and a
`launch_handler` so installed apps feel native on Windows/macOS/Linux.

### Publishing to app stores

The PWA is the single codebase that powers every platform - no native
rewrites:

- **Windows / macOS / Linux / ChromeOS:** the browser install button installs
  it as a real desktop app (Edge, Chrome, Brave, Arc). No store submission
  needed.
- **Play Store (Android):** wrap the PWA as a Trusted Web Activity with
  [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
  (`npx @bubblewrap/cli init`, set the package + signing key, then
  `npx @bubblewrap/cli build`), publish the generated APK/AAB with Play
  Console. `launch_handler`, `shortcuts` and maskable icons are already set.
- **App Store (iOS):** submit an iOS app wrapper (e.g. a Capacitor/Cordova
  shell or a PWA via a native bridge), or simply have users **Share → Add to
  Home Screen** - the site is already fully installable on iOS Safari.

Prerequisite for all stores: the site must be served over HTTPS (Netlify does
this automatically) with `manifest.webmanifest` reachable at the root.

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
│   └── pages/               # Page-specific styles (products, shared shell)
├── images/                  # SVG logo, favicon, placeholders
├── icons/                   # PWA app icons (192/512/maskable/apple-touch)
├── js/
│   ├── app.js               # Entry: mounts shared components on every page
│   ├── config.js            # Endpoint registry, storage keys, roles, Supabase config
│   ├── api-config.js        # Generated: Supabase URL + anon key (env-driven)
│   ├── sw-register.js       # Service worker registration (auto-updates)
│   ├── components/          # JS behaviour for navbar, footer, install prompt
│   ├── pages/               # Per-page scripts (home, ...)
│   ├── services/            # Feature services (auth, cart, wishlist, ...)
│   │   └── supabase.js      # Zero-dep Supabase client (Auth + PostgREST)
│   └── utils/               # http, storage, dom, format, validators
├── pages/                   # HTML pages (one per route)
│   ├── login.html ... 404.html, offline.html
├── scripts/                 # Build tooling (not published to Netlify)
│   ├── build.mjs            # Netlify build: env config + dist/ + SW + SEO
│   └── inject-head.mjs      # PWA / SEO <head> injector
├── index.html               # Homepage (foundation shell)
├── service-worker.js        # PWA offline + caching
├── manifest.webmanifest     # PWA manifest (install, icons, theme)
├── netlify.toml             # Netlify build + headers
├── _redirects               # SPA/404 routing rules
├── supabase/
│   └── schema.sql           # Supabase schema, RLS, triggers + seed catalog
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
- `js/config.js` is the **single source of truth** for Supabase credentials,
  the legacy endpoint registry, storage keys and user roles.
- `js/services/supabase.js` is a **zero-dependency Supabase client** (raw
  `fetch` to `/auth/v1` and `/rest/v1`) used by the wired storefront services;
  `js/utils/http.js` remains for the legacy REST client.
- Feature logic lives in `js/services/` so UI code stays clean and backend
  calls can be swapped without touching markup.
- State that needs to survive reloads uses `localStorage`; transient UI state
  uses `sessionStorage` (see `js/utils/storage.js`).

### Service wiring

| Service | Purpose | Backed by |
| ------- | ------- | --------- |
| `services/supabase.js` | Zero-dep Supabase client (Auth + PostgREST, Range paging, upserts) | Supabase |
| `services/authService.js` | Login / register / password recovery + session helpers | Supabase Auth |
| `services/productService.js` | Paged catalog, search, sort, featured, related products | PostgREST |
| `services/categoryService.js` | Category list (cached 5 min) | PostgREST |
| `services/cartService.js` | Cart: optimistic local cache, background sync, offline fallback | PostgREST |
| `services/wishlistService.js` | Wishlist: optimistic local cache, background sync, offline fallback | PostgREST |
| `services/ordersService.js` | Local orders (checkout + My Orders) | Local fallback |
| `services/sellerService.js` | Local seller catalogue + fulfilment (seller dashboard) | Local fallback |
| `services/adminService.js` | Local users, categories, moderation (admin dashboard) | Local fallback |
| `services/profileService.js` | Local profile details + password change (user profile) | Local fallback |

Orders, seller, admin and profile remain local fallbacks for now; each
documents the exact contract it will switch to. Call sites in the UI are
unaffected by the swap.

---

## Supabase Integration

### Client

All Supabase calls go through `js/services/supabase.js` - a zero-dependency
client that talks to Supabase Auth (`/auth/v1`) and PostgREST (`/rest/v1`)
with plain `fetch`:

- `supabaseAuth` - `signUp`, `signInWithPassword`, `refreshSession`,
  `getUser`, `signOut`, `recover`.
- `rest` - `list` (Range paging + `content-range` totals), `insert` (upsert
  via `on_conflict`), `update` (PATCH), `remove` (DELETE).
- Errors are normalised to `ApiError` (`status` + human `message`).

The Supabase URL and anon key come from `SUPABASE_URL` / `SUPABASE_ANON_KEY`
(reified at build time into `js/api-config.js` via `scripts/build.mjs` - see
[Deployment](#deployment-netlify)). Never hardcode them elsewhere.

### Schema

`supabase/schema.sql` creates:

- **Tables:** `profiles`, `categories`, `products`, `cart_items`,
  `wishlist_items` (with a seeded catalog - 7 categories, 6 products, one
  `INACTIVE`).
- **Auth triggers:** `handle_new_user` (auto-creates a profile on signup) and
  `assign_first_user_admin` (the first profile becomes `ADMIN`).
- **Row Level Security:** public reads for categories/products, owner-only
  access for profiles/cart/wishlist, admin-only writes for categories/products.
- **updated_at** triggers on every mutable table.

### Contracts

Wired services keep their pre-existing page-facing shapes, so the UI is
unchanged:

- `getProducts` resolves `{ content, page, size, totalElements, totalPages,
  last }` - rows are normalized (snake_case → camelCase, embedded
  `category`/`sellerName`, `old_price` → `oldPrice`).
- `getFeaturedProducts(limit)` → `{ content }`.
- `login` / `register` resolve `{ token, refreshToken, user }` where `user.role`
  comes from `public.profiles`.
- Cart / wishlist services remain **optimistic**: local cache renders first,
  background sync to Supabase adopts server-truth IDs on success and rolls
  back to the server on failure. Signed-out users work fully offline.

The legacy `API_ENDPOINTS` registry in `js/config.js` is kept for the
still-local services and validated by the test suite.

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

# Live contract alignment against a running backend
# (optional; auto-skips with "SKIPPED" if not reachable)
npm run test:live        # expects http://localhost:8080/api/v1
BASE_URL=http://localhost:8081 npm run test:live
```

`tests/live.mjs` targets a local Spring Boot backend (see the backend repo
`MarketplaceSystem`) and is optional - the storefront now talks to Supabase,
so the main suites (`npm test`) use mocked Supabase routes instead.

What each suite guards:

- **`tests/static.test.mjs`** - every HTML href/src resolves, every JS import
  resolves, all pages render the shared navbar/footer/bootstrapping shell, and
  every CSS class used in static markup has a matching rule (220 classes).
- **`tests/services.test.mjs`** - loads the real service modules in Node with
  mocked Supabase routes and verifies the Auth contract (`access_token` ->
  `token`, signup metadata without `roleName`, token-less email-confirmation
  signup, profile role), the PostgREST contract (Range paging, `content-range`
  totals, embedded `category`/`seller` names, `snake_case` -> `camelCase`
  mapping, ACTIVE-only storefront filter), the optimistic cart/wishlist
  services, and the local fallbacks for orders, seller, admin and profile.
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
| 12.5 | Backend integration: wishlist synced to live API (optimistic local cache, single-flight load, logged-out offline fallback) | ✅ Done |
| 12.6 | Backend integration: cart synced to live API (merge on POST, canonical cartItemIds from server responses, rollback on failure) | ✅ Done |
| 13 | Testing & QA | ✅ Done |
| 14 | Amazon-style advanced search & filters (price range slider, rating, availability, seller facet, discount depth, active-filter chips) + store-ready PWA manifest (shortcuts, launch handler) | ✅ Done |
| 15 | Supabase integration (storefront-first: Auth, catalog, cart + wishlist; zero-dep REST client, RLS, auto profile + first-user-admin triggers) | ✅ Done |

---

## Conventions

- Semantic HTML; CSS and JS are never mixed into markup unnecessarily.
- Meaningful, consistent class names; no duplicate code.
- All forms validate client-side with `js/utils/validators.js` before submitting.
- Loading states use skeletons/spinners; failures surface through alerts/toasts.

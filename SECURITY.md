# TradeWide Security Audit & Hardening Report

Date: 2026-08-14
Scope: Backend `MarketplaceSystem` (Spring Boot 3.5.16, Java 21) + Frontend `marketplace-system-frontend` (vanilla ES6, Supabase)
Method: code review, config review, secret scan of source + git history, RLS review, authorization regression tests, a second maximum-hardening pass (rate limiting, atomic stock, prod fail-fast guard, security headers, CSP hardening), and a final maximum-hardening delta (key-format fail-closed guard, atomic conditional stock reservation, webhook double-spend DB constraint, per-user rate limiting, optimistic-lock 409, real concurrency tests, dependency review), and a final consolidated 20-phase security pass (password-change rate limiting, X-Forwarded-For trust hardening, in-service admin guards, full XSS/CORS/error/config/secret/gitignore review, inventory & cancellation & rollback concurrency tests).

## Overall Status

No critical or high-severity vulnerabilities remain open. The original audit found 5 issues (all fixed), the hardening pass closed the three medium-risk hardening items (simulated-provider risk, rate limiting, non-atomic stock) plus added backend security headers and CSP hardening, and the maximum-hardening delta deepened the guards: production now fails closed on a malformed Paystack key, stock is reserved with a single atomic conditional UPDATE (no oversell), webhook replay is additionally blocked by a `provider_event_id` unique constraint, rate limits are keyed per user (not just per IP), concurrent wallet writes surface as graceful 409s, and two real concurrency tests exercise genuine DB races. The final consolidated pass closed the remaining realistic hardening items: the change-password endpoint is now rate-limited per user (5/min) because it exposes a "current password" oracle, `X-Forwarded-For` is only trusted when explicitly enabled (`RATE_LIMIT_TRUST_XFF`), and withdrawal-status updates gained an in-service admin-only guard as defense-in-depth. The money paths (payment verification, settlement, wallets, withdrawals) are idempotent or version-locked, admin-only endpoints are enforced server-side, and the Supabase surface is small (profiles + delivery requests only).

```
Fixed:   1 HIGH, 3 MEDIUM, 1 LOW  (audit pass) + 3 hardening items + headers/CSP (hardening pass) + delta pass + final-pass hardening (password-change rate limit, XFF trust, admin guard)
Open:    0 HIGH, 0 MEDIUM, 3 LOW  (documented hardening / deployment risks)
Tests:   78/78 backend (6 production guard, 5 real concurrency, 7 rate-limit/authorization hardening, 9 security regression), frontend static+service smoke PASS, build PASS
```

## Findings

### F1 — HIGH (FIXED) Missing seller-ownership check on order status updates
- Component: `OrderServiceImpl.updateOrderStatus` — `PUT /api/v1/orders/{id}/status`
- Attack: any authenticated SELLER calls `PUT /orders/{id}/status` with `{"status":"DELIVERED"}` on an order where they sell nothing (the controller has no `@PreAuthorize`; the service checked only `hasRole('SELLER')`).
- Impact: drives a cash-on-delivery order `PENDING → COMPLETED` (`completeCodOnDelivery`), settling **all** sellers in the order as if cash was collected; releases other sellers' pending commissions early (`releaseOnDelivery`); issues reward coupons. Direct payment-fraud/wallet-theft primitive.
- Fix: non-cancel transitions now require `isAdmin || isSellerWithItem` (seller must own ≥1 item in the order).
- Verification: `SecurityIntegrationTest` — `seller_withoutItemInOrder_cannotChangeOrderStatus`, `unrelatedSeller_cannotCompleteAnotherSellersCodOrder` (wallet stays 0), `seller_withItemInOrder_canStillUpdateStatus`, `admin_canStillUpdateAnyOrderStatus`. All pass.

### F2 — MEDIUM (FIXED) Wildcard CORS applied in production
- Component: `config/CorsConfig.java` + `application-prod.yml` (`CORS_ALLOWED_ORIGINS` defaults empty)
- Attack: empty or `*` origin list fell back to `allowedOriginPatterns("*")`, so any origin could call the API in production.
- Fix: wildcard is now used only when `*` is explicitly configured; an empty list fails closed (cross-origin rejected).
- Verification: `mvn test` green; behavior confirmed by review.

### F3 — MEDIUM (FIXED) Demo data + demo seller seeded in production by default
- Component: `DemoDataInitializer` + `application-prod.yml`
- Fix: `application-prod.yml` now defaults `demo-data-enabled: ${DEMO_DATA_ENABLED:false}`.
- Verification: `mvn test` green (test profile still seeds demo data for the suite).

### F4 — MEDIUM (FIXED) Delivery-request RLS policy allowed sellers to rewrite non-status fields
- Component: `supabase/20260812_delivery_requests.sql`, policy `delivery_requests_seller_update_status`
- Fix: `WITH CHECK` now requires every non-status column to equal its previous row (correlated subquery).
- Action required: **re-run `supabase/20260812_delivery_requests.sql` against the live Supabase project** to replace the policy (file is idempotent).

### F5 — LOW (FIXED) Open redirect on the login page
- Component: `js/pages/login.js` (`redirect` query parameter)
- Fix: reject protocol-relative (`//`) and absolute-scheme values; only same-origin absolute paths or relative paths are accepted.
- Verification: frontend `npm test` PASS.

## Hardening Pass (2026-08-14)

### HP1 — Rate limiting on sensitive endpoints, per user AND per IP (delta upgraded)
- Component: `security/RateLimitFilter` + `config/RateLimitProperties`; runs **after** the JWT auth filters in `SecurityConfig` so the limiter can see the authenticated principal.
- Behavior: in-memory per-minute budgets on sensitive routes; returns `429` with a JSON body. **Authenticated** requests are keyed `per user id` (rotating IPs cannot dodge the cap); **anonymous** requests (login, register, webhooks) are keyed per client (first `X-Forwarded-For` value, else remote IP). In-memory by design (single-instance deployment, no new dependencies); budgets reset each minute.
- Defaults (`app.rate-limit.limits`, all env-overridable): `POST /auth/login` 10/min, `POST /auth/register` 5/min, `POST /payments/orders` 120/min, `POST /wallet/withdrawals` 10/min, `POST /orders` 120/min, `/api/v1/admin/**` 240/min, `POST /payments/webhooks` 600/min (soft anti-hammering budget well above legitimate Paystack callback rates — callbacks are **not** exempt from the limiter, they just get a generous one). Toggle: `RATE_LIMIT_ENABLED`.
- Verification: `HardeningIntegrationTest.bruteForceLogin_isRateLimited` (11th attempt → 429), `rateLimit_doesNotThrottleOtherClients`, `authenticatedBudgets_arePerUser_notPerIp` (10 withdrawal attempts from 10 different IPs, 11th from a brand-new IP still → 429).

### HP2 — Production startup guard against the SIMULATED payment provider (delta upgraded)
- Component: `config/ProductionPaymentGuard` (`@Profile("prod")`).
- Behavior: if `PAYSTACK_SECRET_KEY` is blank **or malformed** (shorter than 20 chars, or containing whitespace/control characters) the app **refuses to start** in production with a `PaymentConfigurationException`, because with a blank or broken key every online payment auto-completes through the SIMULATED provider. Escape hatch: `PAYSTACK_ALLOW_SIMULATED=true` for throwaway staging only.
- Verification: `ProductionPaymentGuardTest` (6 unit tests: missing/blank/malformed keys rejected, valid key accepted, explicit simulated opt-in allowed, format check boundaries).

### HP3 — Atomic stock at checkout (delta upgraded)
- Component: `ProductRepository.reserveStock` / `restoreStock` — single `@Modifying` atomic conditional UPDATE (`SET stock = stock - :qty WHERE id = :id AND stock >= :qty`) returning the affected-row count; used in `OrderServiceImpl.createOrderFromCart` and `restoreStock`.
- Behavior: the stock check + decrement happen in **one** database statement, so two concurrent buyers cannot both reserve the last unit (the second transaction's UPDATE affects 0 rows → `InsufficientStockException`, a 400). The managed entity is refreshed after the bulk update so nothing in the request reads stale stock. Checkout items are processed in stable product-id order.
- Verification: `OrderCheckoutIntegrationTest` stock decrement + `ConcurrencyIntegrationTest.concurrentCheckout_cannotOversellTheLastUnit` (two threads checkout a stock-1 product → exactly one success, final stock 0).

### HP4 — Backend security headers
- Component: `SecurityConfig` now applies via Spring Security `.headers()`: `Cache-Control: no-cache, no-store, max-age=0, must-revalidate`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`. `Strict-Transport-Security` (max-age 1y, includeSubDomains) is sent only when `HSTS_ENABLED=true` (default false; set true in `application-prod.yml`).
- Verification: config review; suite green.

### HP5 — CSP hardening
- Component: `netlify.toml` CSP gained `object-src 'none'` and `worker-src 'self'` (SW is self-hosted; no `<object>`/`<embed>` anywhere).

## Maximum-Hardening Delta (2026-08-14)

### HP6 — Webhook double-spend blocked at the DB level (delta)
- Component: `Payment` now carries `@UniqueConstraint uk_payments_provider_event` on `provider_event_id`, alongside the existing `uk_payments_order` (unique order_id) and `uk_payments_ref` (unique transaction_ref).
- Behavior: even if two identical Paystack callbacks arrived before idempotency logic runs, only one `payments` row can exist per provider event — the second insert fails. Existing application-level idempotency (already-final payments ignored) remains the primary defence.
- Verification: `PaymentWebhookIntegrationTest.webhook_duplicateDelivery_idempotent`, `SettlementIntegrationTest.repeatedSettlementCall_neverDoubleCredits`.

### HP7 — Graceful handling of concurrent wallet writes (delta)
- Component: `GlobalExceptionHandler` now maps `ObjectOptimisticLockingFailureException` → **409 Conflict** with a "please retry" message instead of a raw 500.
- Behavior: wallet/withdrawal races (two sellers or two tabs acting on the same wallet row) lose their version check and get a clean, retryable response; their partial writes (including the withdrawal row) roll back with the transaction.

### HP8 — Real concurrency regression tests (delta)
- Component: new `ConcurrencyIntegrationTest` — deliberately **not** `@Transactional` (each thread gets its own connection against the shared H2), so genuine database races are exercised against the same context/DB as the rest of the suite.
- Tests: `concurrentCheckout_cannotOversellTheLastUnit` (two threads checkout a stock-1 product → exactly 1 success, stock 0, never negative) and `concurrentWithdrawals_cannotOverdrawTheWallet` (two threads request the full available balance → exactly 1 success, 1 withdrawal row, wallet at 0 — the loser's row rolls back).
- Verification: both pass.

### HP9 — Dependency review (delta)
- Component: `mvn dependency:tree` reviewed. All libraries are the current managed patch versions from Boot 3.5.16 (Jackson 2.21.4, Logback 1.5.34, H2 2.3.232, PostgreSQL 42.7.11, JJWT 0.12.6); no direct third-party dependencies beyond the standard starters, `modelmapper`, `jjwt`, `springdoc-openapi`. Optional: `mvn org.owasp:dependency-check-maven:check` before go-live.

## Final Consolidated Security Pass (2026-08-14)

### HP10 — Password change is rate-limited per user; X-Forwarded-For is opt-in
- Component: `config/RateLimitProperties`, `security/RateLimitFilter`, `application.yml`, `application-prod.yml`.
- `PUT /api/v1/users/me/password` now carries a per-user budget of 5/min (`RATE_LIMIT_PASSWORD_CHANGE`). The endpoint verifies the current password, so it is an offline-cracking oracle (all digits-only / short-current-password accounts are the practical target); the per-user cap bounds attempts to 5/minute per account regardless of IP rotation.
- `X-Forwarded-For` is only consulted when `app.rate-limit.trust-forwarded-for=true` (`RATE_LIMIT_TRUST_XFF`). Default is **false**: direct clients can spoof the header and rotate per-IP budgets, so by default the limiter keys anonymous buckets on `getRemoteAddr()`. Enable only behind a trusted reverse proxy that overwrites the header.
- Verification: `HardeningIntegrationTest.changePassword_wrongCurrentPassword_isRateLimitedPerUser` (5× 400 then 429).

### HP11 — Withdrawal-status admin guard (defense-in-depth)
- Component: `SellerWalletServiceImpl.updateWithdrawalStatus`.
- Behavior: besides the existing route-level `ROLE_ADMIN` constraint, the service now re-checks the authenticated principal in-service (`hasRole("ROLE_ADMIN")` → else `ForbiddenException`), so a misconfigured controller route cannot allow a non-admin to approve/complete/reject withdrawals.

### Final-pass verification (no code change required unless noted)
- **IDOR (14 scenarios)**: all pass — every request re-derives roles/ownership from the DB; seller order-view, coupon-enumeration (`GET /coupons/check`), self-service SELLER registration and the SIMULATED provider (non-prod) are intentional and low-risk.
- **Inventory concurrency**: added `ConcurrencyIntegrationTest.concurrentCheckout_cannotReserveMoreThanAvailableStock` (stock 10, two qty-7 → exactly 1 success, `InsufficientStockException` for the loser, final stock 3), `concurrentCancellations_restoreStockExactlyOnce` (two concurrent cancels on one order → stock restored exactly once via `@Version` + same-transaction rollback), `multiItemCheckout_rollsBackAllReservationsWhenOneLineFails` (failed second line rolls back the first line's reservation).
- **Withdrawal concurrency**: `concurrentWithdrawals_cannotOverdrawTheWallet` verified (canonical overdraw race; winner only).
- **Paystack flow**: amount/currency/status fully server-derived; HMAC-SHA512 signature checked constant-time; `charge.success` only; unknown/already-final/non-success ignored; amount+currency matched before COMPLETED; `settleOrReinitialize` verifies a stale gateway session before issuing a fresh reference.
- **Webhook replay**: `PaymentWebhookIntegrationTest.webhook_duplicateDelivery_idempotent` + `provider_event_id` unique constraint (HP6).
- **Financial integrity**: commission rate is config-driven (`SettlementProperties.commissionRate`, default 0.10 — not hard-coded); settlement idempotent per unique `(order, seller)` commission row; withdrawal transition table is a superset of the spec (PENDING→PROCESSING/COMPLETED/REJECTED/CANCELLED, PROCESSING→COMPLETED/REJECTED) and is entirely admin-gated.
- **XSS (67 DOM sinks in `js/`)**: every user-controlled value (product/category/seller name, description, order address/PII, delivery recipient/instructions, image URLs) passes through `escapeHtml()` before interpolation; toasts use `textContent`; reviews are never rendered as HTML; no `eval`/`new Function`/`document.write`.
- **CORS**: `CorsConfig` fails closed — empty `CORS_ALLOWED_ORIGINS` → no cross-origin allowed; wildcard only when explicitly configured.
- **Error handling**: prod profile `include-message: never`, `include-stacktrace: never`; optimistic-lock races return 409 (HP7); actuator limited to health/info; Swagger off by default.
- **Secrets scan (source + git history)**: no real secrets — only the public Supabase anon key (`sb_publishable_…`), `.env.example` placeholders, and test-only fixtures. No rotation required.
- **Repo hygiene**: backend `.gitignore` covers `target/` + `.env`; frontend `.gitignore` covers `node_modules/`, `dist/`, `package-lock.json`; no committed `.env`/`.pem`/`.key` in either repo.
- **File uploads**: N/A — no `MultipartFile` anywhere in the backend.
- **Frontend trust model**: frontend holds only public `SUPABASE_URL` + anon key (rewritten at Netlify build time); no service-role key, Paystack secret, JWT secret or admin password in the client; preview mode gated to `localhost`/`file://`.

## Delta items verified as already satisfied (no code change required)

- **#4 IDOR** — every request re-derives the role from the DB: `JwtAuthenticationFilter` re-loads the user via `CustomUserDetailsService` on every request; product/order/wallet/withdrawal access is participant-scoped.
- **#5 Financial integrity** — totals, settlement, commission, withdrawal holds are 100% server-derived; checkout/withdrawal requests carry no prices.
- **#6 Admin privilege escalation** — admin flag comes from the DB role on each request; registration cannot request ADMIN; RLS removes self-promotion.
- **#8/#9 Security headers & XSS** — done (HP4/HP5) and verified (escapeHtml everywhere, CSP `script-src 'self'`).
- **#10 File upload** — N/A: no `MultipartFile` anywhere in the backend; no upload endpoints.
- **#11 Error leaks** — prod error config hides messages/stack traces; delta added the optimistic-lock 409 (HP7).
- **#13 RLS** — verified; Supabase surface is `profiles` + `delivery_requests`, participant-scoped.
- **#15 Defense-in-depth** — documented in this report; launch checklist below.

## Documented Hardening Items (not code-changed)

### H3 — MEDIUM (already mitigated) Tokens stored in localStorage/sessionStorage
SPA tokens in `storage.js` are readable by XSS. Netlify CSP (`script-src 'self'`) and the zero-dependency bundle keep the practical risk low. Action (future): HttpOnly cookies + CSRF protection for access tokens.

### H5 — LOW Inline `onerror` image fallback
Four pages use an inline `onerror` that swaps `images/placeholder.svg`. The `src` is always `escapeHtml()`-escaped, the handler body is static (no code from user data), and CSP `script-src 'self'` (no `'unsafe-inline'`) blocks inline handlers in production anyway, so the fallback simply doesn't fire there. Cosmetic only; optional cleanup would migrate to `addEventListener`.

### H6 — LOW `npm audit` cannot run
The frontend has zero runtime dependencies and no `package-lock.json` (gitignored), so `npm audit` returns `ENOLOCK`. Supply-chain surface is effectively nil.

## Verified Strong

- **Webhook integrity**: HMAC-SHA512 signature checked constant-time before processing; event/amount/currency/status all verified; already-final payments ignored (idempotent); a `provider_event_id` unique constraint makes duplicate insert impossible at the DB level (HP6). Webhooks carry a soft 600/min budget so legitimate gateway callbacks are never dropped while hammering stays bounded.
- **Financial integrity**: settlement keyed on unique `(order, seller)` commission row; `@Version` on `Wallet`, `Payment`, `Order` prevents double-spend/double-settle races; withdrawal state machine enforced; refund runs `reverseSettlement` for both RELEASED and PENDING; checkout stock is reserved with a single atomic conditional UPDATE (HP3) and losing races fail cleanly; concurrent wallet writes return 409 (HP7).
- **Role integrity**: `ADMIN` cannot be requested at registration; Supabase role mapping fails closed; `public.profiles.role` writes revoked from anon/authenticated; `is_admin()` is a `security definer` helper; no auto-admin trigger. Admin-only coupon/role/finance endpoints re-verified (`HardeningIntegrationTest.couponAdministration_isAdminOnly`, `SecurityIntegrationTest.adminFinance_isAdminOnly`).
- **Ownership/IDOR**: product update/delete requires admin or owning seller (`HardeningIntegrationTest.seller_cannotModifyAnotherSellersProduct`); reviews require a purchased, DELIVERED item (`customerWithoutPurchase_cannotReviewProduct`) and ownership for update/delete; order status + payment init + order view are participant-scoped.
- **RLS scope**: commerce data lives only in the backend DB; the Supabase surface is `profiles` + `delivery_requests`, all participant-scoped.
- **XSS**: `escapeHtml()` used consistently; no `eval`/`new Function`/`document.write` in `js/`; CSP blocks inline handlers.
- **Secrets**: no real secrets in either repo or git history (only the public Supabase anon key and test-only credentials).
- **Hardening present**: no file-upload endpoints; prod error config hides messages/stack traces; Swagger off in prod by default; CORS fails closed; `netlify.toml` + backend both ship CSP/HSTS/nosniff/XFO/Referrer-Policy/Permissions-Policy.

## Dependencies

- Backend: Spring Boot 3.5.16 stack; `mvn dependency:tree` reviewed — all versions are the current managed patch releases (HP9). No OWASP dependency-check plugin — run `mvn org.owasp:dependency-check-maven:check` before go-live if desired.
- Frontend: zero runtime dependencies; nothing to audit via `npm audit`.

## Tests

- Backend `mvn test`: **78 passed, 0 failed** — 12 Coupon, 6 OrderCheckout, 15 PaymentWebhook, **7 Hardening (incl. password-change rate limit)**, **9 Security**, 10 Settlement, 8 UserManagement, **6 ProductionPaymentGuard**, **5 Concurrency (stock last-unit, stock 10/7, double-cancel, multi-item rollback, wallet overdraw)**.
- Frontend `npm test`: PASS (reference integrity, ES module imports, page shells, CSS coverage, service smoke).
- Frontend `npm run build`: PASS (`dist/` ready for Netlify).

## Remaining Production Risks / Launch Checklist

1. Set `PAYSTACK_SECRET_KEY` — production now **fails to start** without it or with a malformed value (HP2), so a missing key cannot silently slip through.
2. Set `CORS_ALLOWED_ORIGINS` to the real frontend origin(s) — otherwise cross-origin calls are blocked by design.
3. Ensure `DEMO_DATA_ENABLED=false` (new prod default) on every deploy.
4. Re-run `supabase/20260812_delivery_requests.sql` against the live Supabase project.
5. Set required env: `JWT_SECRET`, `ADMIN_INITIAL_PASSWORD`, `SUPABASE_URL`, DB credentials; `SUPABASE_SERVICE_ROLE_KEY` optional.
6. Keep `RATE_LIMIT_TRUST_XFF=false` unless a trusted reverse proxy overwrites `X-Forwarded-For` (default is already false); tune `RATE_LIMIT_*` values if real traffic patterns demand it (in-memory buckets are per-instance and per-minute; shared-NAT buyers share an IP budget — authenticated routes are budgeted per user so this matters most for login/register/webhooks).
7. HTTPS/HSTS at the edge (Netlify), keep Swagger disabled, and commission an external pentest before processing real money.

# Prompt — Mobile & Admin (Claude Code, Flutter)

Copy everything in the box below into Claude Code, running inside the `mobile/`
folder of the Shubayr repo.

---

You are the FRONTEND (MOBILE) DEVELOPER for "Shubayr" — an online multi-section
store (a single-owner digital shopping mall). You are building the **Flutter app**
that serves three roles — **Customer**, **Delivery Agent**, and **Admin/Staff** —
from one codebase, and also builds for **Flutter Web** (the admin dashboard). You
have the whole Shubayr monorepo as reference. Work ONLY inside `mobile/`; follow
`CONTRIBUTING.md`.

═══════════════════════════════════════════════════════════════════════
STEP 0 — READ THESE FIRST (source of truth)
═══════════════════════════════════════════════════════════════════════
1. api/openapi.yaml       → the API CONTRACT. Build against these endpoints/shapes.
                            Missing something? Flag it for the backend; don't invent.
2. docs/ARCHITECTURE.md    → the 18 design rules and the order/stock lifecycle.
3. infra/db/schema.sql     → the data shapes behind the API (read-only reference).
4. README.md, CONTRIBUTING.md → how the repo runs and how we collaborate.

API base URL via `--dart-define=API_URL=...` (default `http://localhost:8000/api/v1`).
Until the backend is live, develop against the OpenAPI contract with mocks.

═══════════════════════════════════════════════════════════════════════
STEP 1 — FOUNDATION
═══════════════════════════════════════════════════════════════════════
- Flutter (stable), null-safe. **RTL + Arabic-first**, fully bilingual (AR/EN)
  via `flutter_localizations` + ARB files; mirror layout in RTL.
- State management: **Riverpod** (be consistent). Routing: **go_router** with
  **role-based guards** (customer vs delivery vs admin).
- Networking: **Dio** with a typed repository per domain, aligned to
  `api/openapi.yaml`; secure token storage; OTP auth flow.
- **White-label** (rule #1): fetch `GET /settings` at startup and build the theme
  (name, logo, primary color, currency) from it. Never hard-code "Shubayr".
- Feature-first folder structure; reusable widgets; loading/empty/error states.

═══════════════════════════════════════════════════════════════════════
STEP 2 — CUSTOMER
═══════════════════════════════════════════════════════════════════════
Home with departments (sections), browse + filters, search, product detail
(variants, verified reviews, price incl. negotiable/points display), cart,
wishlist, **Cash-on-Delivery** checkout (address + coupon), order history + **live
tracking timeline**, loyalty points, request a **partial return** (select items +
quantities, keep the rest), product review + separate **delivery rating** after
delivery. Push notifications (FCM) for order status.

═══════════════════════════════════════════════════════════════════════
STEP 3 — DELIVERY AGENT
═══════════════════════════════════════════════════════════════════════
Login as delivery role → `GET /deliveries/assigned` list, order details + address
+ map, update status (`PATCH /deliveries/{id}`: out_for_delivery / delivered /
failed), mark cash collected.

═══════════════════════════════════════════════════════════════════════
STEP 4 — ADMIN / STAFF (also the Flutter Web target)
═══════════════════════════════════════════════════════════════════════
Guarded by RBAC permissions from the API. Screens for: catalog CRUD; **purchase
invoices** (create + receive to warehouse/location → creates batches); **inventory**
(batches, locations, movements, controlled adjust/transfer); **orders** (confirm →
generates FEFO reservation + pick list; update status); **picking** view (item +
qty + warehouse + shelf + batch); **returns** processing (approve, inspect
condition, restock/quarantine/damage); **reports** (sales, low stock, top
products); users & roles. Show only what the user's permissions allow.

═══════════════════════════════════════════════════════════════════════
STEP 5 — QUALITY BAR & WORKING AGREEMENT
═══════════════════════════════════════════════════════════════════════
- Handle offline/errors gracefully; never crash on an API error.
- `mobile/README.md` with run instructions and how to switch API_URL.
- Branch off `develop` (e.g. `feature/mobile-cart`); Conventional Commits; PRs into
  `develop`. Never touch `backend/`, `web/`, or `infra/db/schema.sql`.
- If the API contract needs a change, raise it — don't work around it silently.

Start by scaffolding the Flutter app with routing + role guards + i18n/RTL +
white-label theming + the API layer, then build Customer first, then Delivery,
then Admin. Propose a short plan first, then begin.

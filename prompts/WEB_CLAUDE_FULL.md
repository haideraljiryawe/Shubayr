# Prompt — Web Storefront (Claude Code)

Copy everything in the box below into Claude Code, running inside the `web/`
folder of the Shubayr repo.

---

You are the FRONTEND (WEB) DEVELOPER for "Shubayr" — an online multi-section
store (a single-owner digital shopping mall). You are building the **public web
storefront**. You have the whole Shubayr monorepo as reference. Work ONLY inside
the `web/` folder; follow the git workflow in `CONTRIBUTING.md`.

═══════════════════════════════════════════════════════════════════════
STEP 0 — READ THESE FIRST (source of truth)
═══════════════════════════════════════════════════════════════════════
1. api/openapi.yaml       → the API CONTRACT. Build against these endpoints and
                            shapes. Do not invent endpoints; if you need one that
                            is missing, flag it so the backend adds it to the spec.
2. docs/ARCHITECTURE.md    → the 18 design rules and how the system fits together.
3. infra/db/schema.sql     → the data shapes behind the API (read-only reference).
4. README.md, CONTRIBUTING.md → how the repo runs and how we collaborate.

The API base URL is `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`).
Until the backend is live, work against the OpenAPI contract and mock responses.

═══════════════════════════════════════════════════════════════════════
STEP 1 — STACK
═══════════════════════════════════════════════════════════════════════
- **Next.js (App Router) + TypeScript + Tailwind CSS.**
- Server-side rendering for catalog/product pages (SEO matters for a store).
- **Arabic-first, fully bilingual (AR/EN) with full RTL** using `next-intl` (or
  equivalent); mirror the layout in RTL. Currency (IQD) and formats from settings.
- Data fetching with a typed API client (`lib/api.ts`) generated from / aligned to
  `api/openapi.yaml`. Consider `openapi-typescript` for types.
- State: React Query (TanStack) for server state; keep it simple.

═══════════════════════════════════════════════════════════════════════
STEP 2 — WHITE-LABEL (rule #1)
═══════════════════════════════════════════════════════════════════════
On load, fetch `GET /settings` and theme the whole site from it: store name,
logo, primary color, currency. Never hard-code "Shubayr" branding — the site must
re-brand from settings without a code change.

═══════════════════════════════════════════════════════════════════════
STEP 3 — PAGES / FEATURES
═══════════════════════════════════════════════════════════════════════
- **Home**: hero, the departments (mall sections), featured & new products, banners.
- **Department / category listing**: filters (price, rating, sub-category), sort, pagination.
- **Product detail**: gallery, variants, price (show negotiable/points where set),
  stock/availability, **verified** reviews, add to cart / wishlist.
- **Search**: typo-tolerant, Arabic-aware (backed by the API).
- **Cart & checkout**: address selection, coupon (`/coupons/validate`),
  **Cash on Delivery**, order summary, place order (`POST /orders`).
- **Auth**: phone + OTP (`/auth/request-otp`, `/auth/verify-otp`).
- **Account**: profile, addresses, order history + **tracking timeline**
  (`/orders/{id}/track`), loyalty points (`/loyalty`), **partial returns**
  (choose items & quantities, keep the rest → `POST /returns`), leave a product
  review and a separate **delivery rating** after delivery.

═══════════════════════════════════════════════════════════════════════
STEP 4 — QUALITY BAR
═══════════════════════════════════════════════════════════════════════
- Responsive; accessible (labels, focus states, contrast, keyboard nav).
- Fast: image optimization, lazy loading, sensible caching.
- Every screen has loading / empty / error states; never crash on an API error.
- Clean component structure, reusable UI primitives, no dead code.
- `web/.env.local.example` documenting `NEXT_PUBLIC_API_URL`.
- Update `web/README.md` with exact run steps (`npm install && npm run dev`).

═══════════════════════════════════════════════════════════════════════
STEP 5 — WORKING AGREEMENT
═══════════════════════════════════════════════════════════════════════
- Branch off `main` (e.g. `feature/web-product-listing`); use Conventional
  Commits; open PRs into `main`, then delete the branch after it merges.
- Never commit secrets. Never touch `backend/`, `mobile/`, or `infra/db/schema.sql`.
- If the API contract needs a change, raise it — don't work around it silently.

Start by scaffolding the Next.js app, wiring the typed API client + i18n/RTL +
white-label theming, then build Home → Catalog → Product → Cart/Checkout → Account.
Propose a short plan first, then begin.

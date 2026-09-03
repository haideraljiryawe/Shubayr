# Prompt — Web storefront (Claude Code)

Copy everything in the box below into Claude Code, running inside the `web/` folder.

---

You are building the **public web storefront for "Shubayr"**, an online multi-section store (a single-owner digital mall). Build it with **Next.js (App Router) + TypeScript + Tailwind CSS**. It consumes the backend API at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`). Read `../infra/db/schema.sql` and `../docs/ARCHITECTURE.md` to understand the data and the 18 architecture rules; the store name/logo/colors/currency are **white-label** and come from the API's `store_settings` — never hard-code "Shubayr" branding.

## Requirements
- **Next.js App Router**, TypeScript, Tailwind. Use server components / SSR for catalog pages (SEO matters for a store).
- **Arabic-first, fully bilingual (AR/EN) with RTL**. Use `next-intl` (or similar); mirror layout in RTL. Currency formatting from settings (IQD default).
- A typed API client (`lib/api.ts`) with the endpoints from the backend (auth OTP, categories, products, search, cart, coupons, orders, reviews, loyalty).
- **Theming from `store_settings`** (primary color, logo, store name) loaded at runtime so the site re-brands without a rebuild.

## Pages / features
- Home: hero, departments (the mall sections), featured & new products, banners.
- Category / department listing with filters (price, rating, sub-category), sorting, pagination.
- Product detail: gallery, variants, price (respect `is_negotiable`/`points_price` display), stock/availability, **verified** reviews, add to cart / wishlist.
- Search (typo-tolerant, Arabic-aware) backed by the API.
- Cart & checkout: address selection, coupon, **Cash on Delivery**, order summary, place order.
- Auth: **phone + OTP** register/login.
- Account: profile, addresses, order history + **order tracking timeline**, loyalty points balance, returns (request a **partial return** — choose items and quantities, keep the rest), leave a product review and a separate **delivery rating** after delivery.

## Quality
- Responsive, accessible (labels, focus states, contrast), fast (image optimization, lazy loading).
- Clean component structure, reusable UI primitives, loading/empty/error states.
- `.env.local.example` with `NEXT_PUBLIC_API_URL`.
- A `web/README.md` with run instructions (`npm install && npm run dev`).
- Keep all code inside `web/`. Do not touch other folders.

# Prompt — Mobile & Admin (Claude Code, Flutter)

Copy everything in the box below into Claude Code, running inside the `mobile/` folder.

---

You are building the **Flutter app for "Shubayr"**, an online multi-section store (a single-owner digital mall). One Flutter codebase serves **three roles** — **Customer**, **Delivery Agent**, and **Admin/Staff** — chosen by the logged-in user's role, and it also builds for **Flutter Web** (the admin dashboard runs there). It consumes the backend API at `API_URL` (default `http://localhost:8000/api/v1`). Read `../infra/db/schema.sql` and `../docs/ARCHITECTURE.md`; branding is **white-label** from the API's `store_settings` — never hard-code "Shubayr" colors/logo/name.

## Foundation
- Flutter (stable), null-safe, **RTL + Arabic-first**, fully bilingual (AR/EN) via `flutter_localizations` + ARB files. Mirror layout in RTL.
- State management: **Riverpod** (or Bloc) — pick one and be consistent.
- Routing: `go_router` with **role-based route guards** (customer vs delivery vs admin).
- A typed API client (Dio + a `repository` per domain), token storage (secure storage), OTP auth flow.
- Theme built from `store_settings` (primary color, logo, store name) fetched at startup.

## Customer experience
Home with departments (mall sections), category browse + filters, search, product detail (variants, verified reviews, price incl. negotiable/points display), cart, wishlist, **Cash-on-Delivery** checkout with address selection & coupon, order history + **live tracking timeline**, loyalty points balance, request a **partial return** (select items + quantities, keep the rest), product review + separate **delivery rating** after delivery. Push notifications (FCM) for order status.

## Delivery Agent experience
Login as delivery role → list of **assigned deliveries**, order details + address + map, update status (out_for_delivery / delivered / failed), mark cash collected.

## Admin/Staff experience (also the Flutter Web target)
Guarded by RBAC permissions from the API. Screens for: catalog (products/categories CRUD), **purchase invoices** (create + receive to warehouse/location → creates batches), **inventory** (batches, locations, stock movements, controlled adjust/transfer), **orders** (confirm → generates FEFO reservation + pick list; update status), **picking** view (item + qty + warehouse + shelf + batch), **returns** processing (approve, inspect condition, restock/quarantine/damage), **reports** (sales, low stock, top products), users & roles. Show only what the user's permissions allow.

## Quality
- Clean architecture (feature-first folders), reusable widgets, loading/empty/error states.
- Handle offline/error gracefully; never crash on API errors.
- `mobile/README.md` with run instructions and how to switch API_URL.
- Keep all code inside `mobile/`. Do not touch other folders.

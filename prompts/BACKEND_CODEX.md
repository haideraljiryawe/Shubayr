# Prompt — Backend (Codex)

Copy everything in the box below into Codex, running inside the `backend/` folder.

---

You are scaffolding the **backend API for "Shubayr"**, an online multi-section store (a single-owner digital mall) with web + mobile clients. Build a clean, production-minded **Laravel 13 (PHP 8.3)** REST/JSON API. The database schema already exists and is the contract — read `../infra/db/schema.sql` and make your migrations match it exactly (same tables, columns, types, FKs). Do not invent or rename columns; if you believe the schema must change, stop and flag it.

## Project setup
- Initialize a fresh Laravel app in the current directory.
- Configure `.env` for PostgreSQL (host `db`, or `localhost` outside Docker), database/user/password from the root `.env.example`, Redis for cache+queue, and Meilisearch (Scout) for search.
- Use **UUID primary keys** everywhere (match the schema).
- Auth: **phone + OTP** login issuing tokens (Laravel Sanctum). Add `POST /auth/request-otp` and `POST /auth/verify-otp` with hashed, expiring OTP codes and rate limiting.
- API is versioned under `/api/v1`.

## Architecture — modular service layout
Organize by domain module (not one giant controllers folder). Suggested `app/Domain/*`:
`Auth`, `Rbac`, `Catalog`, `Purchasing`, `Inventory`, `Orders`, `Fulfilment`, `Returns`, `Loyalty`, `Reviews`, `Audit`, `Settings`.
Each module: models, a service class holding business rules, a form-request validator, an API controller, and a resource transformer.

## The 18 rules you MUST implement
1. **White-label:** read store name/logo/colors/currency from `store_settings`; never hard-code "Shubayr".
2. **RBAC:** enforce permissions from `roles`/`permissions`/`role_permissions` via a middleware/gate on every protected route. Seed is in `../infra/db/seed_rbac.sql`.
3. **Purchasing:** goods enter stock ONLY through `purchase_invoices` linked to a `supplier`. No endpoint edits stock directly.
4. **Batches:** receiving an invoice creates independent `inventory_batches` (qty, purchase_cost, entry_date, lot_number, expiry_date).
5. **Warehouses/locations:** a batch's quantity is distributed across `warehouse_locations` via `batch_stock` (qty per batch per location).
6. **Stock movements:** every purchase/sale/transfer/return/reserve/release/adjustment writes a `stock_movements` row. The only way to change stock is through a movement (except an explicit, permissioned `inventory.adjust`).
7. **FEFO:** when reserving/picking expiring products, select batches ordered by `expiry_date ASC`.
8. **Reservation:** on order confirm, create `stock_reservations` (status `reserved`) — do NOT deduct yet. Deduct only when the order goes out for delivery (reservation → `fulfilled` + `sale` movement). Release on cancellation.
9. **Picking:** generate a `pick_list` + `pick_list_items` telling the worker product + qty + warehouse + location + batch.
10. **Costing:** keep each batch's `purchase_cost`; expose an average-cost calculation. Selling price (`products.sale_price`) is separate and never auto-changed by purchase cost.
11. **Returns:** implement `returns` + `return_items`. Support **partial returns** (return some items, keep the rest). Each returned item has a `condition` (sellable/opened/damaged) and a `restock` flag; only sellable items re-enter stock (as a `return_in` movement into a batch).
12. **Loyalty:** maintain `loyalty_accounts` + `loyalty_ledger`. Award points only after an order is `delivered`. Support redeem/adjust.
13. **Points negotiation:** respect `products.is_negotiable`, `floor_price`, `points_price` in pricing logic (endpoints can be minimal now; the data must be honored).
14. **Reviews:** `product_reviews` must link to a real `order_item` and set `verified_purchase`; block reviews for unpurchased products.
15. **Delivery rating:** `delivery_ratings` is separate from product reviews, allowed after completion.
16. **Audit trail:** write an `audit_logs` row (actor, action, entity, before/after JSON) for stock, price, cost, purchase, return, order-status and permission changes. Centralize via an observer or a helper.
17. **Order lifecycle:** enforce the status machine: pending → confirmed → processing → out_for_delivery → delivered, plus cancelled / failed_delivery / return_requested / returned.
18. **Payments:** COD only now, but put payment behind a `PaymentMethod` interface (Strategy) so gateways can be added later without touching order code.

## Deliverables
- Migrations matching `schema.sql`, models with relationships, seeders (roles/permissions from `seed_rbac.sql`, plus a demo admin, a few categories/products, one warehouse with locations).
- Endpoints (at least): auth/OTP; categories; products (list/search/detail); cart; coupons/validate; orders (place COD, list, track, cancel); reviews; suppliers & purchase-invoices (create/receive); inventory (batches, locations, movements, adjust, transfer); reservations & pick-lists; returns (request/approve/inspect/settle); loyalty; admin reports; deliveries (assigned/update). Protect each with the right permission.
- Feature tests for: OTP login, placing a COD order (reservation created, not deducted), receiving a purchase invoice (batch + movement created), a partial return with restock, and an RBAC denial.
- An OpenAPI (`openapi.yaml`) or a Postman collection describing the endpoints.
- A `backend/README.md` with run instructions.

Follow PSR-12, keep controllers thin (logic in services), and make everything runnable via `php artisan migrate --seed` and `php artisan serve`.

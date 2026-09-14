# Prompt - Backend (Codex)

Copy everything below into Codex while running inside the `backend/` folder.

---

You are scaffolding the backend API for **Shubayr**, an online multi-section
store with web and mobile clients. Build a clean, production-minded **Node.js
24 LTS + TypeScript + NestJS + Prisma** REST/JSON API.

Two shared contracts are authoritative and must not be changed silently:

- `../infra/db/schema.sql` is the database source of truth. It defines 37
  PostgreSQL tables. Prisma models and migrations must reproduce its tables,
  columns, native types, defaults, checks, unique constraints, indexes, UUID
  primary keys, and foreign keys exactly.
- `../api/openapi.yaml` is the REST API source of truth. Implement every path,
  method, request, response, status code, security rule, and schema exactly.

If either contract appears incorrect or the two conflict, stop and report the
issue. Do not invent or rename columns or endpoints. Serve the versioned API at
`http://localhost:8000/api/v1`.

## Project setup

- Initialize a strict TypeScript NestJS application in the current directory.
- Use Prisma ORM with PostgreSQL and keep `prisma/schema.prisma` aligned with
  `../infra/db/schema.sql`. Prisma migrations may contain required raw SQL for
  PostgreSQL features Prisma cannot express, including CHECK constraints and
  the `pgcrypto` extension.
- Configure runtime settings through `@nestjs/config`; validate required
  environment variables at startup and never commit `.env`.
- Use JWT authentication through Passport (`@nestjs/passport`, `passport-jwt`)
  with phone OTP login. Hash OTP codes, expire and consume them safely, and
  rate-limit OTP requests and verification attempts.
- Validate all inputs with DTOs using `class-validator` and
  `class-transformer`. Enable a global validation pipe with whitelist and
  forbid-non-whitelisted behavior.
- Use BullMQ with Redis for queues and background jobs.
- Use the official Meilisearch JavaScript client for product search.
- Use Jest and supertest for unit and end-to-end tests.
- Generate UUID primary keys in PostgreSQL as required by the SQL contract.

## Modular architecture

Create one NestJS module per domain under `src/modules/`:

`Auth`, `Rbac`, `Catalog`, `Purchasing`, `Inventory`, `Orders`, `Fulfilment`,
`Returns`, `Loyalty`, `Reviews`, `Audit`, and `Settings`.

Each module owns its controller, DTOs, service/application logic, and tests.
Keep controllers thin: they authenticate, authorize, validate, call services,
and map responses. Business rules and transactions belong in services. Keep
Prisma access behind a shared database service; do not scatter raw client calls
through controllers.

## The 18 rules you MUST implement

1. **White-label:** read store name/logo/colors/currency from `store_settings`;
   never hard-code "Shubayr" in runtime behavior.
2. **RBAC:** enforce permissions from `roles`, `permissions`, and
   `role_permissions` with guards/decorators on every protected route. Seed data
   is in `../infra/db/seed_rbac.sql`.
3. **Purchasing:** goods enter stock only through `purchase_invoices` linked to
   a supplier. No endpoint edits stock directly.
4. **Batches:** receiving an invoice creates independent `inventory_batches`
   with quantity, purchase cost, entry date, lot number, and expiry date.
5. **Warehouses/locations:** distribute a batch across `warehouse_locations`
   through `batch_stock`, preserving quantity per batch and location.
6. **Stock movements:** every purchase, sale, transfer, return, reservation,
   release, or adjustment writes `stock_movements`. Stock changes only through
   a movement, except the explicit permissioned `inventory.adjust` operation.
7. **FEFO:** reserve and pick expiring products from batches ordered by
   `expiry_date ASC`.
8. **Reservation:** confirming an order creates `stock_reservations` with
   `reserved` status. Do not deduct stock yet. Dispatch changes the reservation
   to `fulfilled` and writes a `sale` movement; cancellation releases it.
9. **Picking:** generate `pick_lists` and `pick_list_items` containing product,
   quantity, warehouse, location, and batch.
10. **Costing:** retain each batch's `purchase_cost` and expose average cost.
    `products.price` remains separate and never changes automatically.
11. **Returns:** support partial `returns` and `return_items`. Record each item
    condition and restock flag. Only sellable items re-enter stock through a
    `return_in` movement into a batch.
12. **Loyalty:** maintain `loyalty_accounts` and `loyalty_ledger`. Award points
    only after delivery, and support redeem and adjustment entries.
13. **Points negotiation:** honor `products.is_negotiable`, `floor_price`, and
    `points_price` in pricing behavior.
14. **Reviews:** link `product_reviews` to a real `order_item`, calculate
    `verified_purchase`, and reject reviews for unpurchased products.
15. **Delivery rating:** keep `delivery_ratings` separate from product reviews
    and allow them only after completion.
16. **Audit trail:** write an `audit_logs` entry for every sensitive stock,
    price, cost, purchase, return, order-status, and permission action. Include
    actor, action, entity, before/after JSON, and IP where available. Centralize
    this behavior in the Audit module and execute it in the same transaction as
    the sensitive change.
17. **Order lifecycle:** enforce `pending -> confirmed -> processing ->
    out_for_delivery -> delivered`, plus `cancelled`, `failed_delivery`,
    `return_requested`, and `returned` transitions.
18. **Payments:** support COD now behind a `PaymentMethod` strategy interface so
    future gateways do not require changes to order logic.

## Required build phases

Implement and validate in this order. Keep each phase reviewable and do not
start a later phase while an earlier phase is failing:

1. Prisma schema and migrations
2. Auth and phone OTP
3. RBAC
4. Catalog and Settings
5. Cart, Wishlist, and Coupons
6. Orders
7. Purchasing and Inventory
8. Fulfilment: FEFO reservation and guided picking
9. Deliveries
10. Returns
11. Loyalty
12. Reviews and Ratings
13. Audit and Reports

## Deliverables and quality gates

- Implement all endpoints defined by `../api/openapi.yaml`; do not create a
  replacement API contract.
- Provide seeders for the roles and permissions in `seed_rbac.sql`, plus a demo
  admin, sample categories/products, and one warehouse with locations.
- Cover at least: OTP login; RBAC denial; COD order creation; reservation
  without early deduction; purchase receipt creating a batch and movement;
  FEFO selection; partial return with conditional restock; and audit logging.
- Use Prisma transactions for multi-record inventory, order, return, loyalty,
  and audit operations. Protect against double-selling and concurrent updates.
- Add health/readiness endpoints, structured logging, exception mapping, API
  response serialization, graceful shutdown, linting, formatting, and strict
  TypeScript checks.
- Make these commands pass: `npm run build`, `npm test`,
  `npx prisma validate`, and `npx prisma migrate deploy`.
- Keep `backend/README.md` current with local and Docker instructions.

Follow the repository workflow in `../CONTRIBUTING.md`. Never commit secrets or
change either shared contract without a dedicated, reviewed contract PR.

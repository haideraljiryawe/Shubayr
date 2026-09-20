# Shubayr Backend API

This folder holds the Node.js 24 LTS NestJS REST API. Complete environment setup is in
`../docs/setup/SETUP_BACKEND.md`. The API is served below
`http://localhost:8000/api/v1`.

## Authoritative contracts

- `prisma/migrations/`: the ordered, immutable production upgrade path.
- `prisma/schema.prisma`: the runtime database model.
- `../infra/db/schema.sql`: a synchronized clean-database bootstrap/reference;
  never apply it as an upgrade to an existing database.
- `../api/openapi.yaml`: endpoint paths, payloads, responses, and security.
- `../docs/ARCHITECTURE.md`: the 18 mandatory architecture rules.
- `../prompts/BACKEND_CODEX.md`: implementation phases and quality gates.

Do not change either shared contract silently. Contract changes require their
own reviewed pull request.

## Local development

Start the complete migration-first, real-data stack from the repository root:

```bash
docker compose --profile full up -d --build
```

This starts PostgreSQL, Redis, Meilisearch, MinIO, and the API. At startup,
the API runs `prisma generate`, `prisma migrate deploy`, and the idempotent
development seed before serving at `http://localhost:8000/api/v1`. MinIO keeps
objects in the named `minio_data` volume, so uploaded catalog images survive
container restarts. Its local console is `http://localhost:9001`.

Browser CORS allows `http://localhost:3000` and `http://localhost:3100` by
default. Override `CORS_ORIGINS` with a comma-separated list of exact origins
for other local frontend ports; whitespace around entries is ignored.

Then run the API:

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run seed
npm run start:dev
```

On Windows PowerShell with script execution disabled, use `npm.cmd` and
`npx.cmd` in place of `npm` and `npx`.

Available scaffold endpoints:

- `GET /api/v1/health`: process liveness.
- `GET /api/v1/ready`: PostgreSQL readiness.
- `GET /api/v1/settings`: public white-label settings loaded from the database.

### Development OTP authentication

Set `APP_ENV=development` and optionally set `DEV_OTP` (defaults to `000000`).
`POST /api/v1/auth/request-otp` then logs and returns `dev_otp`; verify it with
`POST /api/v1/auth/verify-otp`. The code is persisted as a keyed hash and is
single-use. `dev_otp` is never logged or returned when `APP_ENV=production`;
production requires `SMS_GATEWAY_URL` and `SMS_GATEWAY_TOKEN` and sends the
code to that gateway. Refresh tokens are signed separately, stored only as a
digest, and rotated on every use.

The seed creates these development accounts; each uses the configured
`DEV_OTP`:

| Role | Phone |
|---|---|
| admin | `+9647700000001` |
| manager | `+9647700000002` |
| purchasing | `+9647700000003` |
| warehouse | `+9647700000004` |
| delivery | `+9647700000005`, `+9647700000007` |
| customer | `+9647700000006` |

### Notifications

`POST /api/v1/devices/token` registers or reassigns a globally unique push token;
`DELETE /api/v1/devices/token?token=...` deactivates a token owned by the caller.
`GET/PATCH /api/v1/me/notification-preferences` reads and updates the effective
type/channel matrix; `GET /api/v1/me/notifications` lists the caller's attempts.
Token registration and preference changes are audited. Seed data includes a
customer web token, two explicit preferences, and sent/skipped history rows.

The ten types are `order_placed`, `order_confirmed`, `order_status_changed`,
`out_for_delivery`, `delivered`, `delivery_failed`, `return_update`,
`loyalty_points_earned`, `review_moderated`, and `promo`. Each supports `push`
and `sms`. Transactional push defaults on, except an existing broad category
opt-out still applies until a type/channel override is saved. SMS defaults on
for order confirmation, delivery success, and delivery failure; other SMS and
all promo delivery default off. Customers may opt out of any pair except the
critical order-confirmation SMS. Promo is always opt-in. A preference disabled
at worker time creates a `skipped` history row.

Domain transactions write notification events to a PostgreSQL outbox. A
background poller enqueues them through BullMQ; the worker reads active tokens,
effective preferences, and token locale (Arabic fallback), then records each
attempt as `queued`, `sent`, `skipped`, or `failed`. Queue keys are scoped to
the database name, so disposable acceptance runs cannot consume dev jobs.
`NOTIFICATION_PROVIDER=dev` logs push/SMS without network calls; production
defaults to `disabled` and records failed attempts until real gateways are
configured. Provider classes are the integration seam for those gateways.

It also creates eight bilingual departments and their subcategories, 32
stocked products with variants and ordered images, active/future discounts,
three banners, `DEV10` and `SHUBAYR10` percentage coupons, and six sample customer orders
(pending, confirmed, out_for_delivery, delivered, failed_delivery). Each order has immutable
line/address snapshots and a delivery record; the delivered item has a seeded
review and a separate delivery rating. `npm run seed` is safe to repeat and does not duplicate those orders.

The remaining OpenAPI endpoints are implemented phase-by-phase in the order
specified by the backend build prompt.

### Cart integration seam

Guest carts stay on the client. After phone-OTP login, replay each guest line
through authenticated `POST /api/v1/cart/items`; the server merges the same
product/variant by increasing quantity (maximum 99 and never above available
stock). `GET /api/v1/cart` always recomputes prices from the current server-time
catalog discount. The cart subtotal is the sum of effective-price line totals,
and the cart discount is a validated coupon only. Delivery fee is currently
zero until a delivery-fee rule is introduced; checkout recomputes every
amount and rejects unavailable lines. There is no bulk merge endpoint yet, so
clients should replay lines individually and retain failed guest lines for
user correction.

`DELETE /api/v1/cart/coupon` detaches the current user's coupon and returns the
repriced cart. Repeating the request when no coupon is applied is safe.

### COD checkout and orders

Create an owned delivery address with `POST /api/v1/addresses`, add products to
the server cart, then `POST /api/v1/orders` with `address_id` and optional
`payment_method: "cod"`. Send a unique `Idempotency-Key` header for each checkout
attempt: a retry with the same body and key returns the same order even after
the cart is cleared; a changed body with the same key returns 409. The API
snapshots line names, primary image, server-time effective prices, and delivery
address/contact; later catalog or address edits cannot rewrite the order.
`GET /api/v1/orders` is paginated and owner-scoped, and
`GET /api/v1/orders/{id}/track` returns status events. Customers can cancel only
pending/confirmed orders; staff with `orders.update` can advance the status
machine defined in OpenAPI.

Operations staff with `orders.update` can list all deliveries with
`GET /api/v1/deliveries` and assign an active delivery using
`PATCH /api/v1/deliveries/{id}/assign`. Agents with `delivery.assigned` see only
their own records at `GET /api/v1/deliveries/assigned` and change status with
`PATCH /api/v1/deliveries/{id}`. The path is assigned → out_for_delivery →
delivered → returned, or out_for_delivery → failed. Failed and returned are
terminal. Status changes also advance the parent order and its tracking events.
The owning customer may rate a delivered delivery once with
`POST /api/v1/deliveries/{id}/rating`; this is separate from product reviews.

### Product reviews

Customers can review a delivered purchased order line once through
`POST /api/v1/products/{id}/reviews`. Reviews are marked as verified purchases
and start `pending`; staff with `catalog.manage` publish or reject them with a
reason at `POST /api/v1/admin/reviews/{id}/moderate`. The public product review
list shows only published reviews. Editing a review's rating or comment sends
it back to pending; deleting it clears the order line's `reviewed` flag.
`products.rating_avg` and `rating_count` are caches reconciled from published
review rows in the same transaction as every review change. Product reviews
and the existing delivery rating are separate records and endpoints.

### Loyalty points and negotiation data

Delivery completion earns `LOYALTY_POINTS_PER_CURRENCY_UNIT` points (default 1)
for each **full** currency unit of the immutable order subtotal less its
discount. Delivery fee is excluded. The delivery and ledger write share a
transaction, and a unique order earn entry prevents double credit. No points
are earned at checkout. A COD refund is recorded as an obligation, so returns
do not claw back delivery-earned points in this slice.

`GET /api/v1/loyalty` returns the customer's balance as the sum of immutable
ledger entries and paginates history. `POST /api/v1/loyalty/redeem` records a
points spend; its server-derived indicative value is one minor currency unit
per point. Redemption does not alter an order or start a payment. Staff with
`loyalty.manage` can read a customer's ledger and make audited signed
adjustments at `/api/v1/admin/loyalty/{userId}`. Redemptions and negative
adjustments cannot make the balance negative.

Admin product writes can persist `is_negotiable`, `floor_price` (at most the
regular price), and `points_price` (non-negative points cost). These fields
are data-only until a customer negotiation flow is added.

Checkout immediately subtracts a simple product/variant hold from sellable
stock, then cancellation releases it. This is deliberately **not** a fake
batch reservation: the inventory slice must replace it with FEFO allocation,
location-aware picking, movement records, and the final stock-consumption
workflow. The seed currently refreshes development batch quantities; do not
use repeated development seeding as production inventory bookkeeping.

## Database migrations

The compose stack (`docker compose --profile full up`) owns the canonical
`shubayr` development database. Its API deploys migrations and runs the
idempotent seed on startup. Keep `DATABASE_URL` in the environment or compose;
do not commit `.env` files. `npm run test:acceptance` uses `DATABASE_URL` only
to connect to the PostgreSQL server: it creates a unique `shubayr_*_verify`
database, migrates and seeds it, starts an API on a free port, runs the checks,
then drops that database. Never point verify or acceptance at the shared dev
API or database. A failed process can leave a disposable database behind;
`npm run db:drop-verify` lists leftovers and
`npm run db:drop-verify -- --execute` drops only `*_verify` databases. Run that
maintenance command manually when needed; it is not part of boot or CI.

New databases are created with `npm run prisma:migrate:deploy`. Existing
databases that were originally provisioned from `infra/db/schema.sql` must be
backed up, checked against that reference schema, and baselined once before
deploying later migrations:

```bash
npx prisma migrate resolve --applied 20260918000100_initial
npm run prisma:migrate:deploy
```

Every data-changing migration must document its backfill in the migration SQL
and in the pull request. Rollback is restore-first: take a database backup
before deploy, stop application writes, restore that backup if verification
fails, and redeploy the previous application version. Prisma Migrate does not
automatically run down migrations; a reviewed compensating migration is used
when restoring is inappropriate. Never edit an already-deployed migration.

## Quality gates

```bash
npm run prisma:validate
npm run typecheck
npm run lint
npm run build
npm test
npm run test:acceptance # requires a built API, PostgreSQL, and MinIO; creates its own DB/API
```

`test:acceptance` runs both the admin-to-public catalog check and the
customer cart → COD checkout → orders/tracking check. The latter also tests
repricing, coupon rounding, idempotency, immutable snapshots, stock release,
and customer/staff access controls.

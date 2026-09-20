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
| delivery | `+9647700000005` |
| customer | `+9647700000006` |

It also creates eight bilingual departments and their subcategories, 32
stocked products with variants and ordered images, active/future discounts,
three banners, a `DEV10` percentage coupon, and four sample customer orders
(pending, confirmed, out_for_delivery, delivered). Each order has immutable
line/address snapshots and a delivery record; the delivered item has a seeded
review. `npm run seed` is safe to repeat and does not duplicate those orders.

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

Checkout immediately subtracts a simple product/variant hold from sellable
stock, then cancellation releases it. This is deliberately **not** a fake
batch reservation: the inventory slice must replace it with FEFO allocation,
location-aware picking, movement records, and the final stock-consumption
workflow. The seed currently refreshes development batch quantities; do not
use repeated development seeding as production inventory bookkeeping.

## Database migrations

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
npm run test:acceptance # requires the built API plus PostgreSQL and MinIO
```

`test:acceptance` runs both the admin-to-public catalog check and the
customer cart → COD checkout → orders/tracking check. The latter also tests
repricing, coupon rounding, idempotency, immutable snapshots, stock release,
and customer/staff access controls.

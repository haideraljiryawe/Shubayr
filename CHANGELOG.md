# Changelog

## 4.8.0 - 2026-09-20

### Added

- Staff delivery listing and assignment, agent-scoped delivery transitions,
  and customer delivery ratings on real PostgreSQL.
- A unique delivery-rating constraint and seeded assigned, dispatched,
  delivered, and failed deliveries with two delivery agents.

### Changed

- Delivery status changes now advance order status and tracking events in the
  same transaction; failed and returned deliveries are terminal.

## 4.7.1 - 2026-09-20

### Added

- Four idempotently seeded customer orders (pending, confirmed,
  out_for_delivery, delivered), with immutable snapshots, delivery records,
  timeline events, and a reviewed delivered item.
- `DEV10` development coupon and a 79-assertion COD checkout HTTP acceptance
  test, run alongside the existing 34-assertion catalog acceptance test in CI.

### Fixed

- `POST /orders/{id}/cancel` now returns the contract's HTTP 200 instead of
  Nest's default 201.

## 4.7.0 - 2026-09-20

### Added

- COD checkout from the server cart, with immutable catalog/address snapshots,
  per-customer idempotency, a minimal delivery record, and a tracked status
  timeline.
- User-scoped paginated order reads, tracking, cancellation, and staff-guarded
  status transitions.
- Owned address CRUD, including first/default-address behavior, to make the
  checkout address selection usable.
- Temporary product/variant sellable-stock holds, released on cancellation.
  FEFO batch reservation and picking remain in the inventory slice.

### Changed

- Order placement now reduces sellable stock immediately; confirmation no longer
  claims to perform FEFO allocation. The OpenAPI status rules and errors match
  the implemented HTTP behavior.
- Deleting an address clears the order's optional address reference while
  preserving immutable delivery snapshots.

## 4.6.0 - 2026-09-19

### Added

- Authenticated, user-scoped server carts with server-time product repricing,
  stock-aware quantity validation, coupon application, and complete cart totals.
- Documented guest-cart replay/merge seam after login.

### Changed

- Cart responses now include line totals, availability, coupon discount,
  delivery fee, and grand total under the shared two-decimal money policy.

## 4.5.0 - 2026-09-18

### Added

- Idempotent development seed with all six roles, loggable accounts, eight
  bilingual departments, subcategories, 32 stocked products, variants,
  server-time discounts, durable MinIO images, and banners.
- Automated real-PostgreSQL/MinIO acceptance coverage for the admin-to-public
  catalog path and customer/guest RBAC denial.

### Changed

- The full Docker profile now provisions databases exclusively with Prisma
  Migrate, seeds on API boot, and exposes one API URL for web and mobile.
- The production start command now targets the actual compiled NestJS entry
  point, and the API allows configured web origins through CORS.

## 4.4.0 - 2026-09-18

### Added

- PostgreSQL-backed public active-banner reads and permission-protected banner
  administration with durable managed media, deterministic display order, and
  server-time schedule enforcement.

### Changed

- Banner PATCH now has an explicit partial-update contract: omitted fields are
  preserved and nullable fields can be cleared with `null`.

## 4.3.0 - 2026-09-18

### Added

- PostgreSQL-backed public category/product reads and permission-protected
  category/product administration, including hierarchy enforcement, variants,
  atomic ordered media operations, search/filter/sort, availability, and
  server-time effective pricing.
- Admin product list/detail reads for hidden and archived catalog records.

## 4.2.0 - 2026-09-18

### Added

- Durable validated image uploads to S3-compatible storage, stable public API
  media URLs, persisted upload metadata, and protected deletion of unassociated
  objects.
- MinIO with a persistent Docker volume for local development.

## 4.1.0 - 2026-09-18

### Added

- Database-backed phone OTP login, access/rotating refresh JWTs, current-user
  reads and updates, and development-only fixed OTP support.
- Runtime RBAC identity is loaded from the seeded role/permission tables for
  every authenticated request.

## 4.0.0 - 2026-09-18

### Breaking

- Address writes now require a string `contact_phone`; the former client-side
  account-phone toggle is not part of the API contract.
- Orders now expose immutable checkout address/contact snapshots and a current
  `delivery_id`.

### Added

- Customer return listing, reviewed order-item signal, customer-owned delivery
  rating rules, and persisted notification preferences.

## 3.0.0 - 2026-09-18

### Breaking

- Replaced category `icon`/`is_active` with semantic `icon_key`/`is_visible`,
  and added localized descriptions plus a separate category image.
- Product image responses are ordered objects; product PATCH media changes use
  explicit add/remove/replace/move operations.

## 2.0.0 - 2026-09-18

### Breaking

- Standardized every JSON error as `status`, `code`, `message`, and field-level
  `errors`; request validation now consistently returns HTTP 422.
- Defined PATCH omission-versus-null behavior and made product updates partial.
- Standardized money at two decimal places with half-away-from-zero rounding.

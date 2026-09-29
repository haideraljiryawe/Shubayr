# Changelog

## 7.1.0 - 2026-09-29

### Added

- A permissioned pending-order rejection route with a required reason,
  reservation release, audit trail, and durable customer/monitor notification.
- A searchable, paginated active-delivery-agent picker protected only by
  `orders.assign_agent`.

### Changed

- The API contract is version 7.1.0 and generated web/admin types are refreshed
  in the same change.
- API-contract CI now independently gates web and admin type generation and
  typechecking whenever `api/openapi.yaml` changes.

## 7.0.0 - 2026-09-29

### Added

- Currency administration with IQD as the seeded base currency, dated exchange
  rates, normalized per-unit quotations, stale-rate warnings, and audited
  permissioned updates.
- Concurrency-safe document numbering, idempotent operation replay, drafts,
  Baghdad accounting-date validation, and protected backdating.
- An immutable double-entry ledger with a seeded chart of accounts, source-event
  idempotency, reversals, balances, trial balance, and original-currency detail.
- Cash and bank account administration, opening balances, same-currency
  transfers, accounting-period close/reopen workflows, and close snapshots.
- Audited financial settings for business hours, closed days, and protection
  thresholds, plus full OpenAPI and acceptance coverage for the financial core.

### Changed

- Monetary storage now records explicit currency codes and uses exact
  `DECIMAL(20,6)` persistence; development catalog prices are realistic IQD
  amounts.
- The API contract is version 7.0.0 and documents the financial administration
  endpoints and currency-bearing commerce responses.

## 6.2.0 - 2026-09-28

### Added

- Trusted-proxy client IP resolution shared by rate limits and audit logging.
- Permissioned, filtered, paginated audit-log reads for the Web Admin.
- Server-side search, filters, sorting, and pagination for staff, permission
  presets, and work-phone access lists while retaining no-query v6.1 array
  responses and matching the Web Admin table URL contract.
- OpenAPI response status and schema validation across the acceptance suite.

### Fixed

- Work-phone list rows now expose the documented top-level `phone` field.
- OTP request, OTP verification, and token refresh return their documented
  HTTP 200 status codes.
- Product image responses no longer leak the undocumented `product_id` field.
- Product variant responses now document nullable `attributes` as emitted for
  variants without attribute metadata.
- The protected category-create operation now documents its reachable 401 response.
- Category updates now document their reachable 422 validation response.
- Customer shopping operations now document the work-account 403 response.
- Wishlist creation now documents its reachable 422 validation response.
- Cart item creation now documents its reachable 422 validation response.
- Customer and admin order conflict responses now declare the standard JSON
  error schema.
- Return request, inspection, and completion operations now document their
  reachable not-found and conflict responses.
- Return items now allow the nullable pre-inspection `condition` emitted by the API.

## 6.1.0 - 2026-09-28

### Added

- A durable bilingual notification inbox for every account type, with synced
  unread state and recipient-specific deep links.
- Short-lived single-use SSE tickets, Redis-backed live delivery, heartbeats,
  and persisted sequence replay through `Last-Event-ID` or `since`.
- Dedicated read-only order-monitor list/detail APIs with server-side combined
  filters, Arabic-normalized search, Baghdad date boundaries, and chip counts.

### Changed

- Notification push and SMS attempts are now downstream deliveries from the
  saved inbox event rather than the notification history source of truth.
- Removed the obsolete `orders.manage` permission data; order administration
  continues to use the Phase 1 fine-grained permission registry.

## 6.0.0 - 2026-09-27

### Breaking

- Authentication tokens now carry an immutable `surface` (`admin` or `app`).
  Phone OTP issues app-only tokens; staff username/password login issues
  admin-only tokens. Refresh and logout preserve the original surface.
- Phone roles are now exactly `customer`, `delivery_agent`, or
  `order_monitor`, assigned by the server. The legacy `delivery` role and
  client-supplied roles are no longer accepted.
- Coarse staff roles and permissions were replaced with multi-preset and
  per-user grants from the fine-grained permission registry. Existing admin
  clients must use the new staff, preset, and work-phone endpoints.
- Work accounts are API-blocked from cart, checkout, wishlist, addresses,
  reviews, returns, and loyalty redemption. Order monitors are read-only.

### Added

- Argon2id staff passwords, password policy, audited login attempts, lockout,
  temporary-password change enforcement, and immediate session revocation.
- Deny-by-default route policy metadata and a full registered-route
  authorization matrix test.
- Audited staff, preset, grant, and work-phone management APIs, plus a reusable
  separation-of-duties helper.

See `api/CLIENT_MIGRATION_6.0.md` for mobile and web client changes.

## 5.5.0 - 2026-09-27

### Added

- Customer-owned wishlist list/add/remove endpoints matching the existing
  contract, with idempotent adds, server-time catalog pricing, effective
  category visibility, stable pagination, audit records, and seeded examples.
- `GET /me/reviews` for paginated caller-owned review history across pending,
  published, and rejected moderation states, including current product names.

## 5.4.0 - 2026-09-21

### Added

- Permissioned staff order list/detail, pre-dispatch transitions, and audited
  cancellation endpoints under `/admin/orders`.
- Explicit `held`, `deducted`, and `released` lifecycle state for checkout stock
  holds, plus delivered COD payment reconciliation and audit records.

### Changed

- Canonical order statuses now use `preparing`, `ready_for_dispatch`,
  `dispatched`, and `failed`; dispatch reuses the checkout-created delivery and
  the existing delivery-agent assignment flow.

## 5.3.0 - 2026-09-21

### Added

- `ProductPatch.variants[].id`: an optional stable handle that lets a product
  update rename a variant SKU without the variant losing its identity.

### Changed

- Public product reads now apply effective category visibility, so a hidden
  category hides its whole descendant subtree even when `?category_id=` names
  a visible child. Staff and admin reads are unchanged.
- A product update reconciles its variants in place instead of deleting and
  recreating them, so variant ids survive an edit. Removing a variant that
  inventory, cart, purchasing or order history still references is now
  rejected with 422 instead of failing as a 500.
- PATCH validation runs against the merged stored+incoming product state: a
  partial amount-discount update no longer demands a `price` that is already
  stored, and an explicit null on a non-nullable field returns 422 rather
  than reaching the database as a 500.
- `contact_phone` is trimmed before storage and must be an E.164 number on
  both address create and PATCH; blank, whitespace-only and malformed values
  are rejected with 422.

### Fixed

- `schema.prisma` now declares `onUpdate: NoAction` on the nine relations that
  omitted it, matching the migrations, `infra/db/schema.sql` and the migrated
  database. A from-scratch migrate reports zero drift, and CI gates it with
  `npm run prisma:drift-check`.
- Regenerated the web OpenAPI client types, which were still pinned to the 4.x
  contract, and corrected the return-status map and per-line return reason the
  stale types were masking.

## 5.2.0 - 2026-09-20

### Added

- Account-owned device registration and deactivation, per-type/channel notification
  preferences, and paginated notification history.
- Transactional notification outbox, BullMQ fan-out worker, bilingual templates,
  development push/SMS drivers, and audited token and preference changes.
- Notification attempt history and a disposable-database worker acceptance suite.

### Changed

- Order, delivery, return, loyalty earn, and review moderation events now write
  notification outbox records in their domain transactions.

## 5.1.0 - 2026-09-20

### Added

- Verified-purchase product review creation, owner edits/deletes, staff moderation,
  and published-only public review reads.
- One-review-per-order-line constraint, persisted reviewed flag, moderation
  metadata, and a published-review count beside the reconciled rating average.
- Seeded approved and pending reviews plus disposable-database acceptance tests.

### Changed

- Product rating average and count are recomputed from published review rows
  in the same transaction as each review mutation.

## 5.0.0 - 2026-09-20

### Added

- Append-only loyalty points ledger with balance derived from entries, earn-on-delivery,
  customer redemption, staff reads and audited manual adjustments.
- Admin validation and audit records for the existing negotiable product floor and
  points-price fields; customer negotiation remains data-only.

### Changed

- Removed the mutable loyalty-account balance. Existing cached balances are
  reconciled into ledger adjustments during migration.

## 4.9.0 - 2026-09-20

### Added

- Customer line-level partial return requests, staff return queue and per-line
  condition review, and a reviewed-return completion endpoint.
- Sellable return stock movements tied to return lines and a COD refund
  obligation ledger calculated from immutable order-line price snapshots.
- A completed partial-return seed example and disposable-database acceptance
  coverage for eligibility, restock, refund rounding, and audit entries.

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

# Changelog

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

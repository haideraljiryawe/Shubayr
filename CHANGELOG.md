# Changelog

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

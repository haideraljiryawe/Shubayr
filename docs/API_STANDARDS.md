# API validation, PATCH, and money standards

## Errors and validation

Every JSON error has the same envelope: `status`, stable uppercase `code`, a
human-readable `message`, and an `errors` array. DTO/query/path validation uses
HTTP 422 with `VALIDATION_FAILED`. Each field error contains its dotted `field`
path, the stable validator `code`, and a message. Authentication, authorization,
missing resources, conflicts, throttling, and unexpected failures use 401, 403,
404, 409, 429, and 500 respectively. Clients branch on `status`/`code`, never
message text.

Unknown request properties and read-only response properties are rejected by
the global whitelist. JSON `null` is valid only where OpenAPI explicitly marks
a property nullable.

## PATCH semantics

PATCH is partial: an omitted property is unchanged. Explicit `null` clears an
explicitly nullable property. An empty patch is invalid. For product pricing,
`discount_type: null` atomically clears the type, value, and both schedule
bounds; omitting all discount properties preserves the complete scheduled
discount. Editing a name, description, or media therefore cannot rewrite it.

## Financial precision and rounding

- API money is a decimal JSON number with at most two fractional digits.
- PostgreSQL stores money as `NUMERIC(*,2)`; percentages also allow at most two
  fractional digits.
- Services and cart/checkout calculations convert values to integer minor units.
- Multiplication and percentage calculations round once at the resulting money
  boundary, to two decimals, with ties away from zero.
- Cart line totals, checkout totals, order snapshots, filters, and product
  responses use the same calculation helpers. Stored order amounts are never
  recomputed after checkout.

Example: a 50% discount on `20.15` is `10.075`, which becomes `10.08`.

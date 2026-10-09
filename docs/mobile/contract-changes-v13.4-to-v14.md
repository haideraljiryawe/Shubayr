# Mobile app: API contract changes from 13.4.0 to 14.0.0

Contract 14.0.0 is a breaking release because refusal-code behavior is now
specific and one staff response moved cash activity to its own endpoint. No
file in `mobile/` or on a protected mobile branch is changed by this release.

## Mobile-facing behavior

Customer cart and order refusals no longer collapse to generic codes such as
`CONFLICT` or `FORBIDDEN`. Mobile must branch on the stable `code` field and
localize it; it must not match the English `message`. Relevant codes include:

- cart and checkout: `IDEMPOTENCY_KEY_REUSED`, `CART_EMPTY`,
  `CART_QUANTITY_INVALID`, `CART_PRODUCT_UNAVAILABLE`,
  `CART_VARIANT_UNAVAILABLE`, `CART_SKU_UNAVAILABLE`,
  `REQUESTED_QUANTITY_UNAVAILABLE`, `SKU_WHOLE_UNITS_ONLY`, `COUPON_INVALID`,
  and `PRICE_CHANGED`;
- customer order reads and changes: `ORDER_ACCESS_FORBIDDEN`,
  `CANCELLATION_REQUEST_NOT_ALLOWED`,
  `CANCELLATION_REQUEST_ALREADY_PENDING`, `QUANTITY_REDUCTION_NOT_PENDING`,
  `PAID_COD_CANCELLATION_FORBIDDEN`, `ORDER_TRANSITION_NOT_ALLOWED`, and
  `STALE_ORDER_STATE`.

HTTP statuses do not change. Request bodies, successful customer order/cart
responses, delivery-agent assigned work, custody, and delivery mutation shapes
are unchanged.

## Staff-only changes

- `GET /admin/delivery-parties/{id}/statement` no longer contains
  `cash_activity`. Use the independently paginated
  `GET /admin/delivery-parties/{id}/cash-activity` endpoint.
- `GET /admin/cash-receipts/reconciliation` exposes overall and per-party
  receipt subledger totals.
- Voucher and unallocated-receipt lists accept `sort_by=date|amount` and
  `sort_direction=asc|desc`; the default is newest first.
- Vouchers, allocations, reversals, custody exceptions, trips, purchases,
  payments, and price approvals include actor display-name fields beside actor
  IDs.
- Cash-receipt, custody-exception, trip, purchasing, inventory, product, and
  approval refusals now expose route-declared specific codes.

These operations remain admin-only and must not be added to the delivery-agent
mobile surface.

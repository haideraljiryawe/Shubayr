# Mobile app: API contract changes from 14.1.0 to 14.2.0

Contract 14.2.0 is additive and non-breaking. No file in `mobile/` or either
protected mobile branch is changed.

## Delivery-agent detail

- `GET /deliveries/{id}` returns the assigned delivery's order number, amount
  due, recipient, immutable shipping address, and item list.
- Each item includes bilingual product names, variant ID/SKU/attributes,
  decimal quantity, `base_unit`, `whole_units_only`, price and currency.
- A delivery assigned to another agent returns 404.
- For `delivered` and `returned`, `recipient_name`, `recipient_phone`, and
  `shipping_address` are null. The mobile app must clear cached contact data
  when it observes either terminal status.

## Customer account deletion

- `DELETE /me/account` succeeds with 204, revokes every session and releases
  the verified phone for a later new registration.
- A 409 `ACCOUNT_DELETION_BLOCKED` response can include `OPEN_ORDERS`,
  `PENDING_RETURNS`, and `UNSETTLED_AMOUNTS` entries. Show those blockers and
  keep the customer signed in.
- After 204, delete local tokens and customer data and return to signed-out
  navigation. The current access token is invalid immediately.

## Unit snapshots on orders and returns

- `OrderItem` and `ReturnItem` add required `base_unit` and
  `whole_units_only`. These are snapshots captured at checkout and remain
  valid even if the catalog product is later hidden or changed.
- Use the snapshot beside every historical quantity and when validating a
  return quantity. Do not fetch the current catalog SKU for this decision.

## Monitor and public settings

- `GET /monitor/orders` rows now include required `currency`. Format the row's
  total with that value, not the current store default.
- `GET /settings` now returns the already-declared
  `default_low_stock_threshold` and `sale_rounding_multiple`. Both are decimal
  strings. The fields remain public because clients need the store's stock
  label and linked-sale rounding policy; neither is cost or private data.

## Push delivery

The device-token API shape is unchanged. Production now sends registered
Android and iOS Firebase tokens through FCM HTTP v1. Tokens rejected by FCM as
invalid are deactivated, so the app should re-register its current token after
sign-in and whenever Firebase rotates it.

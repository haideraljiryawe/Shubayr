# Mobile app: API contract changes from 14.0.0 to 14.1.0

Contract 14.1.0 is additive. No file in `mobile/` or either protected mobile
branch is changed.

## Delivery-agent behavior

- Existing `PATCH /deliveries/{id}` requests still work. When the delivery is
  part of a customer-paid external-driver trip, a confirmed
  `collected_amount` is the total paid by the customer, including the fare. The
  server removes the pass-through fare before recording store cash custody.
- A customer-paid trip may now contain an order with a nonzero delivery fee.
  That fee must equal the order's fare share. It is collected and kept by the
  driver, and is never store revenue or store cash.
- Existing zero-delivery-fee orders remain compatible: their separately
  accepted direct-fare share stays outside the order total and store accounts.
- The new 409 `TRIP_FARE_SHARE_MISMATCH` means the trip fare share does not
  equal the order delivery fee. Mobile clients should localize the code and not
  match the English message.
- Delivery events recorded through the existing per-delivery route also appear
  in external-driver trip history.

## Staff-only additions

- `POST /admin/deliveries/{id}/return-at-door` performs delivery, confirmed
  short collection, return posting and original-cost restock atomically.
- External-driver trip order event routes are available for `delivered`,
  `failed`, `return-at-door` and `lost` outcomes.
- `GET /admin/external-driver-trips/{id}/close-preview` returns the exact close
  settlement, fare postings and blocking orders without changing state.
- `GET /admin/orders/{id}/goods` returns delivered lines with quantities already
  returned or refused and the remaining returnable quantity.
- Trip history now includes `delivered`, `failed`, `return_at_door` and `lost`
  event types with the recording staff member and timestamps.

These routes remain admin-only and must not be added to customer or delivery-
agent navigation without a separately approved mobile workflow.

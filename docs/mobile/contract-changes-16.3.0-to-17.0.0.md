# Mobile contract changes: 16.3.0 to 17.0.0

Contract 17.0.0 introduces the customer-facing returns v2 workflow. The major
version is intentional: the old staff `inspect` payload and `complete` action
are replaced by separate approval, receipt, inspection, and refund actions.
Customer return creation also now requires an operation id. There is no
delivery-agent application work in this release.

## Checkout loyalty snapshot

`POST /orders` accepts optional `loyalty_points` (an integer greater than or
equal to zero). Points apply only to goods after the selected coupon or
automatic tier discount; they never pay the delivery fee. Handle:

- `LOYALTY_POINTS_INSUFFICIENT` when the current ledger balance is too small;
- `LOYALTY_REDEMPTION_EXCEEDS_GOODS` when points would reduce goods below zero.

Order and order-item responses now expose the immutable redemption and
allocation snapshots. In particular, `net_paid_total` is the source used for
later return entitlements. The app must display these server values and must
not recalculate a return from current catalog prices.

## Requesting and reading a return

Customers use `POST /returns` with:

```json
{
  "operation_id": "device-generated-stable-id",
  "order_id": "uuid",
  "reason": "optional overall note",
  "items": [
    {
      "order_item_id": "uuid",
      "quantity": 0.25,
      "reason_code": "defect",
      "reason": "Package was damaged"
    }
  ]
}
```

Keep the same `operation_id` when retrying the same request after a timeout.
Piece SKUs require whole quantities. Weight or volume SKUs accept up to three
decimal places according to the order-time `whole_units_only` and `base_unit`
snapshots. The server refuses quantities beyond delivered units less all prior
non-rejected returns.

The published return window defaults to 14 Baghdad business dates. Handle the
declared `RETURN_WINDOW_EXPIRED`, `RETURN_QUANTITY_EXCEEDS_ELIGIBLE`,
`RETURN_QUANTITY_PRECISION`, and `SKU_WHOLE_UNITS_ONLY` errors.

Use `GET /returns` for the customer's paginated history and
`GET /returns/{id}` for an owned return. Another customer's id returns 404.
Responses include:

- requested and approved quantities, reason and condition per line;
- the exact stored refund share and delivery-fee refund;
- `points_effect.earned_reversed`, `redeemed_restored`, and `net`;
- refund source/payment references and the immutable event timeline.

Render these states directly from the server:

`requested -> approved/partially_approved/rejected -> received -> inspected -> refunded`

Approval, rejection, and refund create normal inbox/push notifications. A
negative points effect is a loyalty balance/future-reward adjustment; the app
must not present it as extra cash deducted from the refund.

## Delivery fee and refund display

The delivery fee is refunded automatically only for a full return caused by a
store error, wrong item, or defect. An authorised staff exception may differ,
but all returns together can never refund more than the delivery fee charged
on the order, including a confirmation-time adjusted fee. Display the returned
`delivery_fee_refund`, `uncollected_offset`, and `cash_refund_amount` separately
so a partly unpaid COD order is understandable.

## Removed v1 staff flow

Admin clients must stop sending the old decision/condition payload to
`POST /returns/{id}/inspect` and must stop calling
`POST /returns/{id}/complete`. Regenerate from OpenAPI 17.0.0 and use the four
staff transitions declared there. Customer apps do not call those staff
routes.

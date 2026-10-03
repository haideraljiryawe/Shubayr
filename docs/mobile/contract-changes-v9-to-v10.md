# Mobile app: API contract changes from 9.0.0 to 10.0.1

For: the Flutter app (customer, delivery agent, order monitor).
Compared on 2026-10-03. Follows
[contract-changes-v6-to-v9.md](contract-changes-v6-to-v9.md).

## What was compared

- **App code:** the `mobile` branch at `a7afc50`. Every call the remote
  repositories make for orders, checkout, deliveries and notifications was
  checked in `mobile/lib`.
- **Contract:** `api/openapi.yaml` at 9.0.0 (`318a3cb`, #77), 10.0.0
  (`3f6fd7d`, #80, order lifecycle v2) and 10.0.1 (`bd8d124`, #82).
  10.0.1 only touches admin supplier payments and exchange-rate errors; the
  app does not call those routes.
- **Examples:** captured from a real 10.0 API with seeded data. Ids are
  shortened.

Each item has a status:

- **To do:** the app must change, or a call fails.
- **New:** a new feature the app may add; nothing breaks without it.
- **Ignore:** not for the app.

## Start here: what breaks the app today

| # | What | Where it breaks | Section |
|---|---|---|---|
| 1 | Cancelling an order needs the order's `version` | `cancelOrder` posts no body, so **every cancel answers 422**. | [A](#a-order-changes-carry-the-orders-version-to-do) |
| 2 | Only a *pending* order can be cancelled | `isOrderCancellable` still offers cancel on `confirmed` (and `processing` in mock), which now answers 409. | [B](#b-cancel-while-pending-request-cancellation-afterwards-to-do) |
| 3 | Delivery updates need `order_version`, and "failed" needs a reason | `updateStatus` sends only `{status}`, so **every agent action answers 422**. | [C](#c-delivery-updates-to-do) |
| 4 | Placing an order can answer 409 `PRICE_CHANGED` | Checkout shows a generic error, and trying again gives the same 409: the shopper cannot order until the new prices are accepted. | [D](#d-price-changes-at-checkout-to-do) |
| 5 | A failed delivery can be retried | `Delivery.nextStatuses` has nothing after `failed`, so the agent cannot retry from the app. | [C](#c-delivery-updates-to-do) |

---

## A. Order changes carry the order's version (To do)

**Version:** 10.0.0. **Affects:** order detail (cancel), and the new calls in
B and F.

Every request that changes an order sends the order's current `version`
(an integer, at least 1). `Order.version` is in every order read
(`GET /orders`, `GET /orders/{id}`, the `POST /orders` response). If someone
else changed the order in the meantime, the API refuses with 409 and tells you
where the order is now:

```json
{
  "status": 409,
  "code": "STALE_ORDER_STATE",
  "message": "The order changed while you were working",
  "errors": [
    {
      "field": "version",
      "code": "STALE_ORDER_STATE",
      "message": "The order changed while you were working",
      "current_status": "pending",
      "current_version": 1
    }
  ]
}
```

What to do: add `version` to the `Order` model, send it, and on a 409 reload
the order and show it again (do not retry blindly).

Sending no version gives 422:

```json
{
  "status": 422,
  "code": "VALIDATION_FAILED",
  "errors": [
    { "field": "version", "code": "min", "message": "version must not be less than 1" },
    { "field": "version", "code": "isInt", "message": "version must be an integer number" }
  ]
}
```

## B. Cancel while pending, request cancellation afterwards (To do)

**Version:** 10.0.0. **Affects:** order detail.

| Order status | What the shopper can do | Call |
|---|---|---|
| `pending` | Cancel directly | `POST /orders/{id}/cancel` `{ "version": 1 }` |
| `confirmed`, `preparing`, `ready_for_dispatch`, `dispatched`, `failed` | Ask the store to cancel | `POST /orders/{id}/cancellation-request` `{ "version": 2, "reason": "Ordered by mistake" }` |
| anything else | Nothing | |

Cancelling a confirmed order now answers 409 `CONFLICT` ("Order status
transition is not allowed"). Change `isOrderCancellable` to `pending` only,
and offer the request instead for the statuses above.

The request is answered by the store (approved or denied, with a note). The
order shows where it stands in `cancellation_request`:

```json
"cancellation_request": {
  "status": "denied",
  "reason": "Ordered by mistake",
  "requested_at": "2026-10-02T23:35:06.518Z",
  "resolved_at": "2026-10-02T23:35:06.534Z",
  "resolution_note": "Already packed"
}
```

- `status` is `pending`, `approved` or `denied`; the field is `null` when the
  shopper never asked.
- While it is `pending`, do not offer the request again (the API answers 409).
- After `denied`, the shopper may ask again.
- `approved` cancels the order (`status` becomes `cancelled`). If the order
  had left the store, the store collects the goods back first.

Note: the shopper gets an `order_status_changed` notification when an
approved request cancels the order, but **no notification when it is
denied**. Re-read the order when the screen opens.

## C. Delivery updates (To do)

**Version:** 10.0.0. **Affects:** delivery agent screens.

`PATCH /deliveries/{id}` now takes:

| Field | Required | Meaning |
|---|---|---|
| `status` | yes | `out_for_delivery`, `delivered`, `failed` or `returned` (unchanged) |
| `order_version` | **yes** | `Delivery.order_version` from the last read |
| `reason` | with `failed` | Why it failed, 1–500 characters |

`Delivery` gains `order_version` (always present), `failure_reason`,
`failed_at` and `retry_count`.

Allowed moves:

- `assigned` → `out_for_delivery`
- `out_for_delivery` → `delivered` or `failed`
- **`failed` → `out_for_delivery`**: a retry. The goods stay with the agent.
- `delivered` → `returned`

After a failure:

```json
{
  "id": "7cab21c3…",
  "order_id": "903b7651…",
  "order_version": 8,
  "status": "failed",
  "failure_reason": "Customer not answering",
  "failed_at": "2026-10-02T23:35:06.675Z",
  "retry_count": 0
}
```

After the retry, `status` is `out_for_delivery`, `retry_count` is 1,
`failure_reason` is `null` again, and `failed_at` keeps the last failure time.
Show the retry count while it is above 0.

Errors the agent can now hit:

- 422 without `order_version`, or `failed` without a `reason`.
- 409 `STALE_ORDER_STATE` when the order changed meanwhile (same shape as in
  A; `current_version` is the new `order_version`). The app already shows
  `deliveryStatusConflict` on 409; also reload the delivery.

## D. Price changes at checkout (To do)

**Version:** 10.0.0. **Affects:** cart, checkout.

The cart remembers the price each line was added at. If a price changed since
then, `POST /orders` places nothing and answers 409 with one entry per SKU:

```json
{
  "status": 409,
  "code": "PRICE_CHANGED",
  "message": "One or more prices changed and require acceptance",
  "errors": [
    {
      "field": "variant.ff80b46e…",
      "code": "PRICE_CHANGED",
      "message": "The price for DOC-MURLP0CF changed",
      "product_id": "ce727e98…",
      "variant_id": "ff80b46e…",
      "sku": "DOC-MURLP0CF",
      "old_price": 9000,
      "new_price": 12000,
      "old_price_version": "ff80b46e:1790984105897:9000",
      "new_price_version": "ff80b46e:1790984105897:12000"
    }
  ]
}
```

What to do:

1. Show each line old → new (prices can go up or down) with
   "Accept new prices" and "Back to cart".
2. To accept, send the same order again **with the same `Idempotency-Key`**
   plus the versions:

   ```json
   {
     "address_id": "10000000…",
     "payment_method": "cod",
     "accepted_price_versions": [
       { "variant_id": "ff80b46e…", "price_version": "ff80b46e:1790984105897:12000" }
     ]
   }
   ```

   This answers 201. The order records what was accepted in
   `price_change_info`:

   ```json
   "price_change_info": {
     "lines": [{ "variant_id": "ff80b46e…", "unit_price": 12000, "price_version": "ff80b46e:1790984105897:12000" }],
     "accepted_at": "2026-10-02T23:35:06.212Z"
   }
   ```

3. If a price changes again before the shopper accepts, the API answers a new
   `PRICE_CHANGED`; show the dialog again.

The cart can warn before checkout. Each `Cart.items[]` line now has
`price_version`, `current_unit_price`, `current_price_version` and
`price_changed`. `unit_price` stays the price the line was added at:

```json
{ "unit_price": 9000, "current_unit_price": 12000, "price_changed": true }
```

The `errors[]` entries carry fields the app's `ApiFieldError` does not parse
yet (`variant_id`, `sku`, `old_price`, `new_price`, `new_price_version`). Add
them, or read the raw JSON for this one code.

## E. New order fields and the timeline (New)

**Version:** 10.0.0. **Affects:** order detail and history.

All order reads (`GET /orders`, `GET /orders/{id}`) gain:

| Field | Type | Use in the app |
|---|---|---|
| `version` | integer | Needed by A, B and F. |
| `cancellation_request` | object or null | See B. |
| `attention_details` | object or null | See F (`reduction_proposal`). |
| `inventory_attention_required` | boolean | The store is short on stock for this order. Optional to show. |
| `timeline` | array of `{status, note, at}` | Same events as `GET /orders/{id}/track`, inline. |
| `price_change_info` | object or null | See D. |
| `acceptance_deadline`, `auto_cancel_deadline`, `late_for_acceptance` | date-time / boolean | Store-side acceptance timers. **Ignore.** |
| `retrievals` | array | Store documents for collecting goods back. **Ignore.** |

The order statuses are unchanged since 9.0.0. With the new lifecycle the
timeline (and `/track`) regularly contains `preparing`, `ready_for_dispatch`
and `failed` steps; the app already labels all of them.

## F. Accept or decline a smaller quantity (New)

**Version:** 10.0.0. **Affects:** order detail.

When the store comes up short while preparing, it can propose a smaller
quantity for one line. The order then carries:

```json
"attention_details": {
  "short_lines": [
    { "order_item_id": "…", "variant_id": "…", "requested": 3, "allocated": 1, "short": 2 }
  ],
  "reduction_proposal": {
    "order_item_id": "…",
    "old_quantity": 3,
    "new_quantity": 1,
    "reason": "Only one left",
    "status": "pending",
    "requested_by": "…",
    "requested_at": "…"
  }
}
```

While `reduction_proposal.status` is `pending`, ask the shopper and send:

`POST /orders/{id}/shortage-response` `{ "version": 5, "decision": "accepted" }`
(or `"denied"`)

Accepting lowers the line and the totals. Declining leaves the store to cancel
the line or the order. `attention_details` is not typed in the contract yet
(it is a free-form object), so parse it defensively.

Note: the shopper gets **no notification** when a reduction is proposed, so
show the prompt when the order screen opens.

## G. Notifications (Ignore)

Two new types: `order_acceptance_late` and `retrieval_update`. Both go to
staff only (the Web Admin inbox), never to a customer, agent or monitor. The
app reads the notification `type` nowhere, so nothing breaks.

---

## Operations the app uses

| Operation | Changed in 10.0? | Section |
|---|---|---|
| `POST /orders` | Yes: 409 `PRICE_CHANGED`, optional `accepted_price_versions` | D |
| `POST /orders/{id}/cancel` | Yes: body `{version}` required; pending only | A, B |
| `GET /orders`, `GET /orders/{id}` | Yes: new fields | E |
| `GET /orders/{id}/track` | No (more statuses appear in practice) | E |
| `GET /cart` and cart writes | Yes: price-change fields on lines | D |
| `PATCH /deliveries/{id}` | Yes: `order_version` required, `reason` for failed, retry move | C |
| `GET /deliveries/assigned` | Yes: new `Delivery` fields | C |
| `GET /monitor/orders`, `GET /monitor/orders/{id}` | No change the app relies on | |
| `GET /me/notifications` | Two new staff-only types | G |
| New: `POST /orders/{id}/cancellation-request` | | B |
| New: `POST /orders/{id}/shortage-response` | | F |

## Known contract gaps (reported to the backend)

- `STALE_ORDER_STATE`, `PRICE_CHANGED` and the other new codes are not
  declared on the routes yet. Route on `code` anyway; the values above are
  what the API sends.
- The `POST /orders/{id}/cancel` description still says "pending or
  confirmed". The API allows pending only.
- `attention_details` and `price_change_info` are untyped objects.
- The stale-version 409 from `PATCH /deliveries/{id}` names the field
  `version`, while the request field is `order_version`.

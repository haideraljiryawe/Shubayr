# Mobile app: API contract changes from 11.2.0 to 12.0.0

For: the Flutter app (delivery agent first; customer and order monitor are
unaffected). Compared on 2026-10-04. Follows
[contract-changes-v10-to-v11.md](contract-changes-v10-to-v11.md).

## What was compared

- **App code:** the `mobile` branch at `8d4c6d1`: the delivery feature in
  `mobile/lib/features/delivery` (`delivery_repository_remote.dart`,
  `delivery_providers.dart`, `delivery_home_screen.dart`, `delivery.dart`).
- **Contract:** `api/openapi.yaml` at 11.2.0 and at 12.0.0. 12.0.0 is #92:
  revenue and COD collection are recorded when a delivery is marked delivered.
- **Examples:** captured from a real 12.0 API with seeded data, on an order
  of 25,000 IQD. Ids are shortened.

Each item has a status:

- **Breaks:** the app fails against 12.0 today.
- **To do:** the app must change to use something new.
- **New:** optional; nothing breaks without it.

## Start here

**One thing breaks: the agent can't mark a delivery delivered.** 12.0 needs
to know what was collected, and the app still sends the 11.x body, so the
API answers 422 and the order stays out for delivery. Every other status
(start, fail, retry, returned) works as before.

| # | What | Status | Section |
|---|---|---|---|
| 1 | Delivered needs `operation_id` and `collection_confirmation` (and `collected_amount` when confirmed) | **Breaks** | [A](#a-delivered-needs-the-cash-collected-breaks) |
| 2 | An amount-collected step before "delivered" | To do | [B](#b-the-amount-collected-step-to-do) |
| 3 | The delivery shows what was recorded: `Delivery.collection` | New | [C](#c-the-recorded-collection-new) |
| 4 | The agent's custody now holds cash | New | [D](#d-cash-in-the-agents-custody-new) |

Still open from 10.0 and 11.x (unchanged): cancel only while pending, the
cancellation request and shortage answer, the three customer notifications,
and the attempt history.

---

## A. Delivered needs the cash collected (Breaks)

**Version:** 12.0.0. **Affects:** `PATCH /deliveries/{id}` with
`status: "delivered"` — `DeliveryRepositoryRemote.updateStatus`.

The app sends today:

```json
{ "status": "delivered", "order_version": 5 }
```

and 12.0 answers:

```json
{
  "status": 422,
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "errors": [
    { "field": "operation_id", "code": "isString", "message": "operation_id must be a string" },
    { "field": "collection_confirmation", "code": "isIn", "message": "collection_confirmation must be one of the following values: confirmed, unconfirmed" }
  ]
}
```

(The real answer also lists the length rules for `operation_id`.)

For `delivered` the body now needs:

| Field | Rule |
|---|---|
| `operation_id` | 8–128 characters. One per delivery request (see below). |
| `collection_confirmation` | `confirmed` (the agent states the amount) or `unconfirmed` (the store confirms it later). |
| `collected_amount` | Required with `confirmed`, refused with `unconfirmed`. A decimal **string**, `^\d+(\.\d{1,6})?$`, from 0 up to the amount due. |

```json
{
  "status": "delivered",
  "order_version": 5,
  "operation_id": "delivery-8f0c0b6e-3c1d-4a51-9a8e-2f9f6f1b7c11",
  "collection_confirmation": "confirmed",
  "collected_amount": "20000"
}
```

The other statuses are unchanged: `out_for_delivery`, `failed` (with
`reason`) and `returned` send no collection fields.

### The operation id: why and how

Delivered now posts revenue, cost of goods and cash in one go, so it must
never post twice. The server keeps the first answer for each `operation_id`:

- **Same id, same body → the same answer again** (a replay, nothing posted
  twice). This is what a retry after a timeout, or a double tap, must send.
- **Same id, different body → 409:**

  ```json
  { "status": 409, "code": "CONFLICT", "message": "The operation id was already used with a different payload", "errors": [] }
  ```

So: create the id when the agent confirms an exact amount (or "not
confirmed"), keep it while retrying that same request, and create a new one
only if the agent changes the amount or the choice. The web store does this
(`web/src/lib/collection.ts`, `CollectionOperation`). The provider's
existing `_updating` guard already stops a second tap while the first is in
flight; the id covers the case where the answer was lost.

### What the API refuses

- An amount above what is due:

  ```json
  { "status": 422, "code": "VALIDATION_FAILED", "message": "collected_amount must be between zero and the order amount due", "errors": [] }
  ```

  Keep the step open and show the message.
- `collected_amount` with `unconfirmed`: 422.
- A stale `order_version`: 409 `STALE_ORDER_STATE`, as before — reload.

## B. The amount-collected step (To do)

**Affects:** the status dialog in `delivery_home_screen.dart`, and
`DeliveriesController.updateStatus` / `DeliveryRepository.updateStatus`
(which need the collection fields passed through).

When the agent picks "Delivered", ask what was collected before saving:

1. **"I collected the payment"** with an amount field (digits, Arabic-Indic
   digits accepted; send a plain decimal string), or
2. **"Amount not confirmed yet"** — the order is delivered now and the
   store confirms the amount later from its Web Admin.

Then send the body from section A.

**There is no amount due to pre-fill yet.** `Delivery` (from
`GET /deliveries/assigned`) has no order total or amount due before the
delivery; `collection.due_amount` appears only afterwards. The store's web
agent page has the same limit and asks the agent to type what the customer
paid; the server checks it. This is reported to the backend; when an amount
due is added to `Delivery`, pre-fill the field with it and show the
shortfall before saving.

Suggested wording, as the web store uses:

- "Payment collected" · "I collected the payment" · "Amount not confirmed yet
  — the order is delivered now; the store confirms the amount later."
- After saving: "Collected in full" / "Collected less than due — Shortfall
  5,000 IQD" / "Amount not confirmed yet".

## C. The recorded collection (New)

**Version:** 12.0.0. Every `Delivery` now has `collection`: `null` until the
delivery is marked delivered, then what was recorded. The answer to the
delivered `PATCH` already carries it.

Collected 20,000 of 25,000:

```json
"collection": {
  "id": "833037bc…",
  "delivery_id": "7ee2f862…",
  "order_id": "9d408f92…",
  "party_id": "0665f93f…",
  "status": "confirmed_short",
  "due_amount": 25000,
  "collected_amount": 20000,
  "shortfall_amount": 5000,
  "currency": "IQD",
  "delivered_at": "2026-10-04T09:55:12.507Z",
  "accounting_date": "2026-10-04",
  "confirmed_at": "2026-10-04T09:55:12.507Z",
  "delivery_journal_entry_id": "3cb9a706…",
  "confirmation_journal_entry_id": null
}
```

Not confirmed yet:

```json
"collection": {
  "status": "unconfirmed",
  "due_amount": 25000,
  "collected_amount": null,
  "shortfall_amount": null,
  "confirmed_at": null
}
```

- `status`: `confirmed_full`, `confirmed_short` or `unconfirmed`. When the
  store later confirms an unconfirmed one, it becomes full or short.
- Show the shortfall plainly on a short collection.
- `Delivery.fromJson` doesn't read `collection` today; nothing breaks, but
  the agent can't see what was recorded.

## D. Cash in the agent's custody (New)

`GET /deliveries/custody` (11.2, section E of the 11.x notes) now reports
real cash: the confirmed COD the agent holds, and how old the oldest is.

```json
"cash": { "currency": "IQD", "amount": 85487, "oldest_age_days": 0 }
```

`amount` was always 0 and `oldest_age_days` always `null` in 11.2. An
unconfirmed collection adds nothing until the store confirms it.

---

## Operations the app uses

| Operation | Changed in 12.0? | Section |
|---|---|---|
| `PATCH /deliveries/{id}` | **Yes: delivered needs the collection fields** | A, B |
| `GET /deliveries/assigned` | Yes: `Delivery.collection` | C |
| `GET /deliveries/custody` | Yes: real cash | D |
| Everything else the app calls | No | |

Staff-only additions the app never calls (**Ignore**): staff delivery on a
party's behalf with `source` and `event_at`, `GET /admin/deliveries/unconfirmed`,
and `POST /admin/deliveries/{id}/collection-confirmation`.

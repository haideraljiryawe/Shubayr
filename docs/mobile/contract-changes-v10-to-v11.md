# Mobile app: API contract changes from 10.0.2 to 11.2.0

For: the Flutter app (customer, delivery agent, order monitor).
Compared on 2026-10-03. Follows
[contract-changes-v9-to-v10.md](contract-changes-v9-to-v10.md).

## What was compared

- **App code:** the `mobile` branch at `8d4c6d1`. Every call the remote
  repositories make for orders, checkout, deliveries and notifications was
  checked in `mobile/lib`.
- **Contract:** `api/openapi.yaml` at 10.0.2 and at 11.2.0:
  - 11.0.0 is #87: permissions, separation of duties, price approvals.
  - 11.1.0 is #88: queues, retrieval search, customer notifications,
    delivery attempts, typed payloads.
  - 11.2.0 is #91: delivery parties (internal agents and external drivers)
    and custody reads.
- **Examples:** captured from a real 11.1/11.2 API with seeded data. Ids are
  shortened.

Each item has a status:

- **Done:** the `mobile` code already handles it.
- **To do:** the app must change, or it misses something the customer now
  gets.
- **New:** optional; nothing breaks without it.
- **Ignore:** not for the app.

## Start here

**Nothing in 11.x breaks the app.** The 11.0.0 major version removed
`below_cost_originator_id` from staff-only request bodies, which the app never
sends. Everything else is additive.

From the 10.0 list, the app has done:
- the order `version` on cancel;
- `PRICE_CHANGED` with `accepted_price_versions`;
- delivery `order_version`, failure reason, retry count and the
  `failed → out_for_delivery` retry.

Still open from 10.0, and still breaking today:

| What | Where | Section |
|---|---|---|
| Cancel is for `pending` orders only | `isOrderCancellable` still allows `confirmed`, which answers 409. Offer a cancellation request instead (10.0 doc, section B). | [10.0 B](contract-changes-v9-to-v10.md#b-cancel-while-pending-request-cancellation-afterwards-to-do) |
| Cancellation requests and the reduced-quantity answer | Not called yet (`POST /orders/{id}/cancellation-request`, `POST /orders/{id}/shortage-response`). | [10.0 B, F](contract-changes-v9-to-v10.md#f-accept-or-decline-a-smaller-quantity-new) |

New in 11.x for the app:

| # | What | Status | Section |
|---|---|---|---|
| 1 | Three new customer notifications: a smaller quantity needs an answer; a cancellation request was approved or denied | To do | [A](#a-new-customer-notifications-to-do) |
| 2 | Delivery attempt history on the order and on the agent's delivery | To do | [B](#b-delivery-attempt-history-to-do) |
| 3 | The inbox can filter by `type` | New | [C](#c-filter-the-inbox-by-type-new) |
| 4 | A stale delivery update names the field `order_version` | Done (harmless) | [D](#d-small-corrections-ignore-or-done) |
| 5 | The agent can read their own custody: goods held, how old | New | [E](#e-the-agents-own-custody-new) |
| 6 | A delivery names its `party` (`party_id`, `party`) next to `agent_id` | New | [E](#e-the-agents-own-custody-new) |

---

## A. New customer notifications (To do)

**Version:** 11.1.0. **Affects:** the customer inbox and order screen.

Three types reach the customer's inbox. They are also sent as push
notifications through the existing outbox.

| `type` | When | What the app should do |
|---|---|---|
| `quantity_reduction_proposed` | The store came up short while preparing and proposes a smaller quantity | Mark it as **needing an answer** and open the order, where the customer accepts or declines (`POST /orders/{id}/shortage-response`, 10.0 doc section F) |
| `cancellation_request_approved` | The store approved the customer's cancellation request | Open the order (now `cancelled`) |
| `cancellation_request_denied` | The store denied it | Open the order; `cancellation_request.resolution_note` says why |

Example (`GET /me/notifications?type=quantity_reduction_proposed`):

```json
{
  "id": "ac7405e0…",
  "type": "quantity_reduction_proposed",
  "target_role": "customer",
  "title_ar": "اقتراح تعديل الكمية",
  "body_ar": "اقترح المتجر كمية أقل لطلبك وتحتاج إلى ردك.",
  "title_en": "Quantity change proposed",
  "body_en": "The store proposed a lower quantity and needs your answer.",
  "deep_link": "/orders/ceb349c9…",
  "entity_type": "order",
  "entity_id": "ceb349c9…",
  "read_at": null,
  "created_at": "2026-10-03T19:59:05.969Z"
}
```

Titles and bodies arrive localized, so the inbox already shows these
correctly. What the app misses today:

- **The `type` field.** `InboxNotification.fromJson` doesn't read it, so the
  app can't single out the one that needs an answer.
- **The notification preferences screen.** The three types can be listed
  there; they are valid `NotificationPreferenceEntry` types.

## B. Delivery attempt history (To do)

**Version:** 11.1.0. **Affects:** customer order detail and the agent's
delivery screen.

Every delivery attempt is kept, oldest first. A retry adds an attempt instead
of overwriting the earlier failure:

- **customer:** `Order.delivery_attempts` (`GET /orders/{id}`);
- **agent:** `Delivery.attempts` (`GET /deliveries/assigned`).

```json
"delivery_attempts": [
  {
    "id": "0f0c9aa6…",
    "delivery_id": "eabc3e8a…",
    "attempt_number": 1,
    "status": "failed",
    "reason": "Customer not answering",
    "started_at": "2026-10-03T20:03:08.226Z",
    "completed_at": "2026-10-03T20:03:08.279Z",
    "party": { "id": "e7987e18…", "name": "Development Delivery" }
  },
  {
    "attempt_number": 2,
    "status": "delivered",
    "reason": null,
    "started_at": "2026-10-03T20:03:08.309Z",
    "completed_at": "2026-10-03T20:03:08.331Z",
    "party": { "id": "e7987e18…", "name": "Development Delivery" }
  }
]
```

- `status` is `out_for_delivery` (still on its way), `delivered` or `failed`.
- `reason` is the agent's note on a failure, otherwise `null`.
- `Delivery.retry_count` and `failure_reason` (10.0) still describe only the
  latest attempt; the history is here.

Suggested customer wording, as the web store does:

- "Attempt 1 · We couldn't deliver · 3 Oct 23:03 — Courier's note: Customer
  not answering"
- "Attempt 2 · Delivered · 3 Oct 23:03"

**Don't show `party.name` to customers.** Who carried the order is internal;
the web store never shows it. The customer response still carries it, so this
is reported to the backend.

## C. Filter the inbox by type (New)

**Version:** 11.1.0.

`GET /me/notifications?type=<one type>` returns only that type, with a
filtered `total`. For example, a "needs your answer" count is
`?type=quantity_reduction_proposed` plus the unread items. An unknown type
answers 422 `VALIDATION_FAILED` (field `type`).

## D. Small corrections (Ignore or Done)

- A stale `PATCH /deliveries/{id}` now reports `field: "order_version"`; it
  was `"version"`. The app shows `deliveryStatusConflict` on any 409 and
  reloads, so nothing changes.

  ```json
  {
    "status": 409,
    "code": "STALE_ORDER_STATE",
    "errors": [
      { "field": "order_version", "code": "STALE_ORDER_STATE", "current_status": "dispatched", "current_version": 5 }
    ]
  }
  ```

- `Order.attention_details` and `Order.price_change_info` are now typed
  (`OrderAttentionDetails`, `OrderPriceChangeInfo`). The shapes are the ones
  the 10.0 doc already described.
- The phase-7 error codes (`PRICE_CHANGED`, `STALE_ORDER_STATE`,
  `BELOW_COST_BLOCKED`, `ORDER_NEEDS_ATTENTION`) are now declared on their
  routes. The values are unchanged.
- Staff-only additions the app never calls (**Ignore**):
  - order queue filters and `badge_counts` on `GET /admin/orders`;
  - `GET /admin/retrievals`;
  - price-publish approvals;
  - the separation-of-duties setting;
  - the new `fx_rates.view` and `cash_accounts.view` permissions;
  - delivery parties, external drivers and party statements under
    `/admin/delivery-parties` and `/admin/external-drivers` (11.2);
  - assigning a delivery by `party_id` (11.2).

## E. The agent's own custody (New)

**Version:** 11.2.0. **Affects:** the delivery agent.

Every delivery is now carried by a **delivery party**: an internal agent (a
user with the app) or an external driver (no account, managed by staff). An
internal agent's party id is the same as their user id, so the existing
`Delivery.agent_id` keeps working.

**`GET /deliveries/custody`** returns what the signed-in agent is holding
right now. No party id is sent: the server takes it from the session. Cost
values are never returned to an agent. Cash is always zero for now; collection
postings come in a later version.

```json
{
  "party": {
    "id": "67d5d161…",
    "kind": "internal_agent",
    "user_id": "67d5d161…",
    "name": "Development Delivery",
    "phone": "+9647700000005",
    "vehicle_number": null,
    "description": null,
    "notes": null,
    "is_active": true,
    "created_at": "2026-10-03T20:45:34.879Z",
    "updated_at": "2026-10-03T20:45:34.879Z"
  },
  "goods": {
    "quantity": 2,
    "oldest_age_days": 5,
    "lines": [
      {
        "holding_id": "80000000…",
        "order": { "id": "10000000…", "order_number": "DEV-ORDER-5" },
        "delivery_id": "10000000…",
        "batch_id": "70000000…",
        "lot_number": "SEED-5",
        "variant_id": "50000000…",
        "sku": "SEED-005-STD",
        "product": { "id": "40000000…", "name_en": "Nonstick Frying Pan", "name_ar": "مقلاة غير لاصقة" },
        "quantity": 1,
        "issued_at": "2026-09-28T19:45:35.152Z",
        "age_days": 5
      }
    ]
  },
  "cash": { "currency": "IQD", "amount": 0, "oldest_age_days": null }
}
```

- A "What I'm holding" screen can list `goods.lines` by order, with
  `age_days` to show goods held too long.
- `404` means the signed-in user has no delivery party.

`Delivery` (`GET /deliveries/assigned`) also carries `party_id` and a short
`party` (`id`, `kind`, `user_id`, `name`, `phone`). The app reads only
`agent_id` today, which still holds the same id for internal agents. Nothing
breaks.

---

## Operations the app uses

| Operation | Changed in 11.x? | Section |
|---|---|---|
| `GET /me/notifications` | Yes: three new customer types, optional `type` filter | A, C |
| `GET /orders/{id}`, `GET /orders` | Yes: `delivery_attempts`; typed attention and price-change objects | B, D |
| `GET /deliveries/assigned` | Yes: `Delivery.attempts` (11.1); `party_id`, `party` (11.2) | B, E |
| `GET /deliveries/custody` | New in 11.2 | E |
| `PATCH /deliveries/{id}` | Stale error names `order_version` | D |
| `POST /orders`, `POST /orders/{id}/cancel` | No | |
| `POST /orders/{id}/cancellation-request`, `POST /orders/{id}/shortage-response` | No (from 10.0, not yet called by the app) | 10.0 B, F |
| `GET /monitor/orders`, `GET /monitor/orders/{id}` | No change the app relies on | |

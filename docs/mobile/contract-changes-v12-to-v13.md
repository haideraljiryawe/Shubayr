# Mobile app: API contract changes from 12.0.0 to 13.0.0

For: Ahmed's Flutter app on the protected `mobile` branch. Compared on
2026-10-04. Follows
[contract-changes-v11-to-v12.md](contract-changes-v11-to-v12.md).

## What was compared

- **App code:** the protected `mobile` branch at `8d4c6d1`, read only.
- **Contract:** `api/openapi.yaml` at 12.0.0 (`origin/main` before #96) and
  13.0.0 (#96).
- **Important baseline:** `mobile/` on `main` is a stale snapshot. It is not the
  app Ahmed migrates and it is not a release gate.

## Start here

**13.0 introduces no new runtime break in Ahmed's current app.** The app's
`Order` decoder does not read `delivery_attempts`, and all delivery-agent
request and response shapes are unchanged from 12.0.

There is one breaking customer-order contract change to carry forward: a
customer can still see delivery-attempt status, reason and time, but never the
internal agent or external driver's identity. If attempt history is added to
the app, use the new privacy-safe shape below.

The 12.0 delivered-call migration is still required and is not a 13.0 change.
See [the v11-to-v12 handoff](contract-changes-v11-to-v12.md): delivered needs
`operation_id` plus `collection_confirmation`, and a confirmed collection also
needs `collected_amount`.

| # | 13.0 change | Current app impact | What Ahmed must do |
|---|---|---|---|
| 1 | Customer `Order.delivery_attempts[]` no longer returns courier identity | No runtime break; the current `Order` model ignores this field | When implementing attempt history, decode only the privacy-safe fields and do not show or retain courier identity |
| 2 | Three staff price-approval notification types were added | None; they are sent to admin-surface staff, not app roles | No app change |
| 3 | Price-approval discovery, fixed-price approval and linked-preview fields were added | None; all affected operations are admin-only | No app change |
| 4 | Delivery-party list custody totals and the custody-overview endpoint were added | None; these are admin-only and do not change `GET /deliveries/custody` | No app change |

---

## A. Customer delivery-attempt identity is removed (breaking shape)

**Version:** 13.0.0. **Affects:** the `delivery_attempts` array in customer
responses from `GET /orders` and `GET /orders/{id}`. Staff `AdminOrder`
responses are unchanged.

### Before: 12.0 customer attempt

```json
{
  "id": "attempt-uuid",
  "delivery_id": "delivery-uuid",
  "attempt_number": 1,
  "status": "failed",
  "reason": "Recipient unavailable",
  "started_at": "2026-10-04T09:00:00.000Z",
  "completed_at": "2026-10-04T09:30:00.000Z",
  "party": {
    "id": "courier-or-driver-uuid",
    "name": "Courier name"
  }
}
```

The 12.0 schema also allowed a `party_id` property. Customer responses must no
longer expose either `party` or `party_id`.

### After: 13.0 customer attempt

```json
{
  "id": "attempt-uuid",
  "delivery_id": "delivery-uuid",
  "attempt_number": 1,
  "status": "failed",
  "reason": "Recipient unavailable",
  "started_at": "2026-10-04T09:00:00.000Z",
  "completed_at": "2026-10-04T09:30:00.000Z"
}
```

The same rule covers internal delivery agents and external drivers. The app
must not infer, fetch, cache or display a courier name, phone, user id, surname
or delivery-party id from customer order history.

### What to change

The current protected-branch `Order` model does not decode
`delivery_attempts`, so **no code change is required now**.

When attempt history is implemented:

1. Add a customer-only attempt model with exactly the seven fields in the 13.0
   example.
2. Do not reuse a staff `DeliveryAttempt` model: staff records still contain a
   `party` object, while customer records deliberately do not.
3. Render `status`, the customer-appropriate `reason`, and timestamps only.
4. Add decoder and UI tests that reject or ignore `party` and `party_id`, and
   verify that no courier identity is shown.

## B. Notification enum additions (no app work)

13.0 adds these notification preference types:

- `price_approval_requested`
- `price_approval_approved`
- `price_approval_rejected`

They belong to the admin staff price-approval workflow. Ahmed's app reads inbox
events generically and app sessions are customer, delivery-agent or
order-monitor roles; they do not receive these staff events. The app also does
not call `GET/PATCH /me/notification-preferences`, so there is no enum decoder
to update.

## C. Admin-only additions (ignore)

These 13.0 operations and fields are not available to app-surface callers:

- `GET /admin/price-publish-approvals`
- `GET /admin/price-publish-approvals/{id}`
- fixed-price pending approval fields on admin product updates
- `requires_below_cost_approval` in linked-price previews
- `GET /admin/delivery-parties/custody-overview`
- `custody_summary` on admin delivery-party list rows

Do not add them to the mobile app. The agent endpoints
`GET /deliveries/assigned`, `PATCH /deliveries/{id}` and
`GET /deliveries/custody` have no 12.0-to-13.0 contract change.

## Operations the app uses

| Operation | Changed in 13.0? | Action |
|---|---|---|
| `GET /orders` | **Yes:** each `delivery_attempts` item loses courier identity | No current decoder change; use section A when adding history |
| `GET /orders/{id}` | **Yes:** same privacy-safe attempt shape | No current decoder change; use section A when adding history |
| `PATCH /deliveries/{id}` | No | Finish the already-documented 12.0 collection migration |
| `GET /deliveries/assigned` | No | None |
| `GET /deliveries/custody` | No | None |
| `GET /me/notifications` | No response-shape change | None |
| Every other app operation | No | None |

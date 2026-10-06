# Mobile app: API contract changes from 13.0.0 to 13.1.0

For Ahmed's Flutter app on the protected `mobile` branch. Prepared on
2026-10-05. This follows
[contract-changes-v12-to-v13.md](contract-changes-v12-to-v13.md).

## Start here

13.1 is additive: existing 13.0 requests still validate and existing response
fields keep their meaning. The current delivery confirmation payload from 12.0
is unchanged. Do not remove `order_version`, `operation_id`,
`collection_confirmation`, or the conditional `collected_amount`.

The app should adopt the new delivery `amount_due` so an agent sees what must
be collected before confirming. Customer cart callers should also send an
idempotency key on every add. Unknown additive response fields may be ignored
until their UI is implemented.

| 13.1 change | App impact | Ahmed's action |
|---|---|---|
| Agent delivery responses require `amount_due` | New useful field on assigned deliveries and delivery mutation responses | Decode and display it before the confirm-delivered action |
| Customer orders add nullable `collection` | Additive detail/list field | Decode it when collection wording is shown; never expect courier identity in it |
| `POST /cart/items` accepts `Idempotency-Key` | Existing calls still work, but retries without a key can repeat an add | Generate one key per user action and reuse it only for retries of the identical body |
| New `POST /cart/merge` | Relevant only if the app supports a signed-out basket | Send the whole guest basket once after sign-in with a persistent merge key; replay that key after uncertain failures |
| Risk-tier rate limiting | A client can receive HTTP 429, especially on OTP and cart writes | Preserve existing 429 handling and respect `Retry-After`; never rotate identity headers to evade a limit |
| Staff collection list/filter endpoints | Admin-only | No mobile change |

## A. Agent delivery amount due

Affected operations include `GET /deliveries/assigned` and responses from
`PATCH /deliveries/{id}`.

Before 13.1 (abridged):

```json
{
  "id": "delivery-uuid",
  "order_id": "order-uuid",
  "order_version": 3,
  "status": "out_for_delivery"
}
```

After 13.1:

```json
{
  "id": "delivery-uuid",
  "order_id": "order-uuid",
  "order_version": 3,
  "amount_due": 105000,
  "status": "out_for_delivery"
}
```

`amount_due` is an IQD number containing goods plus delivery fee. Show it on
the assigned-delivery detail and beside the collected-amount input. It is not a
cash-custody balance and must not be recomputed from optional display fields.

## B. Customer order collection result

Affected operations: `GET /orders`, `GET /orders/{id}`, and customer order
responses returned by other order actions.

Before 13.1, the property did not exist. After 13.1, an undelivered order has:

```json
{ "collection": null }
```

A delivered order can have:

```json
{
  "collection": {
    "result": "short",
    "amount_collected": 95000,
    "shortfall": 10000,
    "confirmation_state": "confirmed",
    "currency": "IQD"
  }
}
```

Allowed `result` values are `full`, `short`, and `unconfirmed`. For an
unconfirmed result, `amount_collected` and `shortfall` are null. Render
customer-appropriate wording such as “collection awaiting confirmation” or
“amount remaining”; the object deliberately contains no party, courier, user
id, phone, surname, or journal reference.

## C. Repeat-safe cart writes

### Add one item

The body of `POST /cart/items` is unchanged. 13.1 adds this optional header:

```http
Idempotency-Key: <unique-retry-key>
```

Generate a new 8-128 character key for each tap/action. Keep the key with the
pending request and reuse it when a timeout or connection loss makes the
result uncertain. The same key and same body returns the cart without a second
add. Reusing the key for a different body returns HTTP 409 with
`IDEMPOTENCY_KEY_REUSED`.

### Merge a signed-out basket

If the app has no guest basket, no work is needed. If it does, replace a loop
of individual adds after sign-in with one request:

```http
POST /cart/merge
Idempotency-Key: persistent-guest-basket-operation-key
Content-Type: application/json

{
  "items": [
    {
      "product_id": "product-uuid",
      "variant_id": "variant-uuid",
      "quantity": 2
    }
  ]
}
```

The header is required on this endpoint. Persist the key until the merge
succeeds, and reuse it for retries of the exact basket. The API serializes the
merge with concurrent signed-in cart adds, so do not replay the guest lines
individually as well.

## Operations checklist

| Operation | Changed in 13.1? | Action |
|---|---|---|
| `GET /deliveries/assigned` | Yes, required `amount_due` response field | Decode/display |
| `PATCH /deliveries/{id}` | Additive `amount_due` in response; request unchanged | Decode if the response replaces local state |
| `GET /orders` and `GET /orders/{id}` | Additive nullable `collection` | Decode when implementing collection status UI |
| `POST /cart/items` | Optional idempotency header and declared 409 | Send a stable per-action key |
| `POST /cart/merge` | New operation | Use only for a guest-basket feature |
| OTP and other writes | Same request/response shapes; explicit risk-tier throttling | Handle 429 and `Retry-After` |
| Delivery confirmation request | No 13.1 change | Keep the 12.0 payload |

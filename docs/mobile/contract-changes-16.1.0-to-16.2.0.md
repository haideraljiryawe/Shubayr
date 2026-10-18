# Mobile contract changes: 16.1.0 to 16.2.0

Contract 16.2.0 is additive. It lets customer clients show the delivery fee and automatic-discount progress before checkout. Checkout remains authoritative and still snapshots the delivery fee on the order.

## Governorate delivery fees

`GET /governorates` remains public. Each row now also requires:

- `is_served`: `true` only when the active governorate belongs to an active delivery zone;
- `delivery_fee`: the current zone fee in IQD, or `null` when unserved;
- `currency`: always `IQD`.

Use this response for guest address selection and fee display. Do not treat a displayed fee as an order snapshot; refresh pricing before checkout.

## Signed-in cart pricing

`GET /cart` accepts one optional delivery selector:

- `governorate_id=<uuid>` for a selected governorate; or
- `address_id=<uuid>` for one of the signed-in customer's saved addresses.

When supplied, `delivery_fee` is the current active-zone fee and `total` is `subtotal - discount + delivery_fee`, using the same pricing calculation as checkout. Without a selector the legacy behavior remains: `delivery_fee` is zero. Never send both selectors.

Handle these declared errors:

- `DELIVERY_ZONE_NOT_SERVED` (409): the governorate is inactive, unassigned, or assigned to an inactive zone;
- `ADDRESS_GOVERNORATE_REQUIRED` (409): a legacy saved address needs a governorate;
- `DELIVERY_LOCATION_SELECTOR_CONFLICT` (422): both selectors were sent;
- 404: the saved address does not exist or is not owned by this customer.

## Guest discount progress

`GET /discount-tiers` is public and returns:

```json
{
  "currency": "IQD",
  "coupon_stacking_enabled": false,
  "tiers": [{ "min_subtotal": 25000, "percent": 5 }]
}
```

Rows are active tiers ordered by threshold. Use them to render the guest progress bar and explain whether coupons may stack. The response has a 30-second public cache policy and owner edits invalidate the server cache. Recalculate from the cart/checkout response after sign-in because the server is authoritative.

## Client migration

1. Regenerate the client from `api/openapi.yaml` version 16.2.0.
2. Replace any “fee set later” governorate UI with `delivery_fee` or an explicit unserved state.
3. Pass the chosen governorate or saved address to `GET /cart` for the signed-in total.
4. Load `GET /discount-tiers` for the pre-sign-in progress bar; keep using cart and checkout results as final pricing.

No existing request field or response field was removed or renamed.

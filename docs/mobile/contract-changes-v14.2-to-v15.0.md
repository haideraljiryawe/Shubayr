# Mobile contract changes: v14.2 to v15.0

Contract v15.0.0 contains two intentional breaking request changes and additive customer pricing fields. The repository's `mobile/` snapshot is not edited.

## Addresses and governorates

- Load the selectable list from `GET /governorates`. It returns active governorates with Arabic and English names and an `is_served` hint.
- `POST /addresses` now requires `governorate_id`.
- `PATCH /addresses/{id}` accepts `governorate_id` so older saved addresses can be completed.
- Older addresses may still return `governorate_id: null`. Checkout with one returns `409 ADDRESS_GOVERNORATE_REQUIRED`; prompt the customer to edit the address and choose a governorate.
- Checkout returns `409 DELIVERY_ZONE_NOT_SERVED` when the selected governorate has no active delivery zone. No stock is reserved and no order is created.

## Cart discounts

Cart responses now include:

- `discount_source`: `none`, `coupon`, `tier`, or `stacked`;
- `coupon_discount` and `tier_discount`;
- `applied_tier`, or `null` when no automatic tier contributes;
- `next_tier { min_subtotal, percent, amount_remaining }`, or `null` at the highest tier.

The highest qualifying automatic tier is evaluated against the goods subtotal. Delivery fees are excluded. By default a coupon and tier do not stack: the larger discount wins. Catalog SKU markdowns remain part of each line's effective price before the order-level discount.

## Checkout and order display

- Checkout uses the active delivery-zone fee for the selected address governorate. The cart continues to show `delivery_fee: 0` because no address is supplied to the cart route.
- Orders expose `original_delivery_fee`, nullable `adjusted_delivery_fee`, the effective `delivery_fee`, discount-source fields, tier progress snapshots, and line `discount_share` / `net_line_total` values.
- A staff-confirmed fee adjustment does not require customer acceptance. The customer receives an inbox notification containing the new total; refresh the order detail when that notification arrives.
- Return responses include `discount_share` and `net_amount`; display `expected_refund` and `approved_refund` as the authoritative net refund values.

## Staff confirmation clients

Any staff client calling either order-status route must send `customer_contacted: true` and a non-empty `customer_contact_note` when moving an order to `confirmed`. Optional `adjusted_delivery_fee` requires a non-empty `delivery_fee_adjustment_reason` and the `orders.adjust_delivery_fee` permission.

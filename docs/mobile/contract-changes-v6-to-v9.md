# Mobile app: API contract changes from 6.0.0 to 9.0.0

For: the Flutter app (customer, delivery agent, order monitor).
Compared on 2026-10-01.

## What was compared

- **App code:** the `mobile` branch at `bc326d7` (the branch the app is built
  from). Every API call, request field, response field and enum value the
  remote repositories use was listed from `mobile/lib`. The copy of `mobile/`
  on `main` is an older snapshot (from 2026-09-19) and was not used.
- **Contract:** `api/openapi.yaml` at 6.0.0 (`12acdc1`, #57) and at 9.0.0
  (`318a3cb`, #77), plus every version in between, so each change below says
  which version introduced it.
- **Examples:** captured from a real 9.0.0 API (seeded data, plus a test
  product sold by the kilogram). Ids are shortened.

Each item has a status:

- **Done:** the `mobile` code already handles it (the app's own roadmap says
  it was integrated against 7.1).
- **To do:** the app does not handle it yet.

The app uses 39 operations. Of those, 26 differ between 6.0.0 and 9.0.0,
including five that did not exist yet in 6.0.0 (the monitor and inbox routes).
None was removed or renamed, and no new request field became required. The breaking
changes are in **value types and meanings**: quantities can now be decimals,
each SKU has its own price, and the negotiation fields are gone.

## Start here: the five changes that break the app today

| # | What | Where it breaks | Section |
|---|---|---|---|
| 1 | Quantities are decimals (up to 3 places), not integers | Cart, product detail, orders, returns, monitor. The generated parsers use `toInt()`, so **2.5 kg silently becomes 2**, and the cart then sends 2 back to the server. | [A](#a-quantities-are-decimals-to-do) |
| 2 | Each SKU has its own `effective_price` | Product detail adds `price_delta` to the product price, which is now **wrong** whenever a SKU has its own price or a discount applies. | [B](#b-skus-have-their-own-price-unit-and-rules-to-do) |
| 3 | A product with several SKUs needs `variant_id` | Add to cart without a SKU returns 422. | [B](#b-skus-have-their-own-price-unit-and-rules-to-do) |
| 4 | Availability is a label (`in_stock` / `low_stock` / `out_of_stock`) | Product detail computes "low stock" itself with a fixed threshold of 5 and prints the remaining count. | [C](#c-availability-is-a-label-not-a-number-to-do) |
| 5 | Negotiation fields removed | `is_negotiable`, `floor_price`, `points_price` are no longer sent. | [F](#f-negotiation-is-removed-to-do) |

The 9.0.0 major version itself breaks nothing in the app. Its only breaking
change moved the supplier and purchase routes under `/admin`, and the app does
not call them.

---

## Already handled (6.1 to 7.1)

These changed after 6.0.0 and the `mobile` code already follows them. They are
listed so nothing is re-done.

| Version | Change | Endpoint(s) | App status |
|---|---|---|---|
| 6.1 | Notifications became a saved inbox: `title_ar`/`title_en`, `body_ar`/`body_en`, `target_role`, `deep_link`, `read_at`. The 6.0 delivery fields (`title`, `body`, `channel`, `locale`, `status`, `sent_at`) were removed. New types: `new_order`, `order_cancelled`, `order_rejected`, `delivery_assigned`. | `GET /me/notifications` | Done |
| 6.1 | Unread badge and mark as read | `GET /me/notifications/unread-count`, `PATCH /me/notifications/{id}/read` | Done |
| 6.1 | Order monitor screens | `GET /monitor/orders`, `GET /monitor/orders/{id}` | Done |
| 6.2 | Customer routes document `403 FORBIDDEN`, and some `404`/`409` responses | cart, orders, returns, addresses, wishlist | Done (handled as generic failures) |
| 7.0 | Every money-bearing resource carries `currency` (ISO code). Amounts are no longer limited to 2 decimals. | cart, orders, returns, deliveries, products | Done for customer screens |
| 7.1 | New order status `rejected` | all order reads, `GET /orders/{id}/track` | Done |

---

## A. Quantities are decimals (To do)

**Version:** 8.0.0. **Affects:** cart, product detail, checkout, order
history and detail, returns, order monitor.

A quantity is now an exact base-unit amount with up to three decimals: 2.5 kg,
0.75 L, or 3 pieces. Whether a SKU accepts fractions is the SKU's own rule
(`whole_units_only`, see B).

| Field | 6.0.0 | 9.0.0 |
|---|---|---|
| `POST /cart/items` → `quantity` | integer, 1–99 | number, multiple of 0.001, 0.001–99 |
| `PATCH /cart/items/{id}` → `quantity` | integer, 1–99 | number, multiple of 0.001, 0.001–99 |
| `Cart.items[].quantity`, `.available_qty` | integer | number (0.001) |
| `Order.items[].quantity` (all order reads, `/monitor/orders/{id}`) | integer | number (0.001) |
| `POST /returns` → `items[].quantity` | integer, ≥ 1 | number (0.001), ≥ 0.001 |
| Return response `items[].quantity`, `.approved_quantity` | integer | number (0.001) |
| `Product.available_qty`, `/products/{id}/availability` → `available_qty` (product and variants) | integer | number (0.001) |

**Why it breaks now:** the models declare these fields as `int`, and the
generated `fromJson` reads them with `(json['quantity'] as num?)?.toInt()`
(`cart.g.dart`, `order.g.dart`, `product_availability.g.dart`,
`product.g.dart`). A 2.5 kg line arrives as 2.5, is shown as 2, and the next
quantity change sends `2` in `PATCH /cart/items/{id}`. That quietly changes
the customer's real cart. `QuantityStepper` and `CartRepository.updateItem`
are also integer-only.

**What to do:**

- Keep quantities as exact decimals end to end: model, state, stepper, request
  body. Send them as JSON numbers with at most 3 decimals, and don't do float
  arithmetic that can produce 2.4999999.
- Show the unit next to the number ("2.5 kg"), using the SKU's `base_unit`.
- For whole-unit SKUs the stepper keeps whole steps. For decimal SKUs, let the
  customer type an amount (0.001 precision), and refuse more than 3 decimals.
- Per the app's numeric-input rule, quantities are never grouped with commas.

**Example:** add 2.5 kg of a kilogram SKU.

```http
POST /cart/items
{ "product_id": "057c49f3-…", "variant_id": "bf040785-…", "quantity": 2.5 }
```

```json
{
  "currency": "IQD",
  "items": [{
    "id": "fa627918-…", "product_id": "057c49f3-…", "variant_id": "bf040785-…",
    "quantity": 2.5, "unit_price": 8000, "line_total": 20000,
    "currency": "IQD", "available_qty": 12.5, "available": true
  }],
  "subtotal": 20000, "discount": 0, "delivery_fee": 0, "total": 20000
}
```

The order placed from that cart keeps the decimal:
`"items": [{ "variant_id": "bf040785-…", "quantity": 2.5, "unit_price": 8000, "line_total": 20000, … }]`.

---

## B. SKUs have their own price, unit and rules (To do)

**Version:** 8.0.0 (9.0.0 adds three read-only fields). **Affects:** product
list cards, product detail, wishlist, cart.

Every product has one or more SKUs (`variants`). A SKU is now a full sellable
item with its own price, unit, whole-unit rule and stock. **Cart, order, return
and stock lines always name a SKU.**

| Field (on `Product.variants[]`) | 6.0.0 | 9.0.0 |
|---|---|---|
| `id`, `sku`, `attributes` | present (`attributes` was an object) | present (`attributes` may be `null`) |
| `price_delta` | number; the app adds it to the product price | **deprecated** integer. Don't use it for display. |
| `effective_price` | — | **the price the customer pays for this SKU** |
| `on_sale`, `discounted_price`, `discount_percent` | — | per SKU |
| `selling_price` | — | SKU price override (`null` = inherits the product price) |
| `currency` | — | ISO code |
| `base_unit` | — | e.g. `piece`, `kg`, `L` |
| `whole_units_only` | — | `true` = whole numbers only |
| `available_qty`, `in_stock`, `availability`, `low_stock_threshold` | — | per SKU (see C) |
| `pricing_mode`, `reference_currency_code`, `reference_price`, `published_price`, `price_approved_at`, `price_version_id`, `awaiting_rate_id` | — | admin pricing details. The app can ignore them. |
| `currency_code`, `product_id`, `updated_at` | — | added in 9.0.0, informational |

Also changed in 6.0 → 9.0: `Cart.items[].variant_id` and `Order.items[].variant_id`
used to be nullable and are now always a UUID.

**Why the current price is wrong:** product detail shows
`product.salePrice + selectedVariant.priceDelta`. In 9.0 a discount applies to
the SKU's own price, and a SKU can have its own price, so that sum no longer
matches what the cart charges. Real example, from the seeded earbuds:

| SKU | What the app shows (`10,075 + price_delta`) | `effective_price` (what the cart charges) |
|---|---|---|
| `SEED-001-STD` | 10,075 | 10,075 |
| `SEED-001-PLUS` | **13,075** | **11,575** (own price 23,150 at 50% off) |

**What to do:**

- Show the selected SKU's `effective_price`. When it is on sale, show its
  `discounted_price` and `discount_percent` against its own undiscounted price.
  The product-level `effective_price` is the price of the cheapest SKU, so a
  card can say "from …" when SKUs differ.
- Never compute a price on the phone. The cart re-prices from the server.
- Always send `variant_id` with `POST /cart/items`. It is required when a
  product has more than one SKU.
- Use `whole_units_only` and `base_unit` for the quantity input (see A).

**Example:** one SKU from `GET /products/{id}` (9.0.0).

```json
{
  "id": "50000000-…-0002", "sku": "SEED-001-PLUS", "attributes": { "option": "plus" },
  "price_delta": 3000, "selling_price": 23150,
  "base_unit": "piece", "whole_units_only": true,
  "currency": "IQD", "on_sale": true, "discounted_price": 11575,
  "effective_price": 11575, "discount_percent": 50,
  "available_qty": 100, "availability": "in_stock", "in_stock": true,
  "low_stock_threshold": 5
}
```

**New errors on `POST /cart/items` / `PATCH /cart/items/{id}`:**

```json
// No variant_id for a product with several SKUs
{ "status": 422, "code": "VALIDATION_FAILED",
  "message": "variant_id is required when a product has multiple SKUs", "errors": [] }

// 1.5 of a piece SKU
{ "status": 422, "code": "SKU_WHOLE_UNITS_ONLY",
  "message": "This SKU accepts whole-unit quantities only", "errors": [] }

// More than is available
{ "status": 409, "code": "CONFLICT",
  "message": "Requested quantity exceeds available stock", "errors": [] }
```

---

## C. Availability is a label, not a number (To do)

**Version:** 8.0.0. **Affects:** product cards, product detail, wishlist.

| Field | 6.0.0 | 9.0.0 |
|---|---|---|
| `Product.availability` | — | `out_of_stock` \| `low_stock` \| `in_stock` (best state across the product's SKUs) |
| `Product.variants[].availability` | — | same three values, per SKU |
| `GET /products/{id}/availability` → `availability`, `variants[].availability`, `.base_unit`, `.whole_units_only`, `.low_stock_threshold` | — | added |
| `GET /products/{id}/availability` → `variants[].variant_id` | nullable | always a UUID |
| `GET /settings` → `default_low_stock_threshold` | — | in the contract, but the public route does not return it (see gaps) |

The server decides low stock from each SKU's own threshold (or the store
default), using only sellable, unexpired, unreserved stock.

**Why it breaks now:** `_StockBadge` in `product_detail_screen.dart` uses a
fixed `_lowStockThreshold = 5` and shows `productLowStock('$q')`, i.e. it
prints the remaining quantity. With 9.0 the threshold is per SKU, the
quantity is a decimal, and the store shows a label rather than a stock count.
The web store has printed no stock count since PR G (#74).

**What to do:** show the label from `availability` for the selected SKU (or
the product, on cards): out of stock, low stock, in stock. Don't print
`available_qty`, and drop the local threshold. Disable "add to cart" when the
selected SKU is `out_of_stock`.

**Example:** `GET /products/{id}/availability` after stock dropped to 2.5 kg
(threshold 5).

```json
{
  "product_id": "057c49f3-…", "in_stock": true, "availability": "low_stock", "available_qty": 2.5,
  "variants": [{ "variant_id": "bf040785-…", "sku": "DATES-…-KG", "base_unit": "kg",
    "whole_units_only": false, "low_stock_threshold": 5,
    "available_qty": 2.5, "availability": "low_stock", "in_stock": true }]
}
```

---

## D. Brands (To do)

**Version:** 8.0.0. **Affects:** product cards and detail, product list
filters.

| Item | 6.0.0 | 9.0.0 |
|---|---|---|
| `GET /brands` | — | **new, public.** Visible brands in display order. Params: `q`, `page`, `per_page`. |
| `Product.brand_id`, `Product.brand` | — | `brand_id` (nullable) and `brand` (object or `null`): `id`, `name_ar`, `name_en`, `slug`, `logo_url`, `is_visible`, `sort_order`, … |
| `GET /products` → `brand_id` query | — | **array** of brand ids (`?brand_id=a&brand_id=b`), combined with the other filters |
| `GET /products` → `facets.brands[]` | — | `{ brand_id, count }` for the current filters, to show counts next to each brand |

**What to do:** show the brand on the product, add a brand filter (multi-select
with counts), and send repeated `brand_id` parameters.

**Example:**

```json
// GET /brands?per_page=2 → data[0]
{ "id": "10000000-…-0700", "name_en": "Shubayr Select", "name_ar": "مختارات شُبير",
  "slug": "shubayr-select", "logo_url": "http://…/media/2000…-0001",
  "is_visible": true, "sort_order": 0 }

// GET /products?brand_id=10000000-…-0700 → facets
{ "brands": [{ "brand_id": "10000000-…-0700", "count": 8 }, { "brand_id": "10000000-…-0701", "count": 8 }] }
```

---

## E. Categories have two levels (To do: review)

**Version:** 8.0.0. **Affects:** category browsing.

`GET /categories` has the same shape and parameters as in 6.0.0. What changed
is the rule: category writes now allow at most two levels, a department and
its subcategories. A product must belong to a subcategory. Older data may still
contain deeper nodes until the team cleans it up.

**What to do:** treat the tree as department → subcategory. If a deeper node
appears (`include_subtree=true` or children of a subcategory), drop it before
rendering, as the web store does. Product lists keep filtering by
`category_id`.

(`docs/CATALOG_CONTRACT.md` still says "five levels". That text is out of
date; the 8.0.0 changelog and the API enforce two.)

---

## F. Negotiation is removed (To do)

**Version:** 8.0.0. **Affects:** product model, any negotiation UI.

| Field / route | 6.0.0 | 9.0.0 |
|---|---|---|
| `Product.is_negotiable` | boolean | **removed** |
| `Product.floor_price` | number or `null` | **removed** |
| `Product.points_price` | integer or `null` | **removed** |
| `POST /products/{id}/negotiations` | — (not in the 6.0 contract) | `410 NEGOTIATION_REMOVED` |

The app's `Product` model still reads all three fields (`product.dart`).
Because they are nullable or defaulted it won't crash, but remove them and any
UI that depends on them.

```json
{ "status": 410, "code": "NEGOTIATION_REMOVED", "message": "Price negotiation has been removed", "errors": [] }
```

---

## G. Product visibility (To do: review)

**Version:** 8.0.0. **Affects:** wishlist, cart, deep links.

Public reads (`/products`, `/products/{id}`, `/products/{id}/availability`)
return only products that are **active and published** (`published_at` is
set). Publishing now requires complete data and approved prices, and stock
changes alone never publish a product. A product the customer saved can
therefore stop being readable:

- `GET /products/{id}` answers `404` for it. Show "no longer available"
  instead of an error screen.
- In the cart, its line comes back with `available: false` (this field already
  existed in 6.0). Checkout rejects unavailable lines, so ask the customer to
  remove it first.

New read-only fields on `Product`: `published_at`, `created_at`, `updated_at`,
`price_approved_at`.

---

## H. Checkout: stock is allocated when the order is placed (To do)

**Version:** 8.2.0. **Affects:** checkout.

Placing an order now allocates real stock lots in the same step. If stock ran
out after the item went into the cart, `POST /orders` answers **409
`INSUFFICIENT_STOCK`** and names the SKU, the requested amount and what is
available (exact decimal strings):

```http
POST /orders
Idempotency-Key: 7c1d…
{ "address_id": "10000000-…-0001", "payment_method": "cod" }
```

```json
{
  "status": 409, "code": "INSUFFICIENT_STOCK", "message": "Requested quantity exceeds available stock",
  "errors": [{ "field": "quantity", "code": "INSUFFICIENT_STOCK", "message": "Requested quantity exceeds available stock",
    "requested": "9", "available": "2.5", "variant_id": "bf040785-…" }]
}
```

**What to do:** on this error, return to the cart and show which line is short
and how much is left. Don't retry automatically.

Not new, but worth fixing at the same time: `POST /orders` has accepted an
optional `Idempotency-Key` header since 4.7. The app does not send one, so a
retry after a lost response can place a second order. Generate one key per
checkout attempt and reuse it on retry.

---

## I. Work accounts can't shop (To do: map the code)

**Since:** 6.0.0 (not new, but never documented in the contract). **Affects:**
delivery-agent and order-monitor sessions.

Delivery agents and order monitors sign in on the same app surface as
customers. Any customer-only route (cart, orders, wishlist, addresses,
returns, reviews, loyalty, rating a delivery) answers:

```json
{ "status": 403, "code": "WORK_ACCOUNT_SHOPPING_FORBIDDEN",
  "message": "Work accounts cannot use customer purchase functions", "errors": [] }
```

The app's role guard already keeps work accounts out of the customer shell.
Still, map this code to a clear message rather than the generic "no access",
for example when a deep link opens a customer page. Related codes the server
sends on this surface: `APP_ROLE_FORBIDDEN` (route not allowed for the role),
`AUTH_SURFACE_FORBIDDEN` (a staff token used on the app), and
`AUTHENTICATION_REQUIRED`.

---

## J. Delivery agent: a status change can be refused for a closed period (To do)

**Version:** 8.2.0. **Affects:** delivery status update.

Two delivery transitions now post to the accounts. `out_for_delivery` moves
the goods into the agent's custody, and `delivered` posts the cost of goods
sold. If the current accounting month is closed, `PATCH /deliveries/{id}`
answers 409 with code `PERIOD_CLOSED` (and `period`, e.g. `"2026-11"`), not
just `CONFLICT`. The delivery statuses and allowed transitions are
unchanged.

```json
{ "status": 409, "code": "PERIOD_CLOSED", "message": "…", "errors": [], "period": "2026-11" }
```

**What to do:** show "The store's accounting period is closed; contact the
store" rather than a generic conflict. The delivery keeps its previous status.

---

## K. Order monitor (To do)

**Versions:** 8.0.0, 8.1.0. **Affects:** monitor list and detail.

- Order item quantities are decimals (see A). The monitor parses orders with
  the same `Order.fromJson`, so it has the same truncation.
- `GET /monitor/orders/{id}` now always includes `currency` on the order and on
  each item (8.1). The monitor screens currently format money with the store
  currency (`brandProvider`). Use the order's own `currency`.
- The monitor list items still have no `currency` field. This is already
  recorded in the app's roadmap as a contract request.

---

## L. Phase 7 is not in 9.0.0 yet

Price-change handling at checkout (a `PRICE_CHANGED` refusal when a price moves
between cart and order), preparation-time reallocation and below-cost
protection belong to build phase 7. **None of it is in the 9.0.0 contract.**
Don't build against a guessed shape. This document will get an addendum when
that contract lands.

## M. Notifications stream (optional)

The app polls `/me/notifications`. Since 6.1 there is also a live stream:
`POST /notifications/stream-ticket` gives a single-use ticket, then
`GET /notifications/stream?ticket=…` streams Server-Sent Events, with
`Last-Event-ID` / `since` for resuming. Using it is optional. Note that a
ticket works only once, so a reconnect needs a fresh ticket.

---

## Error codes the app should recognise

| Code | Status | Where | Meaning |
|---|---|---|---|
| `SKU_WHOLE_UNITS_ONLY` | 422 | cart add/update, returns | Fraction on a whole-unit SKU |
| `VALIDATION_FAILED` ("variant_id is required…") | 422 | cart add | Product has several SKUs; choose one |
| `CONFLICT` ("exceeds available stock") | 409 | cart add/update | More than is available now |
| `INSUFFICIENT_STOCK` | 409 | `POST /orders` | Stock ran out at checkout; `errors[0]` has `requested`, `available`, `variant_id` |
| `NEGOTIATION_REMOVED` | 410 | `POST /products/{id}/negotiations` | Feature removed |
| `WORK_ACCOUNT_SHOPPING_FORBIDDEN` | 403 | customer purchase routes | Delivery agent / monitor account |
| `APP_ROLE_FORBIDDEN` | 403 | any app route | Role not allowed |
| `PERIOD_CLOSED` | 409 | `PATCH /deliveries/{id}` | Accounting month closed |

Of these, only `PERIOD_CLOSED` (and the generic `CONFLICT` / `VALIDATION_FAILED`)
appear in the contract. The others are what the 9.0.0 server actually sends,
and they have been reported to the backend for documentation (see below).

## Contract gaps reported to the backend

Found while preparing this list. Each is noted in the pull request that adds
this document.

1. Error codes the server sends to the app but the contract does not list:
   `SKU_WHOLE_UNITS_ONLY`, `INSUFFICIENT_STOCK`, `WORK_ACCOUNT_SHOPPING_FORBIDDEN`,
   `APP_ROLE_FORBIDDEN`, `AUTH_SURFACE_FORBIDDEN`, `AUTHENTICATION_REQUIRED`,
   `NEGOTIATION_REMOVED`, `PERMISSION_DENIED` (the contract says `FORBIDDEN`).
2. Over-stock in the cart is a plain `409 CONFLICT`, while the same situation at
   checkout is `INSUFFICIENT_STOCK` with the amounts. One code for both would
   let the app show the same message.
3. `GET /settings` does not return `default_low_stock_threshold` or
   `sale_rounding_multiple`, which the 8.0 contract added to `StoreSettings`.
4. The `POST /orders` description still describes the pre-8.2 "product/variant
   hold" instead of lot allocation and `INSUFFICIENT_STOCK`.
5. `CHANGELOG.md` has no 9.0.0 entry, and `docs/CATALOG_CONTRACT.md` still
   says categories have five levels.
6. `MonitorOrderListItem` still has no `currency` (already on the app's
   roadmap).

## Endpoints the app uses: change summary

| Endpoint | Changed 6.0 → 9.0 | Sections |
|---|---|---|
| `POST /auth/request-otp`, `/auth/verify-otp`, `/auth/refresh`, `/auth/logout` | No (`client: "mobile"` still valid) | — |
| `GET /me`, `PATCH /me` | No | — |
| `GET /settings` | Fields added (not returned) | C, gaps |
| `GET /banners` | No | — |
| `GET /categories` | Shape no; rule yes | E |
| `GET /products` | Yes | B, C, D, F, G |
| `GET /products/{id}` | Yes | B, C, D, F, G |
| `GET /products/{id}/availability` | Yes | C |
| `GET /products/{id}/reviews` | No | — |
| `POST /products/{id}/reviews` | 403 documented | — |
| `GET /cart`, `POST /cart/items`, `PATCH /cart/items/{id}`, `DELETE /cart/items/{id}` | Yes | A, B |
| `POST /coupons/validate` | `code`, `type`, `value` now required; `currency` added | — |
| `GET /orders`, `POST /orders`, `GET /orders/{id}`, `POST /orders/{id}/cancel` | Yes | A, H (+ 7.0/7.1 done) |
| `GET /orders/{id}/track` | `rejected` status (done) | — |
| `POST /returns` | Yes | A |
| `GET/POST /addresses`, `PATCH/DELETE /addresses/{id}` | 403 documented | — |
| `GET/POST /wishlist`, `DELETE /wishlist/{productId}` | Yes (product shape) | B, C, D, F, G |
| `GET /deliveries/assigned` | `currency` (done) | — |
| `PATCH /deliveries/{id}` | `PERIOD_CLOSED` | J |
| `GET /monitor/orders`, `GET /monitor/orders/{id}` | Yes | K |
| `GET /me/notifications`, `/unread-count`, `PATCH …/{id}/read` | Yes (done in 6.1) | — |

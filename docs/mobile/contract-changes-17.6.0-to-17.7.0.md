# Mobile contract changes: 17.6.0 to 17.7.0

Contract 17.7.0 is additive and backward compatible. Existing banner fields
(`title`, `subtitle`, `cta_text`, and `link_url`) remain present and keep their
meaning. No Flutter source is changed by the backend PR.

## Home banners (NOTE-001)

`GET /banners` still returns an ordered array, with these additional fields on
each banner:

- `internal_name: string` (admin-facing; falls back to legacy `title`);
- `title_ar`, `title_en: string`;
- `subtitle_ar`, `subtitle_en`, `cta_label_ar`, `cta_label_en: string | null`;
- `show_text: boolean`;
- `action_type: none | url | product | category | offers` and nullable
  `action_target_id`;
- `action: { type, url, target }`, where `url` is populated only for `url` and
  `target` is populated only for product/category actions;
- `is_default`, `default_priority`, and computed `effective_status`.

A resolved target is
`{ id, slug, name_ar, name_en, available }`. Product slugs are currently null.
`available=false` means the target is no longer customer-visible; the client
must not redirect to an unrelated destination. `none` is genuinely
non-clickable. `offers` opens the platform's offers listing.

Localized banner fallback is deterministic and server-applied:

1. requested language;
2. the other localized field;
3. the corresponding legacy field.

Nullable subtitles/CTA labels remain null if all candidates are empty. When
`show_text=false`, render image-only artwork with no title, subtitle, or CTA
overlay even though fallback text remains in the payload for compatibility.

The server composes the feed after active/schedule filtering: zero eligible
regular campaigns returns the first two usable defaults; one returns that
campaign followed by one default; two or more returns regular campaigns only.
Start-only and end-only schedules remain valid, and both boundaries are
inclusive. Expired campaigns are never silently revived.

A network/API failure is not an empty successful feed: keep the rest of Home
usable, show no fabricated or expired campaign, and retain normal diagnostics.
If one image fails, omit that unusable slide for the current render and keep the
other returned slides/Home content working; do not replace it with an expired
banner. Normal refresh may retry the image/feed.

Legacy migration: a stored banner with `link_url` is exposed as
`action.type=url` with the same URL. A banner without a link maps to `none`.
Older clients may continue consuming the legacy fields.

## Recently Added (NOTE-004)

`GET /settings` adds:

- `recently_added_enabled: boolean` (default `false`);
- `recently_added_max_count: integer` (1–50, default 10);
- `recently_added_window_days: integer` (1–365, default 30).

`GET /products/recently-added?page=&per_page=` returns the existing
`ProductPage` shape. The server uses a rolling elapsed-time window, filters for
active/published products, visible category ancestry and positive current
sellable stock before limiting/pagination, then orders by immutable
`created_at DESC, id DESC`. Low stock is eligible; zero stock is not. Product
edits and republication do not renew recency. When disabled, the route returns
an empty page.

## Per-order purchase limits (NOTE-011)

Every product read adds:

- `purchase_limit_enabled: boolean`;
- `purchase_limit_max_quantity: number | null` (precision 0.001).

When enabled, the maximum applies to the sum of every variant and cart/order
line for that product in one order. The backend enforces it during cart add,
guest-cart merge, cart quantity update, and again atomically at checkout.
Idempotent replays do not add or order the quantity twice. The editor suggestion
of 10 is not a server default. Rolling-window/customer-history quotas remain
out of scope.

Affected cart and checkout routes can return HTTP 409 with code
`PRODUCT_ORDER_LIMIT_EXCEEDED` and:

```json
{
  "details": {
    "product_id": "uuid",
    "allowed_quantity": 3,
    "requested_quantity": 4
  }
}
```

Clients should use the code and quantities, not parse the English message.

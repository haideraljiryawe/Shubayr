# R2 — Promotions (customer and admin)

Date: 2026-09-11. Implemented with mock data; Ahmed confirmed manual acceptance on 2026-09-11.
Baseline: `mobile` commit `d25f058`. Contract remains the imported
`api/openapi.yaml` at upstream `f458690`; R2 fields originated in `4447744`.
No backend, contract, dependency or other-project changes.

## Customer behavior

- Product JSON and image-copy operations preserve optional `compare_at_price`
  and read-only `discount_percent`. Older responses without them remain valid.
- The shared product card shows the original price struck through and the
  supplied discount percentage when there is a valid offer. This covers home,
  product listings and wishlist cards. Details use the same promotion component.
  Missing original price, or an original price no higher than the sale price,
  shows no promotion. Missing percentages are not fabricated by the remote UI.
- Two lines remain reserved for the product name. Existing sale price stays at
  the card bottom, with rating directly above it; promotion information is above
  the rating. Original price and percentage wrap within the available space.
  Existing stock badge, favorite action, colors, typography and RTL are retained.
- Product details retain `sale_price + price_delta` for the selected variant.
  With a nonzero delta, the offer explicitly shows the base product prices and
  percentage under a base-offer label. The contract does not provide a variant
  original price; no such price or variant percentage is invented.
- An Offers filter chip in the product listing combines with category, search,
  price range and sort. Remote requests send `on_sale=true` when enabled and
  omit it for the full listing. Mock filtering occurs before pagination/totals.
- Filter changes restart page one. Request generations reject stale responses,
  including rapid offers/all/offers toggles and disposal. Failed append keeps
  loaded cards and exposes retry for the same page with the same filters. Wide
  viewports load more when the first page does not fill the available space.

## Admin behavior

- The product create/edit form adds an optional original-price field, using the
  existing responsive field layout and numeric validation. Its hint explains
  removing an offer. Clearing it sends explicit null; setting it no higher than
  sale price also removes the offer.
- The product input whitelist permits `compare_at_price` but still excludes
  `discount_percent` and other read-only fields. Existing permissions apply.
- Mock create/update calculates the percentage from the original and selling
  prices using the contract's rounding rule. Catalog reads reflect these edits;
  changing sale price also recalculates the percentage. Nine existing mock
  products have offers, giving two pages at the listing's eight-item page size.
- Cart and checkout still charge the selling price; original price is display
  metadata and is not applied as another discount. Points/coupons are unchanged.

## Main files

- [Product model](../lib/features/catalog/data/product.dart) and generated JSON;
  [mock catalog](../lib/features/catalog/data/catalog_repository_mock.dart),
  [remote catalog](../lib/features/catalog/data/catalog_repository_remote.dart)
  and [repository interface](../lib/features/catalog/domain/catalog_repository.dart).
- [Promotion widget](../lib/features/catalog/presentation/widgets/product_promotion.dart),
  [product card](../lib/features/catalog/presentation/widgets/product_card.dart),
  [product details](../lib/features/catalog/presentation/screens/product_detail_screen.dart),
  [product listing](../lib/features/catalog/presentation/screens/product_list_screen.dart)
  and [listing controller](../lib/features/catalog/presentation/providers/product_list_controller.dart).
- [Admin product inputs](../lib/features/admin/domain/admin_repository.dart),
  [admin mock](../lib/features/admin/data/admin_repository_mock.dart),
  [form](../lib/features/admin/presentation/screens/admin_record_form.dart),
  labels and Arabic/English localization sources/generated outputs.
- Promotion repository/controller/screen tests; existing card/detail/admin tests
  extended for offers. Catalog test doubles accept the new optional filter.

## Technical verification — 2026-09-11

- Existing partial implementation and Git diff reviewed on resumption; no reset,
  discarded changes or unrelated feature work.
- JSON/localization generation completed during implementation; affected Dart
  files formatted. `flutter analyze`: no issues.
- Focused repository/controller/card/detail/admin checks and final Offers-screen
  interaction tests passed after correcting test-response typing, snackbar timing
  and scrolling to the localized sort chip.
- `flutter test`: **425 tests passed**. Regression coverage includes 45 offers
  returning 20/20/5 with matching totals; combined filters; original-price JSON;
  remote parameter/payload shape; create/edit/clear and recalculation; selling
  price charged to the cart; rapid filter switches and append retry.
- Existing card tests now include mixed promotional/normal products, long prices,
  two-line names, 320–430 widths, Arabic/English, light/dark and 2x text. The full
  responsive suite covers both sides of 600/900/1200/1536 and widths up to 1920.
- `flutter build web --dart-define=DATA_SOURCE=mock`: successful. The build tool's
  Wasm dry run also succeeded; no interactive Web or emulator check is claimed.
- `git diff --check` and local Markdown link checks passed.

## Manual acceptance

Ahmed accepted customer/admin R2 on 2026-09-11 and requested commit/push to
`mobile`. The checklist below remains available for regression checks.

Use the existing `DATA_SOURCE=mock` launch configuration:

1. As a customer or guest, open home and a product with an offer. Check original
   price, sale price and percentage; check a normal product and a wishlist card.
   Test Arabic/English, light/dark and phone/wide Web layouts.
2. Open the product listing, enable Offers and scroll to the final result. Combine
   it with search/category/price/sort, then disable it. The filter applies to the
   complete result set and the other chosen filters remain active.
3. In admin product management, edit a product to sale price 40,000 and original
   price 50,000: customer views should show 20%. Clear the original price and
   save, then confirm the offer disappears. Also check create and equal/lower
   original prices. Reopen the record to confirm the stored value.
4. For a product with priced variants, change the variant: its selling price
   updates, while the offer is explicitly identified as belonging to the base
   product. Cart quantity and charged totals should use the selling price.

Mock catalog changes last for the app run; they are not a persistent backend.
No Simulator/Emulator was started. Manual acceptance is complete; live integration
remains pending. R3/R4, points operations B10 and other roadmap items remain separate.
Ahmed authorized the Git handoff to `origin/mobile` on acceptance.

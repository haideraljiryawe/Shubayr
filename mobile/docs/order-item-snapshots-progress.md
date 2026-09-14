# R1 — Order-item snapshots

Date: 2026-09-10. Status: implemented with mock data, technical verification
passed; Ahmed confirmed manual acceptance on 2026-09-10. Built on `mobile` commit `41a1beb`.
Contract: repository-root `api/openapi.yaml`, reviewed upstream `f458690`,
snapshot fields introduced by `89c9120`. No contract changes in this increment.

## Implemented behavior

- `OrderItem` reads/writes optional `product_name_ar`, `product_name_en` and
  nullable `image_url`, including nested order/page JSON responses.
- Customer checkout captures the current product names and primary image URL
  when constructing the order. Seeded customer/admin orders also capture them.
  Later catalog edits/removal and order status updates preserve the captured
  values. Existing prices, quantities, totals and checkout requests are unchanged.
- Order details display the saved name in the active language, falling back to
  the other saved language before considering the current catalog. Reviews,
  return selection and the session return receipt use the same label rules.
- Missing/blank saved names fall back to the current catalog for legacy orders;
  if the product is unavailable, the product ID remains visible. Optional catalog
  failures no longer block review/return forms. Complete saved names are usable
  immediately while optional variant lookup is pending.
- Missing `image_url` means a legacy response and permits catalog-image fallback.
  Explicit `image_url: null` means no image at purchase and displays the existing
  placeholder, even if a catalog image is added later. A saved URL is used
  directly; loading/error placeholders retain the existing design.
- Local `imageSnapshotProvided` metadata preserves absent versus explicit null
  across JSON round trips; it is never sent as an API field. Programmatic fixtures
  capturing no image explicitly pass `imageSnapshotProvided: true`.
- Variant attributes are not part of the snapshot contract. Existing catalog
  enrichment remains optional; an unavailable variant uses its purchased ID.
  No new variant fields are invented.

## Changed areas

- [Order model](../lib/features/orders/data/order.dart) and generated JSON.
- [Customer mock](../lib/features/orders/data/order_repository_mock.dart),
  [admin order mock](../lib/features/admin/data/admin_order_repository_mock.dart)
  and the synchronous [mock catalog lookup](../lib/features/catalog/data/catalog_repository_mock.dart).
- [Shared historical item display rules](../lib/features/orders/presentation/widgets/order_item_display.dart),
  [order details](../lib/features/orders/presentation/screens/order_detail_screen.dart),
  [after-sales providers](../lib/features/orders/presentation/providers/after_sales_providers.dart)
  and [review/return screens](../lib/features/orders/presentation/screens/after_sales_screens.dart).
- Snapshot model/repository regression tests and updated order-detail/after-sales
  widget tests. No dependency, visual-token or navigation changes.

## Technical verification

- Targeted JSON generation with `build_runner` and Dart formatting completed.
- `flutter analyze`: no issues.
- `flutter test test/features/orders`: all **75 tests passed**.
- `flutter test`: all **407 tests passed**, including the existing responsive
  matrix around 600/900/1200/1536 and up to 1920, RTL/light, English/dark and
  enlarged text. Snapshot-specific detail tests cover 390/600/1200/1920 in both
  languages with no catalog reads or overflow.
- Added regression coverage for absent/null/image JSON, language fallback,
  remote checkout payloads, capture at purchase after a catalog edit, later
  rename/removal, no-image purchases, status preservation, legacy/deleted-product
  review and return submissions, mixed legacy/saved labels, and return input
  retained while variant enrichment finishes.
- `flutter build web --dart-define=DATA_SOURCE=mock`: passed; Web output built
  successfully and the tool's Wasm dry run succeeded.
- `git diff --check`: passed. No Simulator/Emulator was started.

## Manual acceptance

Ahmed accepted R1 on 2026-09-10 and requested marking it complete plus a commit
and push to `mobile`. The check below remains available for regression checks.

Use the existing mock launch configuration (`DATA_SOURCE=mock`):

1. Sign in as a customer, place an order, then open its details from My Orders.
   Check the item names/images, quantities and totals in Arabic and English.
2. Open a seeded delivered order and enter the review and return screens. Check
   that the item labels agree with the order, then submit a review/partial return
   and check the return receipt label.
3. Check these views on a phone and wide Web window, including dark mode. Existing
   layout, navigation and image placeholders should remain familiar.

Catalog rename/removal and old-response cases are covered automatically; the
current mocks do not provide durable shared customer orders across sign-out or
separate app instances. Do not rely on switching roles to retain a checkout.

## Remaining boundaries

Manual acceptance is complete; live-backend verification remains pending. The mock stores
snapshots for the repository lifetime only. The contract saves an image URL,
not archived image bytes; a removed resource uses the existing placeholder.
After-sales views retain their current text-only item layout. R1 supplies no
customer/address/delivery linkage and does not close B1, B2 or B5. R2–R4 remain
separate work. Ahmed authorized the Git handoff to `origin/mobile` on acceptance.

# Responsive layout — mobile / tablet / desktop

Date: 2026-09-10. Implementation uses Flutter SDK layout primitives and the existing
theme/components. No dependency, contract, repository behavior or navigation
change is part of this increment. Final visual/manual acceptance is pending.

## Shared policy and foundation

`AGENTS.md` now requires responsive behavior as part of completing every new or
changed UI. The shared source is `lib/core/layout/app_layout.dart`:

| Window width (logical pixels) | Class |
| --- | --- |
| <600 | Mobile |
| 600–899 | Tablet |
| 900–1199 | Compact desktop / large tablet |
| 1200–1535 | Desktop |
| >=1536 | Large desktop |

Classes do not fix column counts. Card/field columns use the available pane width,
spacing, content minimum and text scale. A navigation rail or split pane reduces
the available width. Product grids preserve two columns in phone-sized slots;
other card lists and forms use one there. At wider widths, the number of columns
increases only when readable items fit.

- `ResponsiveCardList` / `ResponsiveCardSliver`: lazy rows with natural heights;
  catalog rows retain equal height and the existing two-line name/price footer.
  Append loading/retry stays a full-width footer outside the grid. Mounted card
  state survives row regrouping, including an open delivery confirmation.
- `ResponsiveFields`: all form fields remain mounted for validation; resizing
  preserves drafts/focus. Descriptions, images, variant groups and permissions
  can occupy a full row. Variant attributes and permission choices also adapt.
- `ResponsiveContent` / `ResponsiveSections`: opt-in limits for authentication
  (420), reading (760), forms (1200), and detail regions (1440); wider detail
  regions become adjacent around 900 when local width and text scaling permit.
- `ResponsiveBodyWithAside`: the cart summary moves from below the list to a
  bounded adjacent region around 1200. `ResponsiveValueRow` wraps long summary
  values without truncating them.
- No app-wide width cap: management lists and future tables/reports retain access
  to the available desktop width. Colors, type styles, spacing/radius tokens,
  light/dark modes, RTL and existing navigation remain the source of presentation.

## Screen/component audit

| Area | Applied behavior |
| --- | --- |
| Customer shell | Reuses the central 900 breakpoint; existing rail/bottom navigation behavior retained |
| Home, product listing/search, wishlist | Shared catalog grid adds readable columns; matching product skeletons inherit the same layout |
| Categories | Wider category rail/tiles on larger screens; bounded browse-all action; existing two-pane navigation preserved |
| Product details | Gallery and information adjacent on wide screens; matching loading regions; bounded bottom purchase action |
| Customer orders / addresses | Responsive card rows, existing paging/refresh preserved, loading states matched |
| Order details | Tracking/header alongside items, totals and actions; bounded detail width |
| Checkout | Delivery/payment/coupon region alongside summary; bounded bottom action; long labels/values wrap |
| Cart | List alongside desktop summary; quantity/price wrap if necessary |
| Address form | Multiple appropriate fields per row; multiline details/default action remain full row |
| Account and profile | Adjacent account/preferences regions; simple profile editor stays readable |
| Review and return forms/receipts | Content-specific reading width instead of unlimited stretching |
| Sign-in and OTP | Existing narrow form width retained and moved into central layout constants |
| Admin home / section hubs | More independent tiles across wider layouts, natural heights for longer labels |
| Admin resource lists | Shared responsive rows for products/categories/users/roles/suppliers/warehouses/locations; bounded search/filter controls |
| Admin record forms | Responsive product/category/user/role/supplier fields, variants and permissions; full validation retained |
| Admin orders | Wider card grid, bounded search, natural-height filter chips, matching loading/footer states |
| Delivery list | Wider card grid and skeletons, footer retry and resize-safe confirmation |
| Shared empty/error states | Bounded readable message region, with the page itself unrestricted |

The account screen delegates to `AccountView`; product listing and wishlist do
not need parallel layout systems or duplicate edits. Developer-only design
gallery remains a token/component reference and was not redesigned. Placeholder
management journeys (reports, picking, etc.) have no real table/layout to adapt
yet; future implementations must follow the new policy. No existing operational
screen has been deferred for a separate responsive implementation.

## Verification

- New widget matrix covers 390, 599/600/601, 899/900/901, 1199/1200/1201,
  1535/1536/1537 and 1920 logical pixels, in Arabic/light and English/dark.
- Additional 2x text checks cover 390, 600, 900, 1200 and 1920. Existing suites
  continue covering Arabic/English, both themes and 320-pixel catalog/admin/
  delivery cases.
- Checks inspect loaded and lower scroll content, actual adjacent cards and
  readable product widths, and that bottom actions leave room for the main body.
  Shared-layout tests check both directions, full-width retry, form drafts,
  validation/focus and mounted card state across resizing. Delivery regression
  opens a confirmation on the second card, resizes to desktop, then saves it.
- Final verification: changed Dart files formatted; `flutter analyze` reports
  no issues; all **364 tests passed**; `flutter build web
  --dart-define=DATA_SOURCE=mock` succeeded. The matrix has 38 tests covering 29
  screen/form configurations. Widget tests do not replace visual browser/device
  acceptance; no Simulator/Emulator was started.

## Focused manual acceptance

1. Run with `DATA_SOURCE=mock`. As a staff/admin user, open catalog/users,
   product/user editing and orders; resize across 600/900/1200/1536 up to 1920.
   Cards should form more columns; fields must remain readable and retain drafts.
2. Scroll administrative orders and deliveries into later pages, change a filter,
   and complete a status confirmation after resizing the window. Verify the
   selected record updates and refresh/retry remain available.
3. As a customer, inspect home/search/wishlist, address editing, product details,
   cart and checkout at phone and desktop widths. Product names still reserve two
   lines; ratings/prices remain at the bottom; summaries/details split on wide
   screens and purchase actions remain visible.
4. Switch Arabic/English and light/dark; repeat with larger text and a long name
   or summary value. Check chip strips, dialogs, lower form fields and both sides
   of every breakpoint for clipping or awkward spacing.

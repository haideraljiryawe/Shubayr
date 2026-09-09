# Order history with mock data

## Implemented

- The order-history controller requests pages of 20 through `OrderRepository`,
  passing the selected status on every page. All nine existing contract statuses
  are selectable using the existing chip design and localized labels.
- Scrolling appends pages until the repository metadata indicates completion.
  Repeated requests are guarded; overlapping order IDs are merged. An empty
  subsequent page also stops loading.
- Refresh restarts the selected query at page one and waits for completion.
  Existing checkout/cancellation invalidation also keeps the selected status.
  The success-screen **View my orders** action explicitly selects Pending so
  the newly placed order is visible, regardless of the previous filter.
  Late responses from older queries or refreshes cannot overwrite current data.
- Initial loading retains the existing skeleton. Appending uses a card skeleton;
  an append failure keeps loaded cards and offers a retry for the same page.
  Filters remain available in empty, loading, and error states.
- The mock contains 52 orders, including 25 delivered orders, to exercise both
  unfiltered and filtered pagination. The four original demo orders remain first.
- Card styling, navigation, repository interfaces, API contract, dependencies,
  and the mock/remote switch are preserved. Changes are confined to `mobile/`.

## Technical verification — 2026-09-07

Dart formatting completed, `flutter analyze` reports no issues, and the full
`flutter test` suite passed all 176 tests after the final review corrections.
These include **View my orders**, dark-mode neutral snackbar contrast, and
responsive product-card rows with a reserved two-line name slot, ellipsis, and
bottom-aligned rating/price. All three checkout tests also passed separately, including
opening Pending from a previously selected Delivered filter and preserving the
previous filter when choosing to return to shopping.

Focused coverage: `order_repository_test.dart`, `orders_controller_test.dart`,
`orders_screen_test.dart`, and `checkout_screen_test.dart` under `test/features/orders/`. It covers pagination,
repository filtering, duplicate/stale responses, failed-page retry, refresh,
checkout/cancellation invalidation, disposal, empty states, tall viewports, and
narrow Arabic layouts in light and dark modes.

Live backend integration remains unverified. Ahmed confirmed final manual
acceptance on 2026-09-07 after reviewing the fixes; the roadmap item is `[x]`.

## Manual acceptance checklist

1. Launch with `flutter run --dart-define=DATA_SOURCE=mock`, sign in as a customer
   (phone ending in a digit other than 1 or 2; any six-digit mock OTP), and open
   Orders. Scroll from SH-1063 to SH-994: all 52 orders should be reachable, with
   no duplicate cards or repeated loading after the end.
2. Select Delivered and scroll to SH-995: all 25 matching orders should be
   reachable across two pages. Switch filters rapidly and return to All; the
   cards must match the selected chip and restart from the top.
3. Pull to refresh, then open a later order and go back. Check that refresh ends,
   the selected filter remains selected, and details navigation still works.
4. Under Pending, cancel an eligible order and return: it should disappear from
   Pending and appear under Cancelled. Check Arabic RTL and light/dark modes for
   chip scrolling, readable cards, and clipping.
5. Select Delivered, leave Orders, and complete a new purchase. On the success
   screen, tap **View my orders**: Pending must be selected and the new order
   must appear, regardless of the previously selected filter.

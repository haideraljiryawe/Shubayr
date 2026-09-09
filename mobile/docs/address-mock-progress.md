# Address pagination with mock data

## Implemented

- Address repositories return `AddressPage` and accept `page`/`perPage`. The
  remote forwards the existing API contract's `page` and `per_page` parameters;
  it no longer requests only the first 100 addresses.
- The controller reads pages of eight sequentially and publishes the complete
  list only after all pages succeed. Checkout needs the full list to resolve a
  default address that may appear on a later page. Pages load up front rather
  than on scroll; the address list retains its existing lazy card rendering.
- Overlapping address IDs are merged. Inconsistent paging metadata produces a
  retryable error rather than silently hiding remaining addresses. Retry and
  refresh restart at page one, and refresh waits for the final page.
- Add, edit, delete, set-default and refresh operations are serialized. Saved
  repository responses update the complete list without dropping other pages.
  A confirmed default clears the default flag on other addresses. Failed writes
  retain the list and display the existing localized snackbar; failed form saves
  retain entered values and allow another attempt.
- Session changes discard stale responses and queued work. A new customer's
  operations do not wait for an old customer's pending request. Guests do not
  read address pages or write addresses.
- Address management supports pull-to-refresh for populated and empty lists.
  Checkout uses a matching address skeleton while loading and offers retry for
  failed reads. Order submission remains disabled during loading or read errors.
  The picker can select addresses from any loaded page.
- The mock seeds ten addresses: the original default home followed by
  `عنوان 1` through `عنوان 9`. This exercises two pages without requiring large
  manual setup. Mock data remains in memory and resets when the app restarts or
  the session identity changes.
- Existing card styling, localization, navigation, dependencies and the API
  contract are preserved. Work is confined to `mobile/`.

## Technical verification — 2026-09-08

Dart formatting completed and `flutter analyze` reports no issues. All 30
focused address/checkout tests and all 224 tests in the full Flutter suite pass.

Coverage includes repository paging metadata and remote query parameters,
105-address retrieval, a default beyond the old 100-address limit, later-page
CRUD and default changes, failed writes, refresh sequencing, incomplete page
errors, duplicate IDs, logout and stale mutations, empty refresh, form-save
retry, checkout retry and submission with a later-page address, and 320-pixel
Arabic/English layouts in light and dark modes.

Ahmed confirmed final manual acceptance on 2026-09-08; the roadmap item is `[x]`.
Live backend integration has not been verified.

## Manual acceptance checklist

1. Launch with `flutter run --dart-define=DATA_SOURCE=mock`, sign in as a customer
   (phone ending in a digit other than 1 or 2; any six-digit mock OTP), and open
   Account → Addresses. Scroll through ten addresses to `عنوان 9`.
2. Use the last address's menu to set it as default. Edit its details and save,
   then pull to refresh: all ten addresses remain and only the last is default.
3. Add a product to the cart and continue to checkout. The last address should
   be selected automatically. Open Change, scroll through the picker and choose
   another address; its details should replace the previous selection.
4. Return to Addresses, delete `عنوان 9`, and pull to refresh: it stays removed
   and the other nine remain. Add an address and verify it appears. Check the
   affected cards in light/dark mode and at normal/narrow widths.

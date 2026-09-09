# Wishlist pagination with mock data

## Implemented

- Mock and remote repositories accept `page` and `perPage`; the remote forwards
  the existing contract's `page` and `per_page` query parameters.
- The controller reads pages of eight sequentially on initial load and refresh,
  publishing the complete list only when all pages succeed. Wishlist membership
  also drives product heart buttons outside this screen, so a partial first page
  must not mark later-page products as unsaved. This loads all pages up front;
  network requests are not triggered by scrolling.
- Duplicate product IDs are merged, and inconsistent page metadata produces a
  retryable error instead of silently presenting an incomplete membership set.
- Add, remove, toggle and refresh operations are serialized. Mutations wait for
  initial membership and apply successful repository responses without dropping
  other pages. Failed mutations preserve the saved state and show the existing
  localized snackbar. Retry starts from page one; refresh waits for completion.
- Session changes discard obsolete responses and queued operations. A new
  customer's operations do not wait for an old customer's pending request.
- The mock seeds ten existing catalog products to exercise two pages. The
  original two saved products remain first; `p10` and `p11` are on page two.
  `p1` and `p12` remain available for add testing. Mock data is in memory and
  resets when the session identity changes or the app restarts.
- The existing product grid and visual values are preserved. The empty state
  now also supports pull-to-refresh. No dependencies or API contracts changed.
- Review correction: the shared product-card stock badge follows the language
  direction (right in Arabic, left in English), opposite the wishlist heart.
  This also applies to cards on Home and in category/product lists.

## Technical verification — 2026-09-08

Dart formatting completed, `flutter analyze` reports no issues, and the full
`flutter test` suite passed all 200 tests after the stock-badge review correction.

Wishlist repository, controller and widget coverage includes multi-page reads,
query parameters, complete membership before toggling, page failures and retry,
overlapping products, refresh/mutation sequencing, mutation failures, empty
refresh, guest access, session changes, stale errors, and Arabic layouts at
320 pixels in light and dark modes, plus badge direction and separation from
the wishlist heart in both Arabic and English.

Ahmed confirmed final manual acceptance on 2026-09-08; the roadmap item is `[x]`.
Live backend integration has not been verified.

## Manual acceptance checklist

1. Launch with `flutter run --dart-define=DATA_SOURCE=mock`, sign in as a customer
   (phone ending in a digit other than 1 or 2; any six-digit mock OTP), and open
   Wishlist from Account. A fresh session contains ten products; scroll to the
   final products, including `p11` (مصباح مكتب LED).
2. Open that product and verify its heart is saved. Remove it, return to
   Wishlist, and pull to refresh: it stays removed and the other nine remain.
3. Open `p12` (مكبر صوت بلوتوث) from the catalog, save it using the heart, then
   return to Wishlist: it appears first and remains after refresh.
4. Check scrolling and the last row in light/dark mode at normal and narrow
   widths. If all items are removed, pull to refresh the empty state: the refresh
   must end and the empty message remain.

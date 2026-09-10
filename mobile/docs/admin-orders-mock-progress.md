# Admin order list and status updates — mock progress

Date: 2026-09-09. Scope: phase 3's admin order list, confirmation and status
updates, within `mobile/` including Flutter Web. Ahmed confirmed final manual acceptance
on 2026-09-09; no live backend acceptance is claimed.

## Implemented

- The dashboard Orders section opens `/admin/orders`, guarded by staff role and
  `orders.view`. Existing customer and delivery journeys remain unchanged.
- All plus the nine contract status Chips; debounced order-number/customer
  search; inclusive calendar-date range selection and clearing. Every filter is
  passed to the repository before pagination and retained on subsequent pages.
  Changing filters starts at page one. Filters reset when the session changes.
- Cards use existing order labels/status pills, shared cards/buttons, theme
  colors, localized currency and Western-Arabic date digits. They display the
  order reference, current status, placement date, quantity and total from Order.
- Pending orders have a Confirm order action. Update status supports the
  contract's nine statuses excluding the current value. Both require explicit
  consent before PATCH; status changes occur only after the repository succeeds.
- All writes, including confirmation, require `orders.update` as specified by
  OpenAPI. `orders.confirm` alone does not authorize this endpoint. Read-only
  warehouse staff can browse without mutation controls. Permissions and the
  original session are checked again before submitting an open dialog.
- Skeleton loading, refresh, empty results, initial retry and append retry.
  Existing pages remain visible after append failure; failed writes preserve
  the displayed order and allow retry. Duplicate writes/appends are guarded.
- Initial reads, refreshes, appends and writes share a queue. A filter changed
  during PATCH reads after the write, and stale filter/session responses cannot
  overwrite the active list. Confirmation restarts pagination to account for
  rows leaving the selected status and shifting page offsets.
- A successful PATCH followed by a failed list reload stays a successful write;
  the error view retries GET only. An outdated dialog status is rechecked before
  writing, including when a refresh was already queued.
- Mock and remote repositories use the existing data-source switch and Order /
  OrderPage models. Remote calls are GET `/admin/orders` with `status`, `q`,
  `from`, `to`, `page`, `per_page`, and PATCH `/orders/{id}/status` with only
  `status`. All omits the status parameter. No API contract was modified.

## Mock and contract boundaries

- Mock seeds 81 store orders, including 45 pending orders across 20/20/5 pages,
  and examples of every remaining status. Ordering is placement date descending,
  then order number descending as a deterministic fixture tie-breaker.
- Search supports order references and internal mock customer names (`Ahmed` /
  `أحمد`, `Ali` / `علي`). Order does not expose customer name/phone fields, so
  those fields were not invented in responses or cards. Remote customer search
  is performed by the server as documented by `q`.
- These store-order fixtures are independent of the customer session's checkout
  fixtures. Status changes persist for the current app run, but do not simulate
  synchronization with customer tracking or assigned deliveries.
- The status endpoint references the complete OrderStatus enum but supplies no
  allowed-transition matrix. Mock accepts those values; server-side eligibility
  and rejection remain authoritative when remote integration is tested.
- The contract says confirmation triggers FEFO reservation and a pick list on
  the server. This increment changes order status only in mock. It does not
  fabricate reservations, change inventory or claim a pick list was created.
- B6 remains deferred: no pick-list listing/link from an order or per-location
  batch balance exists. No picking button, invented pick-list ID, customer detail
  navigation or stock-allocation journey was added. Return-related status values
  do not implement return approval, inspection or restocking (B2).

## Verification

- Localization generation and Dart formatting completed.
- 33 focused tests passed: mock/remote payloads, all statuses, combined filtering,
  pagination without duplicates, post-update offset reset, retries, malformed
  pages, stale filter/session responses, refresh/write ordering and permission
  denial. Widget checks cover dashboard navigation, search, Chips, date input,
  confirmation/cancel, failed writes and read-only access.
- Narrow widget checks cover 320 pixels, Arabic/English, light/dark themes and
  2× text, including the confirmation dialog. These are widget tests, not final
  simulator or physical-device acceptance.
- `flutter analyze`: no issues. Full `flutter test`: all 319 tests passed.
- `flutter build web --dart-define=DATA_SOURCE=mock`: succeeded.
- No live backend was contacted.

## Manual check — accepted by Ahmed on 2026-09-09

Run with `DATA_SOURCE=mock`, sign in with a phone ending in `2` and any six-digit
OTP such as `123456`, then open Dashboard → Orders.

1. Choose Pending and scroll beyond the first 20 and 40 orders; all 45 should be
   reachable. Switch Chips and check that the list starts at the top.
2. Search `SH-3001` or `Ahmed` / `أحمد`; combine with status/date filters and clear
   them. Empty combinations should show a useful empty state.
3. Cancel a confirmation dialog, then confirm a pending order. Cancellation sends
   nothing; a successful confirmation removes the order from Pending and makes
   it available under Confirmed. Try a different status through Update status.
4. Pull to refresh and revisit the list. Check Arabic/English, light/dark and
   your usual phone width. Note any design feedback separately from B6 picking.

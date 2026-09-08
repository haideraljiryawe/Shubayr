# Delivery agent with mock data

## Implemented

- The existing delivery home route now shows assigned deliveries using the
  established card, button, theme, skeleton, error and snackbar components.
  The account/settings entry and existing role routing remain in place.
- `Delivery`/`DeliveryPage` match OpenAPI 1.1.0. Repositories implement
  `GET /deliveries/assigned` with `page`/`per_page` and `PATCH /deliveries/{id}`
  with a status-only body. The PATCH uses the delivery ID, not the order ID.
- The mock seeds 45 deliveries across three pages of 20. All five read statuses
  appear: assigned, out_for_delivery, delivered, failed and returned. The list
  shows the order reference, status, delivery fee and available dispatch/delivery
  timestamps. Identifiers are references, not invented human order numbers.
- Scrolling appends pages and deduplicates delivery IDs. A failed append retains
  the existing cards and retries that page. Initial errors also offer retry.
  Refresh restarts at page one and waits for completion, including on an empty
  list. Inconsistent paging metadata produces a retryable error.
- The status dialog offers only the three PATCH values, excluding the current
  status. Selecting a value does not write until Save is pressed. Successful
  repository responses update the card; failed writes keep its previous state
  and show a localized snackbar. Duplicate saves of the same status do not
  produce duplicate writes after the first succeeds.
- Reads and writes are serialized so refresh/append cannot overwrite a status
  update. Session changes discard old queued work, responses and errors; the new
  agent does not wait for an old request. The existing `delivery.assigned`
  permission is enforced in the screen and controller, with the delivery role
  required in the controller. No role grants or authentication rules changed.
- The mock repository is recreated when the active agent/access changes. Mock
  updates persist only in memory for that session.

## Scope and contract limits

The contract enumerates permitted status values but does not specify a transition
graph. This increment offers those values without inventing a production
transition policy; the remote server remains responsible for validating updates.
The mock accepts permitted target values and provides simulated timestamps.

Order details, customer/address lookup, maps and cash-collection confirmation
remain deferred under B5. Delivery fees are not cash-collection amounts. Mock
status updates do not mutate customer orders, payments, stock, points or send
notifications. No extra fields, dependencies or API contract changes were added.

## Technical verification — 2026-09-08

Model serialization and Arabic/English localizations were generated with the
existing project tools. Formatting completed; `flutter analyze` reports no issues.
All 41 focused delivery/router tests and all 255 Flutter tests passed.

Coverage includes all mock pages/statuses, remote query and PATCH payloads,
append/initial retry, empty refresh, mutation failures and duplicate saves,
read/write ordering, stale-session errors, permission denial, dialog cancellation
and save, and 320-pixel Arabic/English layouts in light/dark modes at 1× and 2× text.

Ahmed confirmed final manual acceptance on 2026-09-08; the roadmap item is `[x]`.
Status Chips with server-side filtering and pagination are a separate pending
enhancement under roadmap blocker B11.
Live backend integration and B5 operations have not been verified.

## Manual acceptance checklist

1. Launch with `flutter run --dart-define=DATA_SOURCE=mock`. Sign out of the
   customer account and sign in with a phone ending in `1` and any six-digit OTP.
   The delivery list should replace the previous Coming soon screen.
2. Scroll through the list: all 45 deliveries should be reachable. The last order
   reference ends in `000045`; all five statuses are represented.
3. On the first assigned delivery, choose Update status → Out for delivery →
   Save. Its status should update with a success message. Pull to refresh and
   confirm the change persists. Repeat with Delivered or Delivery failed.
4. Open the dialog, select another status and cancel: the card should stay
   unchanged. Check scrolling and dialog readability in both languages/themes,
   then verify the account icon still opens settings and sign-out works.

# Team update review — 2026-09-29

Reviewed and merged `origin/main` through `a4f8ba3` into
`codex/mobile-app-access-v6`. The shared contract is now API **7.1.0**.
The five incoming commits contain no mobile changes; this handoff supplies the
mobile integration. No backend, web, admin or contract source was edited here.

## Incoming work

| Commit / PR | Delivered | Impact on Ahmed's request |
| --- | --- | --- |
| `b4cd584` / #61 | Web Admin API follow-ups, audit reads, work-phone shape, documented auth statuses | Supports the separate management surface; app shopping restrictions remain enforced. |
| `a6ae4c5` / #62 | Web-store monitor/agent pages and notification center | Implements the web work mode; it does not update Flutter automatically. |
| `9159c20` / #63 | Financial core, currency-bearing commerce data, ledger, periods, cash accounts | Backend foundation for later phases; not the complete financial UI or delivery custody workflow. |
| `4902770` / #64 | Web Admin order operations and staff inbox | Administrative execution is in the separate Web Admin. |
| `a4f8ba3` / #65 | Permissioned rejection of pending orders and active-agent lookup | Adds `rejected` to shared statuses; mobile needs display/filter support, not a reject action. |

## Scope verdict

The main requested separation is implemented in code: phone OTP creates app
sessions with server-assigned roles, work accounts cannot shop, monitor routes
expose GET list/detail only, and admin actions require the admin surface and
specific permissions. The Flutter changes remove the old advanced admin feature
and its navigation, and provide read-only monitoring plus the saved inbox.
Delivery agents retain their permitted delivery actions.

This is not completion of the entire analysis document. Native background push
still uses `DevPushProvider`/disabled on the backend; Flutter currently synchronizes
the inbox in the foreground and on resume. Brands/availability v2, the full revised
order lifecycle, collection/custody, delivery statements and wages still depend on
later phases. The new rejection endpoint alone does not finish lifecycle phase 7.

## Mobile compatibility completed here

- Added Arabic/English rejected-order labels, filters, error color and terminal
  presentation, without adding an administrative rejection action.
- Product, cart, customer order, checkout and delivery amounts now prefer the
  resource's currency. Legacy/test responses without the optional field retain
  the store-settings fallback. Saved order-item and product/cart copies retain
  their currencies.
- The mobile VS Code launch file is included with exactly iOS Simulator and
  Chrome Remote profiles. The repository-root editor copy remains local.
- Normal launches are remote-only. In-memory repositories remain explicit test
  fixtures and never substitute for an unavailable server.

## Specific remaining contract gap

API 7.0 describes explicit currency on monetary resources, but
`MonitorOrderListItem` and `MonitorOrderDetail` do not document a currency field.
`OrdersService.getMonitor()` actually emits order/item currency while
`listMonitor()` does not select or emit it. Monitoring therefore still uses the
store currency for display. The backend team should align both monitor schemas
and responses before relying on different currencies in those views. This gap
has no current conversion implementation on the phone and must not be hidden by
inventing new request fields.

## Local environment and verification limits

Fetching code is not database deployment. The local database still lacks:

- `20260928150818_financial_core`
- `20260929000100_order_rejection`

Neither migration was applied and no database was reseeded during this review.
A responding health endpoint does not establish API 7.1 database compatibility.
Live end-to-end work-role/rejection/finance acceptance needs the team's normal
migration/deployment process first. Generated Prisma client types can be refreshed
for static/unit checks without applying database migrations.

## Checks performed

- Mobile: `flutter analyze` clean; full `flutter test` passes 690 tests, with four
  opt-in live API tests skipped. Includes new rejected-order display/filter and
  currency-preservation regressions.
- Debug web and iOS Simulator builds succeed. These are build checks, not a fresh
  visual simulator acceptance run.
- Backend: 840 route-policy matrix tests and 35 permissions/money/posting-scenario
  tests pass. The initial route-policy run required regenerating stale Prisma
  types; rerunning after generation passed. No migration was run.
- `git diff --check` clean; final change scope relative to main is mobile only.
- Full backend acceptance and API 7.1 live mobile flows were not run because the
  local database has the two pending migrations listed above.

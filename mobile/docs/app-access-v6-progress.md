# Mobile app scope — API 7.1

> Historical API 7.1 scope/acceptance snapshot. Current Mobile targets API 11.0.0;
> see [AGENTS](../AGENTS.md), [README](../README.md) and the
> [contract synchronization log](contract-sync-log.md). Launch-profile counts,
> pending migrations and acceptance steps below describe that earlier phase.

The application now targets guests, customers, delivery agents and read-only
order monitors. Web Admin staff operations belong to the separate Next.js app.
This record supersedes the previous mobile admin/mock progress records.

## Runtime and debugging

Normal launches always use remote repositories. `DATA_SOURCE=mock` no longer
selects fixtures. Automated tests explicitly override repositories or the test
fixture provider; network failures never trigger a fixture fallback.

The mobile `.vscode/launch.json` is included in the handoff. The repository-root
copy stays local. Both contain exactly two independent profiles:

- `Shubayr — iOS Simulator (Remote)` — existing iPhone 17 Pro simulator.
- `Shubayr — Chrome Preview (Remote)` — localhost:7357, isolated browser storage.

Both use `http://localhost:8000/api/v1`. Chrome is a development preview of the
same phone application, not Flutter Web Admin or the production web store.

## Implemented scope

- OTP declares `client: mobile`; the server chooses the role. Known app roles
  are `customer`, `delivery_agent`, `order_monitor`. Legacy/unknown roles and
  non-app sessions are rejected. Empty app permission arrays no longer block
  delivery work. Work accounts cannot enter shopping or administrative routes.
- App tokens refresh via `/auth/refresh`; concurrent expired requests share a
  rotation. Sign-out clears local credentials and attempts server revocation.
  Offline sign-out still clears the device; server revocation needs connectivity.
- Removed mobile admin CRUD, admin order mutations and their routes, repositories
  and feature-specific tests. Customer/delivery regressions remain covered.
- Monitor GET list/detail use `/monitor/orders`. Status counts come from the
  server, including `all`; search, status and inclusive Baghdad calendar dates
  combine before pagination. Detail uses saved item names and never loads images.
- Saved bilingual inbox, unread badge, individual mark-read and role-safe order
  links use `/me/notifications`. Receiving/loading an item never marks it read.
  Foreground sync runs every 30 seconds and on resume. Loaded inbox pages are
  refreshed to observe read state from another device. API failures remain errors.
- Removed negotiation badge; legacy product fields remain readable until the
  catalog contract removes them.

## Deferred backend-dependent work

Native background push is not complete: the backend currently has a development
logging provider rather than a production push gateway. No fake push behavior
is introduced. The app currently polls the inbox; it does not use the web-store
SSE stream. Brands/availability v2, revised cancellations and price acceptance,
collection/retries, custody, statements and wages follow their backend phases.

No backend source, contract, seed or database migration was changed in this task.
Do not use a seeded admin phone as an order monitor: work phones must have their
explicit new app roles. The current seed declares customer +9647700000006,
delivery agent +9647700000005 and monitor +9647700000008; availability in an
existing database must be checked rather than assumed.

## Manual acceptance after technical checks

1. Start the development backend with API 7.1 and its existing database. Sign in
   using a customer, delivery-agent and monitor phone already configured there.
2. Customer: browse, cart, order history, profile; negotiation badge absent.
3. Monitor: opens monitoring directly; cannot open shopping/admin routes; combine
   status/search/date filters, load more, refresh, view details with no images.
   No confirmation, status editing or catalog/user management actions exist.
4. Agent: assigned deliveries load with an empty permissions array; existing
   permitted delivery status actions still work; cannot enter shopping.
5. Notifications: badge/inbox match the API; opening one marks only that item;
   order links respect the role; other-device read state appears within 30 seconds
   or on app resume. Sign-out removes all prior-account inbox/order state.
6. Check Arabic/English, light/dark, large text, and the independent Chrome
   preview. Shut down one debug session before starting the other if Flutter
   generated files are still being rebuilt.

## Technical verification — 2026-09-28

- `flutter analyze`: no issues.
- Full `flutter test`: 686 passed; four explicitly opt-in localhost API tests
  skipped. These automated tests inject fixtures; app launches remain remote.
- Debug web build and iOS Simulator build verified.
- Both local VS Code launch files contain exactly the two requested profiles;
  their configured iPhone 17 Pro simulator is present on this workstation.
- Live integration was unavailable: localhost:8000 did not respond and Docker
  reported its daemon stopped. No live smoke or final visual acceptance is claimed.
- Final visual/interactive verification awaits Ahmed's manual-vs-Codex choice,
  as required by `mobile/AGENTS.md`.

## Local connection follow-up — 2026-09-28

The reported home/categories connection errors were caused by Docker being
stopped. Opening Docker restarted the existing services; the API's configured
startup command automatically deployed the two pending access/inbox migrations.
Compilation then revealed the old container dependencies lacked `argon2`.
Restored dependencies inside the existing API container with `npm ci` using its
committed lockfile, verified the module loads, and restarted the container.
No backend source/contract/seed files were edited and the database was not reseeded.

Categories, products, banners and settings now respond HTTP 200. The opt-in
Flutter remote public-catalog smoke test passes against localhost:8000.
Authentication/work-role smoke tests and final UI acceptance are not covered by
that public-only test. The network error copy now says the server could not be
reached, rather than asserting that the device has no internet. `flutter analyze`
passes after localization regeneration. Keep Docker running during remote work.

## API 7.1 team sync — 2026-09-29

Merged the five team updates through `a4f8ba3`. Added rejected-order presentation
and filtering, plus resource-currency handling for commerce screens. Included the
mobile VS Code remote profiles in the Git handoff. See
[team update review](team-update-review-2026-09-29.md) for the precise scope,
remaining monitor-currency contract gap, pending local migrations and checks.

Current verification: 690 Flutter tests pass (four opt-in API tests skipped),
analysis is clean, web/iOS Simulator debug builds succeed, and the targeted
backend policy/finance checks pass. This does not claim completion of the whole
analysis document or live verification of the undeployed database updates.

# Mobile roadmap — current API 7.1 scope

This roadmap supersedes the previous mobile admin/Flutter Web backlog. See
[implementation and verification notes](docs/app-access-v6-progress.md).

## Current application

- Guests/customers: existing catalog, cart, checkout, order history, addresses,
  wishlist, reviews, returns and profile flows, using the available remote API.
- API 7.1: rejected-order labels and filters; resource currencies for product,
  cart, customer order and delivery amounts, with a legacy settings fallback.
- Work-role login: server-assigned roles and app-only sessions; shopping excluded.
- Delivery agents: assigned deliveries and the existing permitted status updates.
- Order monitors: read-only filtered/paginated orders and details without images.
- Shared saved notifications: inbox, unread count, individual read state,
  role-safe links, foreground/resume synchronization.
- Development: independent iOS Simulator and Chrome preview configurations;
  remote-only runtime, explicit isolated fixtures in automated tests.

## Await their backend phases

- Phase 4: brands, catalog availability v2 and final negotiation-field removal.
- Phases 7–8: revised cancellation rules, cancellation requests, price-change
  acceptance, handover, collection amounts, failure reasons, retry and custody.
- Phases 8/10: own delivery statement, wages and related read-only views.
- Phase 9: revised returns and refund rules.
- Native push registration/delivery after the production push gateway is ready.

## Remaining existing product work

Customer loyalty balance/ledger, delivery filtering and richer delivery details,
notification preferences and other journeys should be scheduled against their
actual available contracts. No new API fields are inferred from the analysis.

Administrative catalog/users/stock/purchases/finance/reports/settings execution
is outside this application's scope. Responsive layouts remain supported for
phones/tablets and the explicitly requested isolated Chrome development preview.

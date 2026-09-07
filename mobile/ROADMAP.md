# Flutter — Living Execution Roadmap

## Current status

- Last reviewed: 2026-09-07, against the `mobile` implementation at `dbd9fac` plus the completed order-history and UI corrections and OpenAPI contract 1.1.0.
- Current phase: **1 — Complete the guest and customer experience with mock data**; the core journey exists, but production integration is not complete.
- Completed objective: order-history pagination and repository-level status filtering with mock data; technical verification passed and Ahmed confirmed final manual acceptance on 2026-09-07, including the checkout and UI corrections made during review.
- Next objective: complete wishlist pagination, followed by addresses; neither is started in this increment.
- Next phase: **2 — Delivery Agent**, after completing the ready customer items; isolated contract gaps do not prevent moving on.
- Main blockers: order-to-delivery linkage, after-sales data retrieval, delivery-agent and cash-collection data, and inventory links; details in B1–B10.

`[x]` completed and verified within the stated scope, `[ ]` remaining, `[~]` in progress, `[!]` deferred/blocked.
**implemented** = implemented; **partial** = partially working; **placeholder** = “Coming soon”; **mock** = test data. A remote implementation does not prove successful integration.

## 0 — Shared foundation: implemented

- [x] App startup, Arabic/English and RTL, theme and branding loaded from settings, navigation and role/permission guards, and shared components including the corrected snackbar animation.
- [x] Mock/remote separation, networking and error layers, OTP sign-in, session restoration, and secure storage. Token refresh is not included in the completed work; see phase 4.

## 1 — Guest / Customer: partial, working with mock data

- [x] Browsing, departments, search, filtering and product pagination, details, images, variants, availability, and reading reviews; display of points and negotiability information.
- [x] Guest → sign-in → original destination journey, with correct back navigation and no automatic replay of add or purchase actions.
- [x] Cart, wishlist and address operations, and cash-on-delivery checkout with an address and coupon; mock and remote repositories exist. Completion of large lists remains below.
- [x] Order details, status timeline and cancellation, and product reviews and partial returns after delivery. Mock reviews are `pending`, and returns produce receipts only; no approval, refund, or stock adjustment.
- [x] Order-history pagination and repository-level status filtering: implemented with mock data, including all contract statuses, refresh, append retry and stale-response protection; technical checks and Ahmed’s final manual verification passed. See the [order-history progress record](docs/order-history-mock-progress.md).
- [ ] Complete wishlist and address pagination. Wishlist reads the first page; addresses read up to 100 items without fetching subsequent pages.
- [ ] Loyalty balance and points ledger via `GET /loyalty`; the contract is available, but the feature is not implemented.
- [ ] Automatic tracking updates; currently read only on load. The read contract and mock data are sufficient to start, without assuming WebSocket.
- [!] Delivery rating B1, after-sales history/status retrieval B2, account completion B3, and help and privacy B4.
- [!] Points negotiation/redemption B10; displaying points does not implement these operations.

## 2 — Delivery Agent: placeholder

Only role-directed sign-in and a “Coming soon” screen exist, with no delivery-agent repository or operational journey.

- [ ] Delivery list and status updates with mock data via `GET /deliveries/assigned` and `PATCH /deliveries/{id}`; the contract is available.
- [!] Order details, address, map, and cash-collection confirmation B5.

## 3 — Store Admin / Staff: placeholder with permission guards implemented

The section grid respects permissions, but tapping a section shows “Coming soon”. This phase includes Flutter Web inside `mobile/`, not the `web/` project.

- [ ] Catalog, user and role management; then suppliers and warehouse/location selection as the foundation for subsequent operations.
- [ ] Create a purchase invoice and receive it into locations, then display batches and movements, and perform adjustments and transfers. Contracts exist; invoice and balance retrieval depends on B6.
- [ ] Admin order list, confirmation and status updates, preparing for batch- and location-guided picking.
- [!] Complete purchase-invoice resumption, per-location batch balances, and access to pick lists B6.
- [!] Returns processing: access and approval, then inspection and restocking/quarantine B2; an inspection contract does not complete the journey.
- [ ] Sales and top-products reports; both are supported in `SalesReport`.
- [!] Low-stock reporting and saving store settings B7.

## 4 — Integration and completion of shared journeys

Integration of a ready feature can be brought forward when a live environment is available, without waiting for all roles to be complete.

- [ ] Session refresh via `POST /auth/refresh`; the contract exists, but the app ends the session on 401. Ready for implementation, not waiting for an API change.
- [ ] Verify live integration: purchase → confirmation/picking → delivery and cash collection → points/review → return; including server outcomes, permissions, and network failures.
- [!] Order-status notifications via FCM are deferred to integration B8; no notification service is currently implemented.
- [ ] Complete unblocked items and update run instructions; the old missing-feature list in README is not a valid backlog.

## 5 — Release readiness

- [x] Isolate personal iOS signing-team selection in a local setting excluded from Git; this is development configuration, not proof of release readiness.
- [ ] Prepare Android/iOS releases, distribution signing, and approved publishing metadata; Android release currently uses debug signing.
- [ ] Acceptance of critical journeys on physical devices and Flutter Web using release builds; no `integration_test` tests currently exist.
- [!] Establish a CI gate that blocks on failure with the team B9.

## Blocker and decision register

These conditions apply to feature completion; do not defer the rest of the phase if it can be developed against the current contract.

| ID | Reason for deferral / missing dependency | Current interim implementation | Resumption condition |
|---|---|---|---|
| B1 — Delivery rating | Rating is available, but there is no `delivery_id` in the customer's order/tracking data or an alternative read operation permitted for the customer. | Product reviews only. | Add the link/read operation to the contract; do not substitute `order_id`. |
| B2 — After-sales | No reads for return history/details or the user's review status, and no return-approval operation. | Session receipts only; admin is a placeholder. | Provide read operations, permissions, and approval/processing transitions; final eligibility comes from the server. |
| B3 — Account | No operations to edit the user's own account or photo, or delete the account. | Name held in session memory; photo and deletion are placeholders. | Approve account, photo, and deletion contracts; user management is not a substitute. |
| B4 — Help and privacy | No approved content or destination is established in the reviewed implementation and documentation. | Two entries showing “Coming soon”. | Receive approved text/links from the product owner. |
| B5 — Delivery-agent journey | `Delivery` returns `order_id` without an address; permission to read the order/customer address and cash-collection semantics are unclear. | Placeholder, no map or cash collection. | Document permitted data and whether `delivered` confirms collection or a separate operation is required; approve the map approach. |
| B6 — Warehouse workflow continuity | No invoice reads, pick-list listing/link from the order, or per-location batch balance. | Placeholder; contracts for creation/receiving, picking by ID, and movements are available. | Add reads, links, and location balances; `qty_received` is not a current balance. |
| B7 — Reports and settings | The contract provides sales and `top_products`, but no low-stock report or settings-save operation. | Sections are placeholders; branding reads exist. | Approve the low-stock definition and response, and the settings-save operation and its permission. |
| B8 — FCM | The device token contract exists; Firebase configuration, notification payload, and destination are not approved in Flutter. Deferred to integration. | No notifications or notification simulation. | Provide configuration, approve the payload, connect server-side sending, and test receipt. |
| B9 — Release gate | Shared CI bypasses Flutter analysis/test failures with `|| true`; outside Flutter scope. | Local tests; a non-blocking gate. | Change it in coordination with its owner and verify that failures block progression. |
| B10 — Points operations | Deferred under architecture rule 14; no operational negotiation/redemption contract. | Product information display only; the balance screen remains a separate pending item. | A product decision to enable the operations and approval of their contracts; not a prerequisite for completing the current customer phase. |

## Status evidence and verification limits

- Sources: `lib/` and `test/`, [API](../api/openapi.yaml), [Flutter requirements](../prompts/MOBILE_CLAUDE_FULL.md), [Architecture](../docs/ARCHITECTURE.md), [Database schema](../infra/db/schema.sql). A table's existence does not prove API availability.
- The [customer progress record](docs/customer-mock-progress.md) documents 115 passing tests, successful analysis, and simulator checks of selected journeys; these are previous results, not rerun during the planning task. `[x]` does not imply production or comprehensive visual verification.
- Completed increment, including checkout-to-pending navigation, dark snackbar contrast, and responsive product cards with two-line name slots: all 176 Flutter tests passed; `flutter analyze` reports no issues. Widget coverage includes repository filters, later-page loading/retry, refresh, empty states, Arabic/English layouts, light/dark modes, and enlarged text. Ahmed confirmed manual acceptance on 2026-09-07; no live backend was contacted.
- Deployed backend and SMS/FCM readiness, successful remote operation against a live server, and store-release approval are **unverified**; this does not mean the team's work does not exist.
- Update when a feature/phase is completed or a significant dependency changes: status, next objective, and completion evidence or blocking condition. Execution rules belong in [AGENTS.md](AGENTS.md), not this roadmap.

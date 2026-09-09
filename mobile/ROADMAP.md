# Flutter — Living Execution Roadmap

## Current status

- Last reviewed: 2026-09-08, against the `mobile` implementation at `fe9f6ec` plus the delivery-agent and admin-foundation increments and OpenAPI contract 1.1.0.
- Current phase: **3 — Store Admin / Staff foundation with mock data**, selected by Ahmed; remaining phase-1 work is not implied complete.
- Completed objective: order-history pagination and repository-level status filtering with mock data; technical verification passed and Ahmed confirmed final manual acceptance on 2026-09-07, including the checkout and UI corrections made during review.
- Completed objective: wishlist pagination with mock data, including the stock-badge direction correction during review; technical verification passed and Ahmed confirmed final manual acceptance on 2026-09-08.
- Completed objective: address pagination with mock data; technical verification passed and Ahmed confirmed final manual acceptance on 2026-09-08.
- Latest completed objective: assigned-delivery list and status updates with mock data; technical checks and Ahmed’s final manual verification passed on 2026-09-08.
- Current objective: catalog, users and roles, supplier read/create, and warehouse/location selection with mock data; implementation is ready for final manual verification. See the [admin foundation progress record](docs/admin-foundation-mock-progress.md).
- Delivery follow-up: status Chips with server-side filtering and pagination, pending the contract extension in B11. Loyalty balance/ledger and automatic customer tracking updates remain outside this increment; B1–B5 and B10 remain deferred.
- Main blockers: order-to-delivery linkage, after-sales data retrieval, delivery-agent and cash-collection data, inventory links, and delivery status filtering; details in B1–B11.

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
- [x] Wishlist pagination: all repository pages are loaded before publishing the complete saved-product set, keeping heart buttons correct for later-page products. Refresh, retry, mutations and session changes are covered; technical checks and Ahmed’s final manual verification passed. See the [wishlist progress record](docs/wishlist-mock-progress.md).
- [x] Address pagination: all repository pages load for address management and checkout, including later-page default selection, refresh/retry, consistent mutations and stale-response protection. Technical checks and Ahmed’s final manual verification passed. See the [address progress record](docs/address-mock-progress.md).
- [ ] Loyalty balance and points ledger via `GET /loyalty`; the contract is available, but the feature is not implemented.
- [ ] Automatic tracking updates; currently read only on load. The read contract and mock data are sufficient to start, without assuming WebSocket.
- [!] Delivery rating B1, after-sales history/status retrieval B2, account completion B3, and help and privacy B4.
- [!] Points negotiation/redemption B10; displaying points does not implement these operations.

## 2 — Delivery Agent: partial, working with mock data

Role-directed sign-in now opens the assigned-delivery list. The existing `delivery.assigned` permission gates reads and updates; account/settings navigation is preserved.

- [x] Delivery list and status updates with mock data via `GET /deliveries/assigned` and `PATCH /deliveries/{id}`: paginated list, all five read statuses, the three permitted update values, confirmation, refresh/retry and stale-response protection are implemented. Technical checks and Ahmed’s final manual verification passed. See the [delivery-agent progress record](docs/delivery-agent-mock-progress.md).
- [!] Delivery status Chips with server-side filtering and pagination B11: add All plus `assigned`, `out_for_delivery`, `delivered`, `failed` and `returned`. Extend `GET /deliveries/assigned` with optional `status`; omit it for All. The server must filter the current agent’s deliveries before pagination, return the matching `total` in the existing `DeliveryPage`, and use a documented stable ordering with a unique tie-breaker. Preserve `delivery.assigned` access and agent scoping. Update OpenAPI and response examples, including empty results. On filter changes the app restarts at page one and retains the chosen status on subsequent pages. Acceptance example: 45 matching deliveries produce pages of 20, 20 and 5 with `total=45`, without other statuses or agents. Existing unfiltered pagination is already complete; this is a separate pending enhancement.
- [!] Order details, address, map, and cash-collection confirmation B5.

## 3 — Store Admin / Staff: foundation implemented with mock data, manual verification pending

The permission-aware grid opens catalog and user/role management, suppliers, and warehouse/location selection. Other operational sections remain placeholders. This phase includes Flutter Web inside `mobile/`, not the `web/` project.

- [~] Catalog, user and role management; supplier read/create and warehouse/location selection: mock/remote repositories, contract-supported pagination/search/filtering, forms, permission guards, refresh/retry and stale-response protection are implemented. Technical verification is recorded below; Ahmed’s final manual verification is pending. See the [admin foundation progress record](docs/admin-foundation-mock-progress.md).
- [!] Remote admin catalog visibility: confirm that authenticated `/products` and `/categories` reads include hidden/archived products and inactive categories, or provide explicit admin reads. The current contract does not guarantee this; mock management retains these records. Supplier update/delete and warehouse/location writes are not defined and are outside the implemented foundation. Existing mock login fixtures are unchanged; created accounts/custom roles need separate authentication integration.
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
| B5 — Delivery-agent journey | `Delivery` returns `order_id` without an address; permission to read the order/customer address and cash-collection semantics are unclear. | Assigned list and status updates with mock data; no order-detail retrieval, map or cash collection. | Document permitted data and whether `delivered` confirms collection or a separate operation is required; approve the map approach. |
| B6 — Warehouse workflow continuity | No invoice reads, pick-list listing/link from the order, or per-location batch balance. | Placeholder; contracts for creation/receiving, picking by ID, and movements are available. | Add reads, links, and location balances; `qty_received` is not a current balance. |
| B7 — Reports and settings | The contract provides sales and `top_products`, but no low-stock report or settings-save operation. | Sections are placeholders; branding reads exist. | Approve the low-stock definition and response, and the settings-save operation and its permission. |
| B8 — FCM | The device token contract exists; Firebase configuration, notification payload, and destination are not approved in Flutter. Deferred to integration. | No notifications or notification simulation. | Provide configuration, approve the payload, connect server-side sending, and test receipt. |
| B9 — Release gate | Integration review removes the shared CI failure bypasses. | Flutter dependency installation, analysis, and tests are separate blocking steps. | Confirm all steps pass on merged main; device/release acceptance remains separate. |
| B10 — Points operations | Deferred under architecture rule 14; no operational negotiation/redemption contract. | Product information display only; the balance screen remains a separate pending item. | A product decision to enable the operations and approval of their contracts; not a prerequisite for completing the current customer phase. |
| B11 — Delivery status filtering | `GET /deliveries/assigned` defines pagination but no `status` query parameter. | Unfiltered paginated delivery list and status updates are complete with mock data; status Chips are not implemented. | Agree and document optional status filtering before pagination, filtered totals, stable ordering and current-agent scoping in OpenAPI; then implement Chips and repository filtering with mock data and verify remote integration when available. |

## Status evidence and verification limits

- Sources: `lib/` and `test/`, [API](../api/openapi.yaml), [Flutter requirements](../prompts/MOBILE_CLAUDE_FULL.md), [Architecture](../docs/ARCHITECTURE.md), [Database schema](../infra/db/schema.sql). A table's existence does not prove API availability.
- The [customer progress record](docs/customer-mock-progress.md) documents 115 passing tests, successful analysis, and simulator checks of selected journeys; these are previous results, not rerun during the planning task. `[x]` does not imply production or comprehensive visual verification.
- Completed increment, including checkout-to-pending navigation, dark snackbar contrast, and responsive product cards with two-line name slots: all 176 Flutter tests passed; `flutter analyze` reports no issues. Widget coverage includes repository filters, later-page loading/retry, refresh, empty states, Arabic/English layouts, light/dark modes, and enlarged text. Ahmed confirmed manual acceptance on 2026-09-07; no live backend was contacted.
- Wishlist increment, 2026-09-08: formatting completed, `flutter analyze` reports no issues, and all 200 Flutter tests passed after the shared product-card stock-badge direction correction. Coverage includes later-page membership, retry without partial data, mutation failures, refresh sequencing, session changes, narrow Arabic layouts in light/dark modes, and badge placement opposite the wishlist heart in both languages. Ahmed confirmed final manual acceptance on 2026-09-08; no live backend was contacted.
- Address increment, 2026-09-08: formatting completed, `flutter analyze` reports no issues, all 30 focused address/checkout tests and all 224 Flutter tests passed. Coverage includes 105 addresses beyond the old limit, later-page default selection and checkout submission, retry, mutations, session changes, empty refresh, and 320-pixel Arabic/English layouts in light/dark modes. Ahmed confirmed final manual acceptance on 2026-09-08; no live backend was contacted.
- Delivery-agent increment, 2026-09-08: generated model/localizations and formatting completed, `flutter analyze` reports no issues, all 41 focused delivery/router tests and all 255 Flutter tests passed. Coverage includes pagination and retries, status confirmation and failed writes, read/write sequencing, stale-session responses, permission denial, empty refresh, and 320-pixel Arabic/English layouts in light/dark modes with 2× text. Ahmed confirmed final manual acceptance on 2026-09-08; status Chips/filtering are tracked separately under B11. No live backend was contacted.
- Deployed backend and SMS/FCM readiness, successful remote operation against a live server, and store-release approval are **unverified**; this does not mean the team's work does not exist.
- Update when a feature/phase is completed or a significant dependency changes: status, next objective, and completion evidence or blocking condition. Execution rules belong in [AGENTS.md](AGENTS.md), not this roadmap.

- Admin-foundation increment, 2026-09-08: formatting and localization generation completed; `flutter analyze` reports no issues, all 31 focused admin tests and all 286 Flutter tests passed, and `flutter build web --dart-define=DATA_SOURCE=mock` succeeded. Coverage includes catalog/user/role CRUD, contract payloads, filtered pagination, permission/session changes, failed-save retry, confirmed deletion, second-page location selection, and Arabic/English layouts at 320/402/1280 pixels in light/dark modes. Final manual verification remains pending; no live backend was contacted.

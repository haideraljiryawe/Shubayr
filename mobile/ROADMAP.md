# Flutter — Living Execution Roadmap

## Current status and reviewed baseline

- Last reviewed: **2026-09-10**. Integration branch: `mobile`; latest completed increment: B3a self-profile updates, manually accepted on 2026-09-10. Earlier committed baseline: `174e3ea` (admin orders).
- Shared contract: `api/openapi.yaml` synchronized byte-for-byte from `origin/main` at `f458690` (latest contract-changing commit: `89c9120`). OpenAPI still reports **1.1.0**, so the commit is part of the baseline; version alone does not identify the reviewed changes.
- Current focus: **1 — Guest / Customer contract adaptations**. B3a name/email editing is complete and manually accepted on 2026-09-10. Phase 3 admin foundation still awaits manual/design acceptance; admin orders are complete.
- Delivery status Chips **B11** is ready; own name/email editing **B3a** is complete and manually accepted. Other new client adaptations remain **R1–R4**; contract receipt alone does not complete them.
- Main remaining dependencies: B1, B2, B3b, B4, B5, B6, B7, B8, B10, B12 and B13. B9 has an upstream CI fix awaiting local adoption and verification.
- Source changes, scope of synchronization and per-item decisions: [contract synchronization log](docs/contract-sync-log.md). No backend/web code, database migration, CI change or new UI feature was applied during this documentation sync.

## Reading and maintaining task status

| Marker | Meaning |
|---|---|
| `[x]` | Implemented and technically/manually accepted within its stated scope. Does not mean live integration or production readiness. |
| `[ ]` | Not implemented yet. The stated mock/client scope is ready unless an explicit integration or release prerequisite is named. |
| `[~]` | Implemented work still awaiting verification/design acceptance, or an explicitly described partial increment. |
| `[!]` | Deferred or blocked; the linked B entry states the remaining dependency and resumption condition. |

**Contract readiness and application completion are separate.** A received API change normally moves a task from `[!]` to `[ ]`, never directly to `[x]`. Split a partially resolved item, as with B3a/B3b, while preserving its original B identifier and history.

### Ready work index

This is an index into the phase tasks, not a second checklist. It does not select the next task automatically.

| Area | Ready scope | Phase / reference |
|---|---|---|
| Delivery | Status Chips with server-side filtering before pagination | 2 / B11, newly unblocked |
| Orders | Consume saved item names/images instead of relying entirely on the current catalog | 1 / R1, new adaptation |
| Promotions | Original price, discount display and on-sale filter; admin price input | 1 and 3 / R2 |
| Banners | Active home banners and permission-aware admin management | 1 and 3 / R3 |
| Catalog | Verify bilingual-name validation/fallback against the revised contract | 1 and 3 / R4 |
| Reports | Sales and top products, with date selection | 3 |
| Inventory reads | Paginated batches and movements with supported filters | 3 |
| Purchasing | Create and receive a new invoice in the same session | 3; resuming old invoices still depends on B6 |
| Customer / shared | Loyalty balance/ledger, automatic tracking refresh, session-token refresh | 1 and 4; points operations remain deferred under B10 |

## 0 — Shared foundation: implemented

- [x] App startup, Arabic/English and RTL, theme and branding loaded from settings, navigation and role/permission guards, and shared components including the corrected snackbar animation.
- [x] Mock/remote separation, networking and error layers, OTP sign-in, session restoration, and secure storage. Token refresh is not included; see phase 4.

- [~] Cross-platform responsive layout: central breakpoints/content sizing, adaptive catalog and management card grids, multi-column forms, adjacent detail/summary regions, matching loading states and resize-state protection are implemented. Formatting, analysis, all 364 tests and the mock Web build passed; final visual/manual acceptance pending. See [responsive layout progress](docs/responsive-layout-progress.md).

## 1 — Guest / Customer: partial, working with mock data

- [x] Browsing, departments, search, filtering and product pagination, details, images, variants, availability, and reading reviews; display of points and negotiability information. New promotion and bilingual-contract adaptations are tracked separately under R2/R4.
- [x] Guest → sign-in → original destination journey, with correct back navigation and no automatic replay of add or purchase actions.
- [x] Cart, wishlist and address operations, and cash-on-delivery checkout with an address and coupon; mock and remote repositories exist.
- [x] Order details, status timeline and cancellation, and product reviews and partial returns after delivery. Mock reviews are `pending`, and returns produce receipts only; no approval, refund, or stock adjustment. New order-item snapshots are a separate R1 increment.
- [x] Order-history pagination and repository-level status filtering with mock data; technical checks and Ahmed’s final manual verification passed. See the [order-history progress record](docs/order-history-mock-progress.md).
- [x] Wishlist pagination, complete later-page membership, retry/mutation/session protection and stock-badge direction correction; technical checks and manual verification passed. See the [wishlist progress record](docs/wishlist-mock-progress.md).
- [x] Address pagination, including later-page default selection in checkout, refresh/retry and mutation/session protection; technical checks and manual verification passed. See the [address progress record](docs/address-mock-progress.md).
- [x] **B3a — Own profile name/email:** implemented `PATCH /me` through mock/remote auth repositories, partial name/email updates and explicit email clearing; session updates only after success with stale-response protection. Responsive form supports validation and failure/retry without losing drafts. All 384 tests, analysis and mock Web build passed; Ahmed confirmed manual acceptance on 2026-09-10. Mock persistence lasts for the repository lifetime. Phone/photo/deletion remain outside this operation. See [profile self-update progress](docs/profile-self-update-progress.md).
- [ ] **R1 — Order-item snapshots:** add `product_name_ar`, `product_name_en` and nullable `image_url` to models/mocks; show the saved purchase-time name/image in order and relevant after-sales views. Preserve compatibility with older responses/orders lacking snapshots. Current order details fetch current catalog names/images. This does not supply customer/address/delivery linkage or resolve B1/B5.
- [ ] **R2 — Promotions:** consume `compare_at_price` and read-only `discount_percent`, display the original price/discount when applicable, and pass `on_sale` to the product repository before pagination. No discount when original price is null or no greater than sale price. Admin editing is tracked in phase 3; points negotiation/redemption remains B10.
- [ ] **R3 — Home banners:** read active banners through `GET /banners`, preserve the specified ordering and schedule semantics in mock, and render the supplied content/image/action fields using the existing design. Do not add language-specific API fields absent from Banner. Admin management is the separate phase-3 scope.
- [ ] **R4 — Bilingual catalog compatibility:** review reads/mocks and regression coverage for missing, empty and whitespace-only Arabic/English names, following the server's fallback to the other language. Keep existing approved layout values. This is a targeted compatibility task, not a redesign.
- [ ] Loyalty balance and points ledger via `GET /loyalty`; the contract is available, but the feature is not implemented.
- [ ] Automatic tracking updates; currently read only on load. The read contract and mock data are sufficient to start, without assuming WebSocket.
- [!] Delivery rating B1; after-sales history/status retrieval B2; profile photo/account deletion B3b; help and privacy B4.
- [!] Points negotiation/redemption B10; displaying points does not implement these operations.

## 2 — Delivery Agent: partial, working with mock data

Role-directed sign-in opens the assigned-delivery list. `delivery.assigned` gates reads and updates; account/settings navigation is preserved.

- [x] Unfiltered delivery list and status updates with mock data via `GET /deliveries/assigned` and `PATCH /deliveries/{id}`: pagination, all five read statuses, three permitted update values, confirmation, refresh/retry and stale-response protection. Technical checks and final manual verification passed. See the [delivery-agent progress record](docs/delivery-agent-mock-progress.md).
- [ ] **B11 — Delivery status Chips, now ready:** implement All plus `assigned`, `out_for_delivery`, `delivered`, `failed`, `returned` using the newly documented optional `status` parameter. Omit it for All; filter within the current agent before pagination, return matching totals, and use `dispatched_at DESC, id DESC`. Reset to page one when the status changes and retain it on append/refresh/retry. Acceptance: 45 matches yield 20/20/5, matching total, no other statuses/agents, and correct empty results. **Contract dependency resolved by `dc5df9b`; client implementation remains pending.**
- [!] Order details, address, map, and cash-collection confirmation B5.

## 3 — Store Admin / Staff: mock foundation and orders implemented; foundation acceptance pending

The permission-aware grid opens catalog and user/role management, suppliers, warehouse/location selection, and admin orders. Other operational sections remain placeholders. This phase includes Flutter Web inside `mobile/`, not the `web/` project.

- [~] Catalog, user and role management; supplier read/create and warehouse/location selection: mock/remote repositories, supported pagination/search/filtering, forms, permission guards and retry/session protection are implemented. Technical verification passed; final manual/design acceptance remains pending. See the [admin foundation progress record](docs/admin-foundation-mock-progress.md).
- [ ] **R2 — Admin promotion price:** add `compare_at_price` to product forms and write payloads; handle clearing/removing a discount. Keep `discount_percent` read-only and preserve existing catalog inputs.
- [ ] **R3 — Admin banners:** implement paginated list, detail, create, edit and delete using `/admin/banners` and `/admin/banners/{id}` under `catalog.manage`, including active state, display order and optional start/end scheduling. This is separate from customer banner display.
- [ ] **R4 — Admin bilingual validation review:** existing forms already require trimmed Arabic/English names. Verify mock/remote create and update behavior and field-level validation handling against the new non-whitespace requirements; change only identified gaps and add regression coverage.
- [!] Complete admin visibility of hidden/archived products and inactive categories B12; supplier update/delete and warehouse/location writes B13.
- [ ] Create a **new** purchase invoice and receive it into selected locations in the same session using existing POST contracts. Resuming an older invoice is excluded until B6 provides reads.
- [ ] Display paginated inventory batches and movements: batches support `product_id`; movements support `batch_id` and `type`. Do not label `qty_received` as current stock or invent an expiry query parameter from an endpoint summary.
- [!] Complete stock adjustments/transfers with per-location balance guidance, purchase-invoice resumption and batch/location-guided picking B6. Write endpoints exist, but they do not supply the missing reads and links.
- [x] Admin order list, confirmation and status updates with mock data: nine status Chips plus All, repository search/status/date filtering before pagination, confirmation, `orders.view` / `orders.update` guards, refresh/retry and stale-response protection. Changes restart page one to avoid skipping rows. Technical checks and Ahmed’s manual verification passed on 2026-09-09. Picking remains B6. See the [admin orders progress record](docs/admin-orders-mock-progress.md).
- [!] Returns access, approval, inspection and restocking/quarantine B2; an inspection contract does not complete the journey.
- [ ] Sales and top-products reports via `GET /admin/reports/sales`, with date range, totals, daily breakdown and `top_products` from `SalesReport`.
- [!] Low-stock reporting and saving store settings B7.

## 4 — Integration and completion of shared journeys

Integration of a ready feature can be brought forward when a live environment is available, without waiting for all roles to be complete.

- [ ] Session refresh via `POST /auth/refresh`; the contract exists, but the app ends the session on 401. Ready for implementation, not waiting for an API change.
- [ ] Verify managed accounts/custom roles and session permission refresh against real authentication. Admin mock changes records only; existing phone-based mock login fixtures are unchanged.
- [ ] Verify live purchase → confirmation/picking → delivery/cash collection → points/review → return journeys as their dependencies are resolved. Mock acceptance does not establish server effects or cross-role synchronization.
- [!] Order-status notifications via FCM remain deferred to integration B8; no notification service is implemented.
- [ ] Keep run instructions and this roadmap aligned with each accepted increment; the old missing-feature list in README is not a valid backlog.

## 5 — Release readiness

- [x] Isolate personal iOS signing-team selection in a local setting excluded from Git; this is development configuration, not proof of release readiness.
- [ ] Prepare Android/iOS releases, distribution signing, and approved publishing metadata; Android release currently uses debug signing.
- [ ] Acceptance of critical journeys on physical devices and Flutter Web using release builds; no `integration_test` tests currently exist.
- [ ] **B9 — Adopt and verify the upstream CI fix:** `c550044` on `main` removes `|| true` from Flutter analysis/tests. The local `mobile` workflow was not synchronized in this documentation task. Coordinate adoption with its owner and verify failing checks actually block the required merge/release gate; branch-protection enforcement is unverified.

## Dependency and decision register

Keep resolved and partially resolved IDs for traceability. The application task remains in its phase until implemented and accepted.

| ID | Dependency status after this review | Current scope / remaining requirement | Evidence or resumption condition |
|---|---|---|---|
| B1 — Delivery rating | Blocked, unchanged | No `delivery_id` or customer-permitted alternative read in order/tracking data. | Provide link/read permission; order-item snapshots do not resolve this. |
| B2 — After-sales | Blocked, unchanged | No return history/detail or review-status reads, and no return-approval operation. | Provide reads, permissions and approval transitions; server remains authoritative. |
| B3 — Account | **Partially resolved** | **B3a complete, manually accepted:** name/email through `PATCH /me`. **B3b blocked:** photo and account deletion. Phone change needs OTP and has no new dedicated change flow here. | `89c9120` resolved B3a's contract gap; implementation and 384-test evidence are in the profile progress record. Obtain the remaining contracts for B3b. |
| B4 — Help/privacy | Deferred, unchanged | Approved content/destinations are not established. | Product owner supplies approved text/links. |
| B5 — Delivery journey | Blocked, unchanged | Delivery lacks address; permitted order/address reads and cash-collection semantics remain unclear. | Document data access/collection behavior and map approach; B11 only fixes list filtering. |
| B6 — Warehouse continuity | Blocked, unchanged | Invoice reads, pick-list list/order link and per-location batch balances are missing. Admin orders and warehouse selection are implemented foundations only. | Add reads/links/balances; `qty_received` is not a current balance. New invoice creation/receiving and inventory read lists can proceed separately. |
| B7 — Reports/settings | Partially available, unchanged | Sales/top products available; low-stock report and settings-save contract absent. | Agree low-stock semantics/response and settings-write permission. Do not hold up sales reports. |
| B8 — FCM | Deferred to integration | Firebase setup, payload/destination approval and server sending integration pending. | Supply configuration and approved payload, then verify receipt. |
| B9 — Release gate | **Upstream fix available; adoption/verification pending** | `main` no longer suppresses Flutter failures. Current `mobile` workflow and branch protection still need coordinated verification. | `c550044`; adopt/test separately. No new change from Haider is needed merely to remove `|| true`. |
| B10 — Points operations | Deferred, unchanged | Operational negotiation/redemption contract/product approval absent. | Approved product decision and contracts; balance display and promotion prices are separate tasks. |
| B11 — Delivery filtering | **Contract blocker resolved; client ready** | Optional status, agent scoping, filtered total, stable ordering and examples are documented. Chips/filtering remain unimplemented in Flutter. | `dc5df9b`; implement phase-2 task with mock, then verify remote when available. |
| B12 — Admin catalog visibility | Blocked, unchanged; previously unnumbered | Public product/category reads still do not explicitly guarantee hidden/archived/inactive records for admins. | Confirm visibility or add admin reads. New name fallback does not resolve visibility. |
| B13 — Supplier/location writes | Blocked, unchanged; previously unnumbered | Supplier edit/delete and warehouse/location creation/edit/delete are absent. | Add relevant write contracts/permissions if these extensions are required. Existing read/create/select scope stays valid. |

## Ongoing synchronization with Haider

Use this sequence whenever Ahmed asks to review a new contract delivery or starts a task affected by one. This is a repeatable review process, not an automatic background watcher, commit or push.

1. Fetch current upstream references and compare with the **last reviewed commit** in the synchronization log. Record the date, source branch/commit, author and exact changed files; a commit title, message or schema table alone does not prove API readiness.
2. Inspect the actual operations, fields, permissions, filters, pagination, examples and links. Compare them with Flutter code as well as the request originally sent to the team.
3. Import approved contract/document changes within the requested scope. Preserve local work; do not overwrite the roadmap with an older upstream copy or silently import unrelated backend/web/CI/branch-policy changes.
4. Update the matching phase task and stable B ID in the **same edit**. Fully resolved dependency → `[ ]`; partial resolution → separate ready/blocked scopes; implemented but awaiting acceptance → `[~]`; `[x]` only after implementation and required verification. Keep completed increments and add new adaptation tasks instead of erasing their history.
5. Append a synchronization record with source commit, received change, mobile gap, status transition and the precise remaining request to Haider. Distinguish received, imported, implemented and verified. For revisions that do not change an item, keep its status unchanged.
6. After implementation, record technical evidence and Ahmed's manual acceptance. Review related B entries again; do not close adjacent dependencies by association.

Pending team convention: upstream `c550044` changes mobile guidance to short-lived branches from `main`. Ahmed explicitly requested continued work/pushes on `mobile`; that direction remains in force. This review records the discrepancy without changing local branch rules. See the synchronization log for scope and source links.

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

- Admin-order increment, 2026-09-09: formatting and localization generation completed; `flutter analyze` reports no issues, all 33 focused admin-order tests and all 319 Flutter tests passed, and `flutter build web --dart-define=DATA_SOURCE=mock` succeeded. Coverage includes combined repository filtering, pagination, confirmation/cancellation, read-only access, failed writes and reloads, stale filters/sessions, queued read/write consistency, and 320-pixel Arabic/English light/dark layouts with 2× text. Ahmed confirmed final manual acceptance on 2026-09-09; B6 picking and live backend integration remain outside this increment.

- Contract/document synchronization, 2026-09-10: imported the exact upstream API contract from `f458690`; reconciled B3/B9/B11, assigned B12/B13 and added R1–R4. Checked source equality, Markdown links and status consistency. No Flutter source changed or runtime checks rerun. See the [synchronization log](docs/contract-sync-log.md).

- Responsive-layout increment, 2026-09-10: central breakpoint/content layout policy and adaptive operational screens are implemented. Formatting completed; `flutter analyze` reports no issues; all 364 tests passed; `flutter build web --dart-define=DATA_SOURCE=mock` succeeded. The new 38-case widget matrix covers 29 screen/form configurations at 390–1920 pixels, including both sides of every breakpoint, Arabic/light and English/dark, plus 2× text at five widths. Additional regressions protect draft/focus/validation, full-width append retry and delivery confirmation across resizing. Final visual/manual acceptance remains pending; no Simulator/Emulator was started. See [responsive layout progress](docs/responsive-layout-progress.md).

- B3a profile increment, 2026-09-10: name/email editing through mock/remote `PATCH /me`, partial updates/null email clearing, validation/retry and stale-session protection are implemented. User/localization generation and formatting completed; analysis clean; all 21 focused profile tests and all 384 Flutter tests passed; mock Web build succeeded. Ahmed confirmed manual acceptance on 2026-09-10; live-backend verification remains pending and phone/photo/deletion scope is unchanged. See [profile self-update progress](docs/profile-self-update-progress.md).

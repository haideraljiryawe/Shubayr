# Contract synchronization log

This log connects changes received from Haider with the live [roadmap](../ROADMAP.md).
It records contract readiness separately from Flutter implementation and acceptance.
Earlier feature progress records describe their own dated implementation snapshots;
this log and the roadmap record later changes to their dependencies.

## Latest reviewed baseline

| Item | Value |
|---|---|
| Review date | 2026-10-03 |
| Flutter baseline | C09 `15de4c2` on `mobile`; API 11 working changes pending review |
| Upstream reviewed/merged | `704bef71f0cd3db959756161284310aa2f433d05` |
| Contract | [api/openapi.yaml](../../api/openapi.yaml), exact upstream blob |
| Contract version | **11.0.0** |
| Comparison anchors | local v9 → `c006c7b` v10.0.2 → `704bef7` v11.0.0 |
| Integration state | Merge applied without conflicts; no commit or push |
| Next comparison baseline | `704bef7` |

## SYNC-2026-09-10 — reviewed and imported documentation

Ahmed requested synchronizing Haider's contract changes and organizing follow-up
work. The shared API contract was imported without changing its contents. The
roadmap was reconciled with the current Flutter implementation. No feature was
implemented or marked accepted as part of this sync.

| Source / received change | Flutter evidence and impact | Roadmap decision | Remaining team requirement |
|---|---|---|---|
| [dc5df9b · 2026-09-09](https://github.com/haideraljiryawe/Shubayr/commit/dc5df9baea22715ac97d96b88a95d24f0ad32ea1): delivery `status` query, agent scope, filtered total, `dispatched_at DESC, id DESC`, normal/empty examples | [Delivery repository](../lib/features/delivery/domain/delivery_repository.dart) has only page/per-page; current UI has no status Chips. | **B11 contract resolved:** phase-2 `[!]` → `[ ]`. Implement client/mocks; preserve accepted unfiltered list/status updates. | No additional contract request to start this client increment. Runtime integration remains separate. |
| [89c9120 · 2026-09-09](https://github.com/haideraljiryawe/Shubayr/commit/89c91207bf31a58bc985ac81cb3e4d823a3e42c6): `PATCH /me` and `UserSelfUpdate` | [Session updateProfile](../lib/features/auth/presentation/providers/auth_providers.dart) still edits name in memory; no remote self-update or email edit journey. | **B3 split:** B3a `[ ]` name/email; B3b `[!]` photo/deletion. At least one permitted field, validation and state-after-success belong to B3a. | Photo/deletion contracts still needed. This endpoint explicitly excludes phone; a phone-change journey needs OTP verification and its agreed flow. |
| [89c9120](https://github.com/haideraljiryawe/Shubayr/commit/89c91207bf31a58bc985ac81cb3e4d823a3e42c6): OrderItem saved Arabic/English product names and image URL | [OrderItem model](../lib/features/orders/data/order.dart) lacks snapshot fields; [order detail](../lib/features/orders/presentation/screens/order_detail_screen.dart) reads current catalog data. | **R1 `[ ]`:** models/mocks/views and old-response compatibility. Previous accepted order history/details remain `[x]` within their original scope. | No new contract request to start. No address/customer/delivery link is supplied by these fields; B1/B5 stay open. |
| [eca2fd4 · 2026-09-09](https://github.com/haideraljiryawe/Shubayr/commit/eca2fd4bb9bfad587714b48b475d2b7c9faa4027): non-whitespace bilingual write names and read fallback | [Admin form](../lib/features/admin/presentation/screens/admin_record_form.dart) already checks trimmed required names; [Product.localizedName](../lib/features/catalog/data/product.dart) tests emptiness, not whitespace. | **R4 `[ ]`:** targeted compatibility/validation review and regression coverage; no wholesale rewrite of completed catalog. | No new contract request for names. Admin visibility remains B12. |
| [4447744 · 2026-09-07](https://github.com/haideraljiryawe/Shubayr/commit/444774494b6c4e3d08e86a1000a56ad639a78a19): original price, computed discount and `on_sale` | [Product model](../lib/features/catalog/data/product.dart), [catalog repository](../lib/features/catalog/domain/catalog_repository.dart) and [admin inputs](../lib/features/admin/domain/admin_repository.dart) do not expose these fields/filter. | **R2 `[ ]`:** customer price/filter scope and admin original-price input. `discount_percent` is read-only. | No new contract request to start. Points operations B10 are unrelated. |
| [4447744](https://github.com/haideraljiryawe/Shubayr/commit/444774494b6c4e3d08e86a1000a56ad639a78a19): `/banners`, `/admin/banners` and Banner schemas | No banner repository/admin resource exists in Flutter. | **R3 `[ ]`:** separate public-display and admin-management scopes; active/scheduled content, ordering and permission guards follow the contract. | No extra fields are assumed. Language-specific banner fields, if later requested, need their own contract change. |
| [4447744](https://github.com/haideraljiryawe/Shubayr/commit/444774494b6c4e3d08e86a1000a56ad639a78a19): category `slug` | Mobile category filtering and navigation currently use IDs; the revised contract explicitly keeps filtering by `category_id`. | Recorded for compatibility; no mandatory mobile slug/SEO routing task inferred. | Product decision needed only if mobile slug/deep-link navigation is requested later. |
| [c550044 · 2026-09-07](https://github.com/haideraljiryawe/Shubayr/commit/c550044): CI removes ignored Flutter failures | Reviewed `.github/workflows/ci.yml` from `main`; local workflow still contains the old suppression. No workflow or branch-protection change was applied here. | **B9:** upstream fix available; phase 5 now tracks adoption and actual gate verification, rather than asking the team to write an already existing fix. | Coordinate adoption and verify required checks/branch protection. Neither passing nor failing GitHub runs were audited in this task. |

### Scope and unaffected dependencies

- Imported: `api/openapi.yaml` only from upstream, plus local edits to
  `mobile/ROADMAP.md` and this log. This was a selective document sync, not a
  merge of the whole `main` branch into `mobile`.
- `docs/ARCHITECTURE.md`, `prompts/MOBILE_CLAUDE_FULL.md` and the other reviewed
  shared `docs/` and `prompts/` files do not differ at this upstream revision;
  no replacement was needed.
- Upstream also has backend/web implementation, schema/SQL, CI, and unrelated
  mobile changes. They were not imported or executed. When runtime integration
  is requested, synchronize the relevant implementation/schema changes as a
  separate reviewed increment; copying the API document is not a migration or
  proof of deployed behavior.
- B1, B2, B3b, B4, B5, B6, B7, B8 and B10 retain their remaining dependencies.
  B12/B13 give stable IDs to the previously unnumbered admin visibility/write
  gaps. None is closed by banners, name fallback or order-item snapshots.
- B6 work was clarified into ready new-invoice creation/receiving and read-only
  batch/movement lists, versus the blocked complete resumption/picking/balance-
  guided adjustment/transfer journeys. Write endpoints remain present; the
  missing reads are still necessary for the latter scope.
- Foundation design/manual acceptance remains pending. Ahmed's accepted
  customer, delivery and admin-order increments remain completed.

### Branch-policy discrepancy for team coordination

The same upstream `c550044` updates `mobile/AGENTS.md` and `mobile/README.md` to
short-lived task branches from `main`, with PRs targeting `main`. Ahmed explicitly
directed this ongoing task to use and push to `mobile`. That instruction remains
active; local guidance was not replaced. Record a new decision if Ahmed and Haider
later agree to change this workflow. Do not switch branches or push based solely
on an imported document.

### Verification of this sync

- Checked the imported contract against the exact upstream blob.
- Reviewed actual API diffs and the relevant current Flutter models/repositories/
  forms before changing readiness labels.
- Checked roadmap/log references, local Markdown file links, and whitespace.
- No Flutter source changed; no new runtime/test success is claimed. Existing
  319-test, analysis, Web-build and manual-acceptance evidence retains its original
  implementation date. No commit or push is included in this synchronization.

## Implementation follow-up — B3a, 2026-09-10

B3a moved from ready to implemented/manual-acceptance-pending after a separate
client increment. The mock/remote self-update operation, nullable email model,
responsive form and session protection are implemented; analysis, all 384 tests
and the mock Web build passed. See [profile progress](profile-self-update-progress.md).
This records application progress, not a new contract import. B3b remains blocked.

## Manual acceptance — B3a, 2026-09-10

Ahmed confirmed the profile flow works and requested closing B3a plus a Git
commit/push to `mobile`. B3a is now `[x]`; live integration, B3b and the separate
responsive/admin-foundation acceptance states are unchanged.

## Implementation follow-up — R1, 2026-09-10

R1 moved from ready to implemented/manual-acceptance-pending. Order-item snapshot
fields, mock purchase-time capture, historical order/review/return display and
legacy/deleted-catalog compatibility are implemented. Analysis, all 75 focused
order tests, all 407 Flutter tests and the mock Web build passed. See
[order-item snapshots progress](order-item-snapshots-progress.md).
This is a client increment against the already imported contract, not a new
upstream synchronization. R2–R4 and B1/B2/B5 retain their existing scope/status.

## Manual acceptance — R1, 2026-09-10

Ahmed confirmed R1 is complete and requested a commit/push to `mobile`. R1 is
now `[x]`; live integration, R2–R4 and B1/B2/B5 retain their existing states.
The separate responsive and admin-foundation acceptance states are unchanged.

## Implementation follow-up — R2, 2026-09-11

Customer promotions and admin original-price editing moved from ready to
implemented/manual-acceptance-pending. Existing contract fields/filter are now
consumed by mock/remote repositories and UI; original-price clearing and computed
mock percentages are covered. Analysis, all 425 Flutter tests and the mock Web
build passed. See [promotions progress](promotions-progress.md).
This is a client increment, not a new contract import. R3/R4, B10 and separate
responsive/admin-foundation acceptance states remain unchanged.

## Manual acceptance — R2, 2026-09-11

Ahmed accepted R2 customer/admin promotions and requested commit/push to `mobile`.
Both R2 entries are now `[x]`; live integration and separate acceptance states
remain unchanged. R3 home banners is the next requested scope.

## Implementation follow-up — R3 home banners, 2026-09-11

Customer R3 moved from ready to implemented/manual-acceptance-pending. Public
banner reads, mock active/schedule/order semantics, responsive content/image/action
display and refresh/retry/stale-response handling are implemented. Ahmed explicitly
approved url_launcher for external banner links; dependency and iOS lock updates
are included. Analysis, all 36 focused tests, all 460 Flutter tests and the mock
Web build passed. See [home banners progress](home-banners-progress.md).
This is a client increment against the imported contract, not a new contract
synchronization. Admin R3 remains `[ ]`; R4 and all other acceptance/dependency
states are unchanged. No commit/push is included; final manual acceptance remains
pending.

## UI refinement — R3 image carousel, 2026-09-11

Ahmed requested a full-image hero carousel with title/subtitle overlays, whole-image
link actions, swipe looping, five-second animated autoplay and small overlay dots.
The implementation uses Flutter SDK paging and the existing approved url_launcher;
no new dependency or repository/API/scheduling change was needed. Missing/null
Banner titles normalize to empty to support image-only content. Refresh preserves
selection by ID and safely replaces controllers when list identities change.
Analysis, all 46 focused tests, all 470 tests and mock Web build passed. Customer
R3 stays `[~]` pending manual acceptance; admin R3 and other statuses are unchanged.
See [home banners progress](home-banners-progress.md). No commit or push.

## UI correction — R3 full-viewport paging, 2026-09-11

Moved banner margins and rounded clips into full-width PageView pages, retaining
image dimensions with `viewportFraction: 1.0`. A small brand pill indicator now
sits below the banner and tracks logical selection during dragging. Slow-drag
regressions cover phone/desktop and RTL/LTR. Analysis, all 51 focused tests, all
475 tests and mock Web build passed. No contract/repository/timer change; R3
remains `[~]` pending manual acceptance. No commit or push.

## Design refinement — Wide home banners and shared chips, 2026-09-11

Adjusted banner aspect ratios through AppLayout, removed Home's department heading,
and centralized chip radii/selected outlines/shadows in NavigationThemes.chip.
Reviewed existing choice/filter uses; no per-screen style duplication or filtering
changes were needed. Carousel behavior, contracts and repositories are unchanged.
Analysis, all 97 focused tests, all 481 tests and mock Web build passed. Visual
acceptance is pending; existing completed business scopes remain completed.
No commit or push. See [progress record](home-banners-progress.md).

## Format for the next synchronization record

Append a dated `SYNC-YYYY-MM-DD` record (add a suffix for a second review that day),
then update the latest-baseline table. Keep previous records as history.

For each received change record:

1. Source branch/commit, author/date and changed file/operation.
2. What was actually imported locally, versus only reviewed upstream.
3. Related B/R ID and readiness **before → after**; split partial resolutions.
4. Current Flutter evidence and the exact next client action.
5. Any remaining question for Haider, including the missing field, permission,
   read, link or behavior; do not repeat a resolved request.
6. Verification performed and separate implementation/manual-acceptance status.

Update the phase task, dependency register and ready-work index in the same edit.
Do not create a scheduled watcher, commit, push or send a message to the team
unless Ahmed requests that action.

## SYNC-2026-10-03 — API 11 alignment (review pending)

Baseline: clean `mobile` at C09 `15de4c2`. Fetched `origin/main`; Ahmed selected
`704bef71f0cd3db959756161284310aa2f433d05` explicitly. Directly read the complete
OpenAPI structures used by Mobile at local v9, `c006c7b` v10.0.2, and `704bef7`
v11.0.0, including transitive `$ref` dependencies. Compared object structure,
not just migration-document claims. `docs/mobile/contract-changes-v9-to-v10.md`
is historical evidence only (its last comparison is v10.0.1).

### Source integration

`git merge --no-ff --no-commit 704bef7` merged without conflicts. The incoming
changes outside Mobile are the exact upstream integration, not new edits to
Backend, Web Admin, web, contracts, or AGENTS. No commit/push is performed before
review. The imported root Git instructions conflict with Ahmed's explicit Mobile
branch/no-push workflow; his instructions and Mobile's review policy govern this
batch. C10–C22 are not included.

Incoming commits: `3f6fd7d` lifecycle v2; `4fe66f3` standing rules; `bd8d124`
supplier payments; `6ab672e` web/admin lifecycle screens; `be6936c` supplier-payment
UI; `b2a3c38` Baghdad exchange-rate timing; `c006c7b` web/admin production readiness;
`704bef7` permission dependencies and secure approval initiators.

### Complete consumed-operation inventory

All 41 method/path pairs below were compared for request bodies, queries, headers,
response schemas, requiredness, enums, transitions, concurrency, pagination,
errors, numeric precision, and nullability. “Unchanged” includes transitive
schemas unless the row identifies an addition. Shared `Error`/`FieldError` changes
are described below and apply wherever those envelopes occur.

| Area | Operations consumed | v9 → v10.2 | v10.2 → v11 / Mobile decision |
|---|---|---|---|
| Authentication/session | POST `/auth/request-otp`, `/auth/verify-otp`, `/auth/refresh`, `/auth/logout`; GET/PATCH `/me` | Unchanged: inline OTP input, AuthTokens, RefreshTokenRequest, User, UserSelfUpdate | Unchanged; retain C03/C04 and existing refresh semantics |
| Configuration | GET `/settings` | StoreSettings unchanged | Unchanged; admin finance settings are not this endpoint |
| Banners | GET `/banners` | Banner unchanged | Unchanged |
| Catalog | GET `/categories`, `/products`, `/products/{id}` | Category, Brand, ProductPage, ProductImage, Product, ProductVariant unchanged | Product and ProductVariant gain optional nullable UUID `price_proposed_by`; ignored because Mobile neither reads nor edits proposer identity |
| Availability | GET `/products/{id}/availability` | ProductAvailability unchanged | Unchanged; keep fractional available stock and whole-unit rules |
| Public reviews | GET/POST `/products/{id}/reviews` | Review/ReviewPage and purchase-linked submit body unchanged | Unchanged |
| Wishlist | GET/POST `/wishlist`; DELETE `/wishlist/{productId}` | WishlistPage/Item unchanged | Product's optional proposer addition only; pagination/body unchanged |
| Cart | GET `/cart`; POST `/cart/items`; PATCH/DELETE `/cart/items/{id}`; DELETE `/cart/coupon` | Cart line requires `price_version`, `current_unit_price`, `current_price_version`, `price_changed`. `unit_price` and `line_total` mean the price last seen, not the latest catalog price | No further change. Decode separate price snapshots; retain server totals and serialized session-owned writes |
| Coupons | POST `/coupons/validate` | Coupon and code-only request unchanged | Unchanged; apply then read server cart, remove uses returned cart |
| Addresses | GET/POST `/addresses`; PATCH/DELETE `/addresses/{id}` | Address/Page/Create/Patch unchanged | Unchanged |
| Checkout | POST `/orders` | Optional `accepted_price_versions` array of required `{variant_id: UUID, price_version: string(1..64)}`; explicit tokens from prior PRICE_CHANGED | Unchanged. No inferred/hash-generated versions, no unconditional acceptance, no automatic resubmit |
| Order reads | GET `/orders`, `/orders/{id}`, `/orders/{id}/track` | Order adds optional integer `version >= 1`, deadlines, late flag, cancellation_request, price_change_info, attention fields, timeline, retrievals. OrderItem adds optional price_version. OrderStatus/OrderTracking/pagination unchanged | Unchanged. Consume version for existing cancellation. Optional unconsumed workflow fields do not add new Mobile features |
| Cancellation | POST `/orders/{id}/cancel` | Required body `{version: integer >= 1}`, additionalProperties=false; existing 409 envelope | Unchanged. Send displayed version; reload detail/tracking/list on conflict without retrying the write |
| Customer after-sales | GET `/me/reviews`, `/returns`; POST `/returns` | CustomerReview/Page, Return/Item/Page and refund reference schemas unchanged | Unchanged. Existing per-item required reason mismatch fixed; preserve C08 server/history eligibility |
| Delivery | GET `/deliveries/assigned`; PATCH `/deliveries/{id}` | Delivery requires order_version; adds nullable failure_reason/failed_at and retry_count. PATCH requires order_version, reason(1..500) for failed. Failed→out_for_delivery is now allowed | Unchanged. Read queue-owned version, require failure reason, expose retry; existing 409 read refresh retained |
| Monitoring | GET `/monitor/orders`, `/monitor/orders/{id}` | MonitorOrderListItem/Detail/Page inherit additive Order fields. Existing read fields, status counts, queries, pagination unchanged | Unchanged; read-only, no staff writes added |
| Notifications | GET `/me/notifications`, `/me/notifications/unread-count`; PATCH `/me/notifications/{id}/read` | Notification.type adds order_acceptance_late/retrieval_update via its enum reference. Notification/Page/UnreadCount otherwise unchanged | Unchanged; Mobile uses role/entity/title/body, not this enum |

The remaining common references are Page, PerPage, PathId, Pagination, Money,
Conflict, PostingConflict, PeriodClosedError, Forbidden, Unauthorized, NotFound,
Validation, RateLimited and FieldError. Pagination and consumed numeric scales,
including 0.001 quantity precision and currency-bearing totals, did not change.
No consumed existing field becomes nullable/nonnullable across these versions;
new nullable fields are identified above. FieldError adds product_id, sku,
old_price, new_price, old_price_version, new_price_version, current_status,
current_version, price, threshold_percent, cost and minimum_price in v10. Mobile
parses only the conflict fields needed by its existing workflows. Existing auth
classification and error kinds are unchanged.

### What v11 specifically adds

The only commit in `c006c7b..704bef7` is `704bef7` (#87, 57 upstream files).
Its breaking contract changes concern admin permission names, removal of
client-supplied below_cost_originator_id, server-owned approval initiators,
price-publish approvals/results, and separation-of-duties settings. None is a
Mobile-consumed operation. Read the related catalog, orders, reviews and returns
service diff as supporting evidence: requester/proposer identity and staff
approval separation are enforced server-side; Mobile does not moderate, inspect,
approve, or publish prices. The two optional Product/Variant proposer fields are
the only changes reachable from Mobile's API reads. No admin models or features
were introduced in Flutter.

### Contract decisions and historical-document discrepancies

- Cancellation: OpenAPI 11 still says “pending or confirmed”; the historical
  document claims pending only. Preserve the contract's eligibility and surface
  server rejection after refresh. Do not invent a cancellation-request feature.
- `FieldError` now explicitly defines the price/conflict metadata that the older
  document called undeclared. `PRICE_CHANGED` is referenced by the acceptance
  input; the route's generic 409 description/error-code declaration remains
  incomplete. Parse complete structured conflicts defensively; malformed ones
  never authorize acceptance.
- `accepted_price_versions` is not required on initial checkout. It contains the
  variant UUID and the exact opaque new_price_version token from the preceding
  conflict, not Order.version, a timestamp generated by Mobile, or the catalog's
  price_version_id UUID. It is supplied only after the shopper reviews the new
  unit prices and explicitly accepts. Another conflict needs another acceptance.
  Acceptance is discarded after cart/address/session changes.
- The historical document suggests reusing one idempotency key with a changed
  body. OpenAPI says a different request using the same key conflicts. The
  existing optional-key omission is preserved; this batch adds no automatic
  network retries or new idempotency policy.
- Return items require their own reason(1..1000), in both v9 and v11. The existing
  common reason input now explicitly applies to all selected lines, is required,
  and is serialized on every line. Optional line-specific model reasons take
  precedence for repository callers. Read responses use customer_reason.
- Delivery.order_version is required, but examples still omit it. The schema
  takes precedence: malformed reads fail; no fabricated version is sent.
  Delivery lacks order readiness; retain the server check for initial dispatch.
- C08 return quantity-release ambiguity is unchanged in v11; keep conservative
  unknown/error behavior rather than inventing a local return ledger policy.

### Verification

Completed: generated serializers with build_runner and bilingual l10n with
flutter gen-l10n; dart format on touched Dart files; flutter analyze --no-pub
(no issues); 463 focused auth/session/cart/order/commerce/delivery tests passed;
full flutter test --no-pub: 1047 passed, four existing skips. Both unstaged and
staged git diff --check pass. The contract bytes match 704bef7 exactly; new
unstaged edits outside Mobile: none. No simulator or live backend verification
was run for this batch. The merge remains uncommitted for review.

Added 61 regression/interaction cases: eight contract/HTTP/model tests, ten
checkout/cancellation ownership tests, 41 checkout UI cases and two delivery
controller/UI cases. UI cases cover Arabic/English, both themes, widths 320,
599/600, 899/900, 1199/1200, 1535/1536 and 1920, including enlarged text at 599.
An old price prompt also cannot accept a newer offer produced by another attempt.
The original C01–C06/C08/C09 tests remain in the full suite; fixture edits supply
realistic contract fields and required reasons/versions without weakening their
ownership/precision/pricing assertions.

Five new regression tests ran before production edits and all failed: order version retention,
failed-delivery retry/metadata, separate cart price snapshots, return per-item
reason serialization, and blank reason rejection before networking.


Remaining validation limits: live API deployment compatibility and simulator
interaction were not exercised. A separate exploratory run at width 320 with
150% text found a pre-existing overflow in Checkout's unchanged total row
(`_PlaceOrderBar`), before the new price-review dialog. It is recorded without
expanding this contract batch into a layout fix. Contract/backend cancellation
eligibility disagreement and incomplete route-level conflict descriptions remain
upstream issues; the authoritative OpenAPI decisions above govern this client.

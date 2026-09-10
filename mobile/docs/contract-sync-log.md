# Contract synchronization log

This log connects changes received from Haider with the live [roadmap](../ROADMAP.md).
It records contract readiness separately from Flutter implementation and acceptance.
Earlier feature progress records describe their own dated implementation snapshots;
this log and the roadmap record later changes to their dependencies.

## Latest reviewed baseline

| Item | Value |
|---|---|
| Review date | 2026-09-10 |
| Flutter implementation | `174e3eabb46d04410f5f2031fab17de4c47aa17b` on `mobile` |
| Upstream reviewed | `origin/main` at `f4586900618ef75c36296bd5d53fe497b82fab1e` |
| Last upstream commit changing the contract | `89c91207bf31a58bc985ac81cb3e4d823a3e42c6` |
| Contract copied locally | [api/openapi.yaml](../../api/openapi.yaml), exact bytes from the upstream revision above |
| Contract version | `1.1.0` — unchanged despite additions; use the commit to identify this snapshot |
| Next comparison baseline | `f4586900618ef75c36296bd5d53fe497b82fab1e` for shared upstream changes; inspect the local working tree before the next import |

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

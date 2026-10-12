# Shubayr Mobile — development guide

Canonical guidance for humans and coding agents working in `mobile/`.
Do not load `CLAUDE.md` as another instruction source; it is a compatibility
pointer. Communicate in the requesting team member's preferred language; use
Arabic when no preference is known. Keep code, identifiers and conventional
commit messages in English.

## Scope and decisions

- Authorized repository collaborators may request and perform Mobile changes
  through Codex. Approval is not reserved to any named developer; task-specific
  Git approvals follow the rules below.
- Work inside `mobile/`; changes outside it require authorization from the
  responsible project owner. Read the authoritative API contract as described
  below; never silently edit Backend, Web Admin, web or API contracts. Those are
  independently owned projects.
- An implementation request authorizes necessary, low-risk work within its scope.
  Do not repeatedly ask for already granted permission. Make the smallest clean
  change, state material assumptions, and preserve unrelated/user changes.
- Ask before an otherwise unauthorized change to core architecture, dependencies,
  contracts, storage migrations, authentication/security, broad navigation, or
  another project. Do not invent contract fields to resolve an ambiguity.
- Do not expand a task into speculative optimization, folder rearrangement,
  cosmetic cleanup or new features. Existing file size alone is not a reason
  to split it; extract only when responsibilities or ownership justify it.
- Prefer existing Flutter/Riverpod patterns. No mandatory DTO/entity split,
  use-case layer, generic repository, base controller or new framework without
  a concrete need. Reuse established behavior before inventing a new pattern.

## Contract and application scope

- The authoritative Mobile API contract is `origin/main:api/openapi.yaml`.
  Discover its version for each API-related implementation task; do not pin a
  contract version in these development instructions or assume the checked-out
  branch's copy is current.
- Before API-related implementation, run `git fetch origin main` when available.
  Read the contract with `git show origin/main:api/openapi.yaml` without checking
  out `main`, and extract its `info.version`. List migration notes with
  `git ls-tree -r --name-only origin/main docs/mobile/` and read relevant notes
  using `git show origin/main:docs/mobile/<file>`. Report the discovered version
  and compatibility gaps relevant to the task before changing API behavior.
- If fetching fails or is unavailable, report that the latest contract could not
  be verified. Any cached `origin/main` or checked-out contract is unverified
  reference material, not silently authoritative. Continue independent work;
  obtain a verified contract or explicit agreement on an identified offline
  baseline before implementing API behavior that depends on it.
- Inspect relevant operations and referenced schemas before changing wire
  behavior: requiredness, nullability, quantities, statuses, paging and errors.
  Historical migration notes do not override OpenAPI. Never invent undocumented
  API behavior or silently implement migrations unrelated to the requested task.
- Do not invent endpoints, fields, default versions or retries. Preserve
  `version` / `order_version` and documented conflicts. Cancellation/delivery
  conflicts reload server state; they do not automatically repeat the write.
- Checkout `accepted_price_versions` comes only from a complete preceding
  `PRICE_CHANGED` response and explicit customer consent, bound to the same
  cart/address/session. Do not manufacture tokens or accept a later conflict
  using previous consent.
- Normal launches always use remote repositories through `ApiClient`.
  `DATA_SOURCE=mock` does not enable a mock app. Fixtures require explicit test
  overrides; an API failure never triggers fixture fallback.
- Supported app roles are customer, delivery_agent and order_monitor, plus guest
  browsing. Monitoring is read-only. Staff administration belongs to Web Admin.
  Chrome is an isolated development preview, not the production web store.

## Architecture and file ownership

The actual flow is **screen → Riverpod controller/provider → repository →
ApiClient**. Features stay shallow; introduce only the types/layers they need.

| Location | Responsibility |
|---|---|
| `lib/main.dart`, `bootstrap.dart`, `app/` | Startup orchestration, MaterialApp, GoRouter/role guards, shells, cross-feature application composition |
| `core/` | Feature-independent configuration, network/error/diagnostics, storage, localization, theme, layout and small focused formatters/widgets |
| `features/<feature>/data/` | API-shaped models, serialization and repository implementations; isolated fixture adapters/mock repositories where needed |
| Feature `domain/`, where present | Repository contracts and business/session types; no obligatory parallel copy of each API model |
| Feature `presentation/` controllers/providers | Observable state, async ownership, aggregate mutations and workflows; provider factories construct/wire dependencies |
| Feature screens/widgets | Rendering, controllers for local input, dialogs, navigation and feedback; call action controllers for durable business work |

- UI never calls Dio. Feature repositories use `core/network/ApiClient`; transport
  configuration, token rotation and HTTP mapping stay in core networking.
- Data/repository code must not import routes, widgets or presentation. Controllers
  must not depend on `BuildContext`, navigation or snackbars. Notification payloads
  stay data-only; role-checked destinations belong to presentation.
- `core` must not import features. Application widgets that compose feature state
  belong in `app/` (for example, the work app bar).
- Cross-feature access uses narrow explicit surfaces: IDs, repository/domain
  contracts or focused public providers/widgets. Do not import a widget just to
  reuse an eligibility/business rule. Provider factories wire implementations;
  business workflows live in controller methods even when co-located in a file.
- Keep validators and formatters beside their meaning; share focused ones in
  core only when independent of features. No catch-all `utils.dart`/`helpers.dart`.

## Sessions and async ownership

- Separate stored credentials, verified authenticated identity and unresolved
  restoration. Token presence alone never authorizes private screens/data.
- Account-private state and filters depend on the relevant session identity.
  Pending reads/writes must not publish into a new account or a new login to the
  same account. Use narrow identity/session keys and generation checks; do not
  duplicate the complete User object just to invalidate a cache.
- `mounted` / `ref.mounted` proves existence, not request/session ownership.
  Check ownership after awaits before committing state or reporting success.
- Keep `SessionCredentials` revision/serialized-storage ownership for restore,
  OTP verification, profile commits, logout and refresh rotation. `TokenStore`
  remains the credential store; do not introduce a second token cache.
- Transient `/me` network/timeout/5xx and other unverifiable failures preserve
  credentials and expose error/retry without verified authorization. Definitive
  rejection after recovery clears credentials through the existing owner.
  A generic 403 is not invalid credentials. Preserve bounded refresh semantics:
  one shared rotation and one retry; refresh 401/422 rejects recovery, while
  transport/server/malformed refresh failures do not prove invalid credentials.
- Writes to shared aggregates need explicit concurrency semantics. Cart mutations
  remain serialized and session-owned; preserve intent ordering (including
  quantity sequences such as 2 → 3 → 2). Duplicate guards belong inside actions,
  not only in disabled buttons. Address/Wishlist/Delivery queues and action
  guards must not be bypassed by new screens.
- Checkout/cancellation workflows own commits and invalidation independently of
  the initiating widget; preserve their scoped keep-alive during mutation.
  UI-local input/dialog state may remain in widgets. Dispose controllers,
  listeners and timers with their owner; navigate/show feedback only from a
  still-valid UI context and current action result.
- Stale reads use existing generation/identity rules. Cancelling a request does
  not prove that the server did not apply a write; do not blindly retry mutations.

## Errors and diagnostics

- Decode at repository/HTTP boundaries. `decodeResponse` maps TypeError and
  FormatException to predictable `MALFORMED_RESPONSE` failures; programmer errors
  retain diagnostics rather than being mislabeled as malformed payloads.
- Use `AppFailure` and localized feedback; never display raw exceptions/server
  payloads. Use `actionFailure` for unexpected action failures and terminate busy
  state reliably, including stale/disposed/error paths.
- Preserve meaningful structured field errors when their semantics are stable.
  Conflict (409) is distinct from validation (400/422); coupon rejection is not
  the label for every transport or decoding failure.
- Send unexpected failures through the redacted diagnostics boundary. Never log
  tokens, OTPs, personal data, request/response bodies or raw exception messages.
  Preserve sanitized type/stack context; diagnostics must not break recovery.

## Quantities, prices and after-sales

- API quantities may be fractional at 0.001 precision. Preserve `num` values,
  `whole_units_only` and stock limits; never truncate to integers. Reuse quantity
  arithmetic/validation/formatting; quantity is not money.
- Server SKU `effective_price`, line totals, subtotal, discount, delivery_fee and
  total are authoritative. Never reconstruct live SKU price as base + delta or
  invent a price when a required server value is missing. Fixture-only price
  conversion must never leak into production decoding.
- Preserve currency and historical Order item price/name/media snapshots. Catalog
  refreshes must not rewrite historical purchases. Coupon reprice loading/error
  must not leave checkout enabled against an old total.
- Reviews/returns eligibility comes from server flags/history and documented
  statuses, not a local success ledger. Preserve pagination of eligibility data,
  pending-return quantities and required per-item return reasons.

## Provider lifetime and network efficiency

- Choose provider lifetime deliberately. Screen-specific product, availability,
  reviews and detail families normally auto-dispose. Account caches stay bound
  to identity; price/stock must not survive via accidental permanent retention.
- Application caches need a named owner/invalidation policy: categories are
  shared display metadata refreshed by Home; cached settings retain the last
  good presentation values during optional remote refresh.
- Never treat page one as a complete collection. Preserve complete Address/
  Wishlist reads for membership/default selection, bounded pagination and
  deduplication. Reviews intentionally render a labeled first-page preview.
- Polling has explicit session, route and foreground lifecycle ownership. Keep
  app badge polling separate from visible-inbox synchronization, with timers and
  late results stopped/discarded on owner/lifecycle changes.
- Preserve correctness before reducing requests. Avoid N+1 when the API offers
  a suitable primitive; current product metadata lookups and category-offer
  existence queries have contract-driven reasons. Do not invent a bulk endpoint
  or introduce a global HTTP cache/cancellation framework without evidence.

## Shared components and presentation

- A component stays local until shared **meaning and behavior**, not visual or
  syntactic similarity, justify extraction. Reuse design-system primitives first;
  do not turn every repeated widget into a universal configurable component.
- Never change calibrated sizes, spacing, radii, colors or weights without an
  actual requested visual change. Use `context.colors`, `context.text`,
  `AppSpacing`, `AppRadii`, `AppMotion` and central button/input/navigation themes.
- Reuse `AppButton`, `AppCard`, ProductCard and state views. Use readable matching
  on-colors in light/dark mode: onPrimary on primary, textPrimary on soft colors,
  onAccent only on solid accent.
- Arabic-first, RTL-correct and bilingual Arabic/English. User-facing interface
  copy goes through `context.l10n`; bundled identity comes from StoreIdentity and
  API content is displayed as supplied. Keep digits Western (`0-9`).
- Reuse central input normalization for Arabic-Indic/Persian digits. Only monetary
  inputs group thousands while editing; strip grouping for validation/API. Never
  group quantities, identifiers, phones or OTPs. Phones allow `+` only initially,
  remove formatting and never invent a country code; OTPs retain digits only.
- `DisplayDate.localDate` / `localDateTime` convert instants to device-local time;
  `calendarDate` preserves date-only fields. Numeric Gregorian dates use Western
  digits in both languages. Presentation formatting never changes API/domain
  values or substitutes a different business meaning.
- List/grid/detail loads use layout-matching `Skeleton`/`SkeletonList`/
  `SkeletonCardList` via `AsyncValueView(loading:)`; keep spinners for tiny inline
  loads. Empty/retry/error states reuse existing conventions when appropriate.
- All snackbars use `showAppSnackBar` / `showAppSnackBarMessage`; no direct feature
  `ScaffoldMessenger` calls or duplicate timers/queues. The helper owns motion,
  three-second duration, dismissal and actions.

### Responsive layouts and identity

- Support phone, tablet and desktop/web with the existing `core/layout/app_layout.dart`:
  <600, 600–899, 900–1199, 1200–1535 and >=1536 logical pixels. Derive columns
  from local width, comfortable item width and text scaling, not breakpoint alone.
- Reuse responsive cards/slivers, fields, sections and value rows. Wider layouts
  compose content horizontally; do not merely stretch phone UI or impose a
  narrow global cap. Preserve input/focus/validation across resizing.
- Supply stable entity identity through `itemKeyBuilder` for mutable responsive
  lists/grids (reorder, deletion, filters, pagination, breakpoint changes).
  Index keys are acceptable for genuinely static content only.
- Check relevant boundary widths around 600/900/1200/1536, narrow phone/1920,
  larger text, RTL, light/dark and loading/error/empty states. Retain the Checkout
  320px/150% regression test. Do not clip/truncate authoritative totals to fit.

## Store identity, release and startup

- `StoreIdentity` owns bundled/default Flutter names and resource references.
  Supported API branding (`store_name`, `logo_url`, `primary_color`, `currency`)
  overrides runtime display values. Native package IDs, launcher icons, signing
  and store metadata remain build-time concerns; see README's branding section.
  No multi-tenant/flavor framework unless requested.
- Profile/release require explicit production HTTPS `API_URL` validated by
  `AppConfig`; never silently fall back to localhost/dev HTTP or fixtures.
  Developer-only routes stay behind `kDebugMode`, absent in profile/release.
- Signing secrets never enter Git. Android release packaging must not use debug
  signing as fallback. Real Android release verification requires a configured
  Android SDK/JDK/signing environment; static tests are not a signed APK/AAB.
- Preferences/cached settings are untrusted, disposable presentation inputs.
  Recoverable corruption/read timeout uses defined defaults without blocking
  startup or wiping unrelated keys. Authentication credentials are not disposable
  cache and stay in secure storage with their own error/retry path.
- Mandatory startup failures show controlled localized error/retry. Invalid
  build-time configuration needs a corrected build, not futile retry. Optional
  settings/logo/font work uses existing budgets and safe fallbacks.

## Fixtures, generation and dependencies

- Keep test/mock construction in explicit fixtures/adapters, not production model
  constructors or `fromMock/toMock` transformations. Preserve legitimate test
  repository overrides without enabling mock runtime fallback.
- Never hand-edit generated files. After serialization/model schema changes run
  `dart run build_runner build`; after ARB changes run `flutter gen-l10n`.
  Generated model/localization files are committed. Review output and ensure a
  filtered generation command has not removed unrelated generated files.
- Add dependencies only for demonstrated need and within authorization. Do not
  mix package upgrades with unrelated refactors. Check Dart/native/config usage
  before removing a dependency; keep manifests and lockfiles consistent.

## Verification

- Run routine technical checks without additional permission: `dart format` on
  touched Dart files, `flutter analyze --no-pub`, focused behavior/regression
  tests and `git diff --check`. Generate only when inputs changed.
- Run the full suite for broad/cross-feature/state/contract changes; a narrow
  change can use justified focused coverage. Run it once at final verification,
  repeating only when a subsequent change/failure warrants it. Do not add tests
  just for file placement or mirror the implementation without testing behavior.
- Simulator/Emulator is not automatic and is not a completion ceremony. Prefer
  deterministic tests. Interactive verification is justified only for evidence
  they cannot reasonably supply: plugin/platform integration, real keyboard/focus,
  difficult lifecycle behavior, uncaptured significant visual issues or a real
  release/device integration. Honor an explicit user choice; otherwise agree on
  manual versus simulator checking when that evidence is actually needed.
- A manual check supplements, not replaces, technical verification. Provide a
  focused checklist when relevant; inspect logs if useful. Fix in-scope issues,
  report unrelated ones, and never claim an unavailable check passed.

## Git and handoff

- The standing Flutter/Mobile policy in root `AGENTS.md` takes precedence over
  conflicting general Git/handoff rules. `mobile` is the default branch for all
  Flutter tasks. Make requested edits directly in the collaborator's existing
  checkout and leave them there for the requesting team member to run and inspect.
- Do not create a branch, clone, worktree or PR without an explicit request from
  the requesting authorized team member.
  Do not use isolation as an automatic safety workaround. The workflow used
  for PR #99 is not the default for Mobile.
- Do not switch to or work on `main` unless explicitly requested. If the checkout
  is on another branch, stop and ask before switching or starting edits.
- Check for conflicting uncommitted changes, unfinished merge/rebase operations,
  Git conflicts and any other risk to existing work before editing. If unsafe,
  stop, explain the issue briefly and wait for the requesting team member's
  decision. Preserve unrelated local changes and never overwrite another
  developer's work. Do not create a branch/worktree or move, stash or discard
  work to bypass the issue.
- At task start and before committing/pushing, `git fetch origin main` and inspect
  `git log mobile..origin/main`. Report new team changes and their relevance to
  Mobile/contracts. A failed fetch is an incomplete check, not proof of currency.
- Do not merge, squash or rebase without explicit approval from the requesting
  authorized team member; cherry-picking main also requires authorization.
  Never force-push without explicit authorization for that action. Respect
  GitHub repository permissions and branch protection rules; task approval does
  not authorize bypassing them. Root/team history does not authorize changing
  another independently owned project.
- Present changes and verification for review and leave edits uncommitted unless
  the requesting authorized team member explicitly requests a commit or a clear
  earlier instruction for the current task already requires one. That team member
  may authorize commits and pushes for their own task. Implementation approval
  alone does not authorize committing or pushing. Push only with explicit
  authorization for the task, and include only task files in any authorized commit.
- End with a concise report of changes, evidence and actual limitations in the
  requesting team member's preferred language.

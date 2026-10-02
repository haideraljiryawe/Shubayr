# Shubayr Mobile — Codex working agreement

This is the canonical project guidance for Codex when the working directory is
`mobile/`. Do not load `CLAUDE.md` as an additional instruction source; it is a
compatibility pointer for Claude Code.

Shubayr is a monorepo. The sibling web and backend projects are independent work
owned by other teammates. Do not modify files outside `mobile/` unless Ahmed
explicitly asks. Ahmed owns the mobile app and communicates in Arabic, so
communicate with him in Arabic by default while keeping code, identifiers, and
conventional commit messages in English.

## Scope and autonomy

- Treat a request to implement, change, fix, or investigate-and-fix as
  authorization to complete the necessary low-risk work inside its stated scope.
  Do not pause for permission on each file or routine implementation detail.
- Make reasonable, reversible assumptions when they preserve the user's stated
  outcome. State any assumption that materially affects behaviour.
- Make the fewest changes that implement the request well, including small
  dependent edits that are technically necessary for the same behaviour.
- Do not expand the task into unrelated cleanup, redesign, refactoring, DRY work,
  or polish. Report unrelated defects instead of silently fixing them.
- Preserve all existing user changes in a dirty worktree. Never discard, rewrite,
  stage, or commit unrelated edits.

## When to stop and ask

Ask before making a change that is not already explicitly authorized and would:

- introduce or replace a core architecture or state-management pattern;
- add, remove, or update a dependency;
- change an API contract or assume a field absent from the contract;
- perform a data or storage migration;
- alter authentication, authorization, or security behaviour;
- broadly change navigation or shared/global behaviour across unrelated screens;
- require a wide refactor or involve another teammate's project.

When multiple reasonable approaches have meaningful long-term trade-offs, present
the smallest useful comparison, recommend one, and ask only if the choice cannot
be safely inferred. If the user's request explicitly authorizes one of the changes
above, proceed within that exact scope and explain the impact.

## Keep changes focused

- Never change calibrated visual values—sizes, colours, radii, spacing, or font
  weights—unless the request specifically calls for that change.
- Prefer simple, idiomatic Flutter solutions and standard framework APIs. Avoid
  extra dependencies, premature abstractions, and exotic patterns when the
  framework already provides a clear solution.
- When several screens genuinely need the same rich behaviour, create one
  configurable shared widget or service. Do not extract an abstraction merely to
  remove a few similar lines, and do not bury it under many flags.
- Preserve public behaviour and existing API shapes unless the task requires a
  change. Update affected callers and tests together when it does.

## Design system and UI

- Read visual values from the central tokens: `context.colors`, `AppSpacing`,
  `AppRadii`, `context.text`, and `AppMotion`. Do not hard-code visual values in a
  feature widget.
- Theme controls centrally through `ButtonThemes`, `InputTheme`, and
  `NavigationThemes`. Reuse shared widgets such as `AppButton`, `AppCard`,
  `ProductCard`, and the shared state views.
- Ensure every text/background pair remains readable in light and dark modes.
  Use the matching on-token: `onPrimary` on `primary`, `textPrimary` on
  `accentSoft` or `primarySoft`, and `onAccent` only on solid `accent`.
- Keep the application Arabic-first, RTL-correct, and bilingual Arabic/English.
  Put every user-facing string through l10n (`context.l10n`) and keep digits in
  Western-Arabic form.
- Appropriate numeric inputs must contain Western digits (`0-9`) regardless of
  UI or keyboard language; normalize Arabic-Indic (`٠١٢٣٤٥٦٧٨٩`) and Eastern
  Arabic/Persian (`۰۱۲۳۴۵۶۷۸۹`) digits during typing and paste.
- Only monetary inputs display thousands separators (`,`) while editing. Strip
  separators before validation and keep domain/repository/API values raw and
  numeric in the existing contract type. Never group phone numbers, OTPs,
  quantities, identifiers, or other nonmonetary numeric inputs.
- Phone inputs remove common formatting characters during typing and paste,
  allowing `+` only at the start of an international number; never automatically
  add a country code to a local number. OTP inputs contain digits only after
  normalization; validation remains responsible for code length and validity.
- Every new numeric, monetary, phone, or OTP input must reuse the project's
  central normalization/formatting mechanism rather than duplicate it locally.
- Follow the final visual/interactive workflow in `Verification`; do not run
  automated Flutter Simulator/Emulator checks by default.

### Responsive layout

- Every new or changed UI must support Mobile, Tablet and Desktop/Web as part
  of completion. Wider layouts should use horizontal composition and comfortable
  information density, not simply stretch the phone UI.
- Use the shared `core/layout/app_layout.dart` breakpoints: <600 phone,
  600–899 tablet, 900–1199 compact desktop, 1200–1535 desktop, >=1536 large
  desktop (logical pixels). 1200 is an important density/composition threshold,
  not a mandatory switch for every component.
- Derive columns from local available width, content's comfortable minimum width
  and text scaling; breakpoints do not prescribe column counts. Reuse the shared
  card/sliver, field and section layouts rather than scattered width arithmetic
  or repeated MediaQuery breakpoint checks.
- Place independent cards and suitable fields alongside each other when they
  fit; keep multiline editors and wide content appropriately sized. Constrain
  simple forms/reading regions by content type, never with a narrow app-wide cap.
  Management lists, tables and reports may use the full available width.
- Preserve RTL, theme, tokens, navigation and behavior. Prevent overflow/clipping
  and retain form input/validation when resized. Verify near both sides of
  600/900/1200/1536 and at phone/1920 widths; include loading/error/empty states
  and larger text in relevant checks.

## Loading states

- Use layout-matching skeletons for list, grid, and detail data loads; do not use
  a bare spinner for those screens.
- Pass the skeleton to `AsyncValueView(loading:)` and build it from the central
  skeleton system: `Skeleton`, `Skeleton.line`, `Skeleton.box`, `SkeletonList`,
  or `SkeletonCardList`. A small local composition is acceptable for a unique
  layout.
- The skeleton should mirror the final layout closely so content swaps in place.
- Keep the centered `AppLoadingView` spinner only for tiny or inline loads such as
  a small sheet or a button.
- Add the matching skeleton in the same change when adding a data screen.

## Snackbars

- Route every snackbar through `showAppSnackBar` or
  `showAppSnackBarMessage` in `lib/core/widgets/app_snackbar.dart`. Do not
  call `ScaffoldMessenger` directly from feature code.
- The shared helper owns the true bottom-to-top slide, queue, three-second
  auto-dismiss, action handling, and swipe-down dismissal. Do not add another
  timer, a pre-hide call, or a screen-local messenger to reproduce that logic.

## Data and API conventions

- Follow the repository pattern. Normal application launches always use remote
  repositories against the repository-root contract `api/openapi.yaml`.
- Keep fixture repositories only for explicit automated-test overrides; never
  fall back to fixtures when the API fails. Chrome is an isolated development
  preview of the phone app, not the production Web Admin or web store.
- App roles are customer, delivery_agent, and order_monitor. Administrative
  operations belong to the separate Web Admin; monitoring is read-only.
- Do not invent fields or silently diverge from the OpenAPI contract.

## Verification

- Run technical verification automatically without asking for routine permission
  (subject to mandatory tool/sandbox approvals). Run formatting and
  `flutter analyze` for Dart changes.
- Run the most relevant focused tests while iterating, then run the full
  `flutter test` suite before handing off a completed behavioural change.
- Add or update meaningful tests for new behaviour and bug regressions. Avoid
  tests that only restate static implementation details without protecting user
  behaviour.
- For UI/UX tasks that need final visual/interactive verification, finish
  implementation and technical verification first, then pause and ask Ahmed
  whether he wants to check manually or have Codex check on a Flutter
  Simulator/Emulator. Wait for his choice before starting that final check.
- If Ahmed checks manually, provide a short, change-specific checklist with
  launch/navigation steps, relevant interactions and states, and expected
  results. Avoid generic or unrelated checklist items.
- Retain technical responsibility during manual checks: use code review,
  analysis, and tests, and inspect runtime/console output during Ahmed's trial
  when feasible and useful to catch exceptions, warnings, or hidden failures.
  Manual checks never replace technical verification.
- If Ahmed chooses Codex, use a Flutter Simulator/Emulator for a focused visual
  and interactive check of the affected area only. Cover RTL, light/dark mode,
  overflow, clipping, navigation, animations, dialogs, snackbars, and scrolling
  only as relevant to the change.
- Avoid repeated Simulator/Emulator or Computer Use during implementation. Use
  them before the chosen final check only when necessary to diagnose a problem
  that code, tests, and logs cannot reliably establish.
- Fix issues caused by the change and within the task's scope, then repeat the
  relevant checks. Report pre-existing or unrelated issues without expanding
  the task.
- Do not claim success when checks have not run. If a check is unavailable or
  fails for an unrelated reason, report that precisely.

## Git and handoff

- Work in Ahmed's existing checkout on the `mobile` branch. Do not create a
  separate worktree, clone, or task branch unless Ahmed explicitly requests it.
  If the current branch is not `mobile`, ask before switching; preserve all
  existing changes.
- At the start of every task and again before committing or pushing, run
  `git fetch origin main` and check for team commits on `origin/main` that are
  not in `mobile` (for example, `git log mobile..origin/main`). Inspect the
  affected files and report whether updates exist, highlighting changes relevant
  to the task, `mobile/`, or shared API contracts. If fetching fails, report that
  the check is incomplete; do not claim the branch is up to date.
- Checking `main` is read-only for the working files. Do not merge, rebase,
  cherry-pick, or otherwise incorporate team changes into `mobile` unless Ahmed
  explicitly requests it.
- Complete the requested changes and relevant verification, then present the
  result for Ahmed to review. Do not commit or push until Ahmed confirms he is
  satisfied with the completed result. Passing checks alone is not approval.
- Once Ahmed approves the result, commit only the task's changes and push to
  `origin/mobile`; his standing instruction authorizes this destination without
  asking for a second confirmation. Stage only files belonging to the task and
  never include unrelated changes or commits in the push.
- Do not target `main` or open a pull request unless Ahmed explicitly asks.
- End each implementation with a concise Arabic summary of the outcome, the
  important files changed, verification performed, and any remaining limitation.

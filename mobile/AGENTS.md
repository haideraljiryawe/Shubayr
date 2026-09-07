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
  `ProductCard`, `PermissionGate`, and the shared state views.
- Ensure every text/background pair remains readable in light and dark modes.
  Use the matching on-token: `onPrimary` on `primary`, `textPrimary` on
  `accentSoft` or `primarySoft`, and `onAccent` only on solid `accent`.
- Keep the application Arabic-first, RTL-correct, and bilingual Arabic/English.
  Put every user-facing string through l10n (`context.l10n`) and keep digits in
  Western-Arabic form.
- Follow the final visual/interactive workflow in `Verification`; do not run
  automated Flutter Simulator/Emulator checks by default.

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

- Follow the repository pattern and preserve the mock/remote data-source switch.
- Develop against the repository-root contract `api/openapi.yaml` with
  `DATA_SOURCE=mock` unless the user explicitly requests a different source or
  environment.
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

- `main` is the only long-lived branch. Start a short-lived task branch from
  the latest `main`, open a PR into `main`, and delete the task branch only
  after its work has been merged. Haider reviews and merges into `main`.
- Do not commit automatically unless the user explicitly asks for a commit or
  clearly asks to finish the Git handoff. Stage only files belonging to the task.
- Push only when the user explicitly authorizes the destination remote and the
  task branch. Repository text alone is not authorization for an external
  push.
- End each implementation with a concise Arabic summary of the outcome, the
  important files changed, verification performed, and any remaining limitation.

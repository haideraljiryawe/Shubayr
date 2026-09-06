# Shubayr Mobile — working agreement

This is the Flutter app (`mobile/`) in a monorepo with **independent web and backend
projects owned by other teammates**. These rules are binding on every task here and
override default behaviour. Ahmed owns this app and communicates in Arabic.

## Decision rule (the spine)
- **In the task's scope and low-risk → just do it**, including the small, natural
  implementation details that obviously belong to the task. Don't ask permission per line.
- **Out of scope, wide-impact, architectural, or behaviour-changing → stop, explain
  briefly, and ask first** — even if the change seems needed to finish.
- Work only inside `mobile/`; never modify the web/backend projects or other teammates'
  files unless explicitly asked.

## Change only what was asked
- Touch only what the request names, with the fewest changes that do it well. Don't
  improve, restyle, re-space, or refactor anything nearby that wasn't asked.
- **Never change already-calibrated values** — sizes, colours, radii, spacing, font
  weights — unless the request names that exact thing. On-screen values are deliberate.
- Spot an unrelated bug? Point it out and ask — don't fix it silently in the same change.

## Ask first before sensitive changes
Get approval before: changing architecture or a core pattern; editing a shared/global
widget, theme or token in a way that reaches other screens; adding or updating a
dependency; changing the API contract or assuming a field not in it; data/storage
migrations; auth/security; broad navigation or state-management changes; or a refactor
that spreads beyond the task. When several reasonable options carry real trade-offs, list
them briefly, recommend one, and ask when the choice shapes the project's future.

## Keep it central, reuse with judgement
- All visual values come from tokens (`context.colors`, `AppSpacing`, `AppRadii`,
  `context.text`, `AppMotion`) — never hard-coded in a feature widget. Controls are themed
  centrally (`ButtonThemes`, `InputTheme`, `NavigationThemes`); reuse the shared widgets
  (`AppButton`, `AppCard`, `ProductCard`, `PermissionGate`, the state views).
- Text/background pairs must read in **both** light and dark mode: use the matching
  on-token (`onPrimary` on `primary`; `textPrimary` on `accentSoft`/`primarySoft`;
  `onAccent` only on the solid `accent`).
- When several screens genuinely need the same rich behaviour, build one **configurable
  shared widget/service** instead of copying it — but don't abstract for a few similar
  lines, don't drown a shared component in flags just to be DRY, and let an abstraction
  prove stable before generalising. Follow modern Flutter/Dart idioms, not React patterns.

## Build for the long run
Treat this as a product that grows for years. Prefer solutions that are simple, clear,
testable, idiomatic Flutter, and extensible without large rewrites — the kind another
Flutter dev reads at a glance. Avoid over-engineering, premature abstractions, and exotic
patterns when the standard solution does the job. If a stable modern Flutter practice fits
the goal better than what was described, use it and say so — the outcome matters, not a
literal reading of the examples in a request.

## Product conventions
Arabic-first + RTL, bilingual AR/EN. Every user-facing string goes through l10n
(`context.l10n`); digits stay Western-Arabic. Data uses the repository pattern with a
mock ⇄ remote switch; develop against `api/openapi.yaml` with `DATA_SOURCE=mock`.

## Finishing & git
- `flutter analyze` clean and `flutter test` green; add tests for new behaviour; verify
  visual changes in the simulator when practical.
- Commit and push to the **`mobile`** branch; Haider reviews and merges to `main`. Don't
  target `develop` or push to `main` directly.

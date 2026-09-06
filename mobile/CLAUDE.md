# Shubayr Mobile — working agreement

This is the Flutter app (`mobile/`). These rules are binding on every task in this
folder and override default behaviour. Ahmed owns this app and communicates in Arabic.

## 1. Golden rule — change ONLY what was asked
- Touch **only** what the current request explicitly names. Do not "improve", restyle,
  re-space, rename, or refactor anything nearby that wasn't asked for.
- **Never change already-calibrated values** — element sizes, colours, radii, spacing,
  paddings, font sizes/weights — unless the request explicitly says to change that exact
  thing. Values on screen are assumed deliberate.
- If something nearby looks wrong but wasn't mentioned, **point it out and ask** — do not
  fix it silently in the same change. (A clear bug the user reports is fair to fix.)
- When scope is unclear, do the smaller thing and ask.

## 2. Everything is central — no per-widget styling
- All visual values come from tokens, never hard-coded in feature widgets:
  `AppColors` (via `context.colors`), `AppSpacing`, `AppRadii`, `AppTypography` /
  `context.text`, `AppMotion`.
- Interactive controls are themed centrally (`ButtonThemes`, `InputTheme`,
  `NavigationThemes`). Reuse shared widgets (`AppButton`, `AppCard`, `ProductCard`,
  `PermissionGate`, the state views). Extend the shared layer instead of one-off styling.
- Text/background pairs must stay readable in **both** light and dark mode. Use the
  matching on-token: `onPrimary` on `primary`, `textPrimary` (= `onSecondaryContainer`)
  on `accentSoft` / `primarySoft`. `onAccent` is only for the **solid** `accent`.

## 3. Product conventions
- Arabic-first + RTL, bilingual AR/EN. Every user-facing string goes through ARB/l10n
  (`context.l10n`) — never hard-coded. Digits stay Western-Arabic, as elsewhere in the app.
- Data uses the repository pattern with a mock ⇄ remote switch; develop against
  `api/openapi.yaml` with `DATA_SOURCE=mock`. Do not invent fields outside the contract.

## 4. Before finishing a task
- `flutter analyze` must be clean and `flutter test` green; add/adjust tests for new
  behaviour. Verify visual changes in the simulator when practical.

## 5. Git / team workflow
- All mobile work goes on the **`mobile`** branch — commit and push there. Haider reviews
  it and merges to `main`. Do **not** target or revive `develop`, and never push to `main`
  directly.

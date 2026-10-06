# Startup experience — 2026-09-11

Status: implemented; device visual/interactive acceptance pending. No new
package, API, auth policy or routing architecture was introduced.

## Current presentation policy

Native launch is background-only in light/dark appearance: no logo, text or
progress. iOS's storyboard no longer references LaunchImage. Android's legacy
launch drawable contains only the background, and Android 12+ explicitly uses
a transparent drawable to prevent fallback to the launcher icon. The retained
native logo files are unused; Flutter still uses the shared logo asset.

The complete Flutter identity now remains visible for **at least two seconds**,
measured after its first frame. A one-shot, container-owned timer is cancelled
on disposal and cannot restart on resume. The router leaves only when BOTH
this minimum window and existing session restoration finish, preserving role
and return-to rules. A slow session does not incur another two-second wait.
Progress remains indeterminate below the tagline. Local logo/font preparation
still completes before runApp; it does not consume the Flutter display window.

Verification for this change: analysis clean; all 32 focused Startup/Home/
localization/router tests passed. Tests protect the 1999ms/2000ms boundary,
slow restoration, returnTo, resume and timer disposal. Home's search icon is
28px; its localized product heading now uses symmetric 8px vertical padding.
Final visual acceptance is Ahmed's responsibility; no screenshots or visual
inspection were performed. No commit/push.

## Before and after (initial implementation history)

`main.dart` calls `bootstrap()`. Local SharedPreferences and the bundled startup logo/font are prepared before
`runApp`, while the native launch screen is visible. The provider container
then starts session restoration and a non-blocking settings refresh. Cached
brand, saved locale (Arabic fallback) and theme (system fallback) are read
synchronously by `ShubayrApp`. The existing router holds `/splash` while the
session loads and resolves the role/return-to destination when it completes.

The session/role routing sequence is preserved. The old generic Flutter brand mark is now the
local Shubayr logo (96 logical pixels), localized wordmark in Zain (weight 700), localized
tagline and an indeterminate progress bar directly below it. SafeArea, content-width limits
and a scrollable identity region support short windows and enlarged text.
Zain is the shared family for UI text and all wordmarks.

Initially no percentage or minimum display duration was used (superseded by
the current two-second policy above). The current policy also holds fast guest startup for the minimum window. The initial implementation added no lifecycle observer/timer/controller;
the current display timer is described above; the progress widget owns/disposes its animation. Resume does not restart
initialization or navigate to startup.

## Initialization and failures

- Local preferences, logo decoding and wordmark font loading complete under
  the native screen. No page content is awaited and no duration is enforced.
- Flutter startup covers secure-token reading and, when a token exists,
  `currentUser()` (`GET /me` remotely). Existing network timeouts remain 15s
  connect / 20s receive; no timeout or auth policy was changed.
- Existing restoration failures leave startup through the existing signed-out
  routing rules. Rejected/failed `/me` AppFailure clears the token as before.
- Optional settings refresh runs in the background and retains cached/default
  branding on failure. Products, images and banners load only in their own
  screens; pending or failed optional work cannot hold startup open.
- The pre-runApp SharedPreferences read is still the existing required local
  read; this change does not introduce a new recovery/storage mechanism.

## Initial native implementation (logo removed by current policy above)

- iOS: existing LaunchScreen storyboard and LaunchImage asset set, with the
  real logo at 96pt and an adaptive LaunchBackground color asset.
- Android before 12: density-specific logo bitmaps and existing launch drawable;
  both LaunchTheme and NormalTheme use the same background, including night.
- Android 12+: version-qualified platform splash attributes use a static logo
  drawable with transparent safety padding (no icon animation or branding CTA).
  Android owns the system splash icon placement/exit transition.
- Native backgrounds mirror AppColors: light `#F6F5EE`, dark `#15181A`. Native
  assets are resized copies of `assets/images/branding/shubayr-logo.png`, never
  a composite screen image. iOS/pre-12 Android place the logo slightly above
  screen center to approximate the Flutter identity group.
- Native appearance follows the OS before Flutter can read an explicit saved
  app theme. When app/OS appearances differ, a color transition is possible;
  no claim of a universally flash-free handoff is made. Logo decode, native
  transition and actual cold-start frames still need physical-device review.

## Latest refinement and simulator verification

- Logo → wordmark → tagline → progress form one centered group. The bar takes
  the tagline's intrinsic/constrained width, uses AppSpacing.md (12px) above
  it and AppSpacing.xs (4px) thickness, and remains indeterminate.
- Previously, Image.asset could build an empty RawImage while text was already
  present. StartupAssets now prepares the decoded logo and all three Zain faces before
  runApp; Splash uses that exact image provider so its first frame can resolve
  the cached image synchronously. No delay, new dependency or routing rule.
- The first-frame regression test checks actual decoded RawImage availability
  without taking a screenshot. Layout checks cover width, spacing, centering
  and scrolling with enlarged text; all 11 Startup tests and analysis passed.
- Simulator-only cold start and Hot Restart reached /home without application
  exceptions after correcting mismatched generated native assets. Read-only VM
  checks were used; no visual inspection or physical device in this round.
- A non-blocking Flutter-tool SdkRoot diagnostic remains; see the detailed
  [debug investigation](startup-debug-diagnosis.md). Visual handoff acceptance
  remains Ahmed's check. No commit/push.

## Initial technical verification (before this refinement)

- Localization generation and Dart formatting completed; analysis clean.
- Ten new widget tests passed; all **493 Flutter tests passed**.
- New coverage: AR/EN × light/dark at 320, 390, 600, 900, 1200, 1536 and
  1920 widths, short landscape, SafeArea and 2× text; guest/customer/delivery/
  admin restoration, token-storage error, offline `/me`, slow/failed optional
  settings, pending banners, resume and progress-animation disposal.
- iOS release build with mock data and `--no-codesign` succeeded. This compiles
  the storyboard/color/assets but does not install or launch the application.
- Mock Flutter Web build succeeded (including its Wasm compatibility dry run).
- Native XML parsing and `git diff --check` passed.
- Android SDK is unavailable in this environment; no Android build or cold-start
  run was possible. No Simulator/Emulator was launched by Codex.

## Manual acceptance

1. Install a newly built version (hot reload cannot update the native launch
   screen). Fully close/reopen on iOS and Android, including Android 12+.
2. Check the native → Flutter → destination handoff in both system appearances;
   also check explicit app appearance opposite to the OS. Watch for a blank
   frame, unexpected default launcher icon, cropping or an obvious logo jump.
3. Check Arabic/English wordmark and tagline, phone/large window, larger text
   and short landscape. The thin progress bar must stay inside SafeArea.
4. Background/resume from an existing destination: no startup screen should
   return. On cold start Flutter identity stays at least two seconds and longer
   only when existing session restoration still needs time.
5. Verify restored customer/delivery/admin destinations with a valid persistent
   backend session. The existing auth mock stores its user only in repository
   memory, so a full process restart rejects its saved token and returns to
   guest; this pre-existing behavior was intentionally not changed. Controlled
   widget tests cover restored roles without claiming persistent mock login.
6. With remote auth configured, test offline/expired-token startup and verify
   existing guest/sign-in rules; slow banners/settings must not delay entry.

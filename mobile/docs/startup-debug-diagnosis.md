# Startup Debug investigation — 2026-09-11

## Current result: simulator build artifacts corrected

The later simulator-only pass reproduced two concrete native build failures:

1. Launch was rejected before Dart: `FBSOpenApplicationServiceErrorDomain` /
   `SBMainWorkspace`, with underlying `NSPOSIXErrorDomain 163`. The host kernel
   logged `AMFI: ... Attempt to execute completely unsigned code (must be at
   least ad-hoc signed)`. `codesign --verify` confirmed that Runner was unsigned,
   although the Xcode simulator settings required ad-hoc signing. Rebuilding
   the Xcode outputs restored a valid application signature.
2. That exposed repeated **unhandled ArgumentError** failures resolving
   `DOBJC_initializeApi` from `package:objective_c/objective_c.dylib`.
   The framework was present, but `vtool -show-build` identified its platform
   as **IOS**, inside an **IOSSIMULATOR** application. This was a generated
   binary/target mismatch, not missing `ensureInitialized` or a splash timer.
   `objective_c` supports path_provider_foundation's Foundation FFI calls,
   explaining why cache-manager directory/image operations encounter it.
   This is the reproduced failure; the earlier reported null-path exception
   was not independently reproduced and is not asserted to be identical.

Correction: `flutter clean`, followed by `flutter pub get --enforce-lockfile`
(already completed before the interruption), and a simulator-only rebuild.
No dependency versions, package sources, debugger filters, auth rules or
project signing settings were changed. User source changes and simulator app
storage were preserved. The regenerated objective_c framework now reports
**IOSSIMULATOR**, and the app passes signature verification.

The resumed verification completed a Debug cold start and Hot Restart (315ms).
Read-only VM checks in both runs reported state `Resume`, current route `/home`,
and an empty current execution stack. There were no application exceptions or
manual Continue actions. No screenshot, widget-tree/visual inspection, or
physical-device test was performed in this pass. This verifies the observed
runs, not every possible simulator/environment condition.

A Flutter-tool diagnostic remains: `Target native_assets required define
SdkRoot but it was not provided`. It comes from the tool's native-assets
configuration; the correctly built application still launches and restarts.
It was not hidden or treated as a Dart application exception. No SDK/package
patch or upgrade was applied to address this separate tooling diagnostic.

Presentation fixes: Startup's progress bar now follows the tagline inside the
centered identity group; local logo decode and wordmark-font readiness precede
`runApp`. All 11 updated Startup widget tests and analysis passed. The new
centering assertion was verified after resumption; previously successful
unrelated/full-suite checks were not rerun, as requested.

Evidence logs: `/tmp/shubayr-sim-host-signing.log`,
`/tmp/shubayr-startup-round2-after.log`,
`/tmp/shubayr-startup-final-simulator.log`,
`/tmp/shubayr-startup-final-runtime.log`,
`/tmp/shubayr-startup-final-restart-runtime.log`,
`/tmp/shubayr-startup-final-tests.log`,
`/tmp/shubayr-startup-final-analyze.log`.

## First diagnostic pass (historical; superseded by the findings above)

Status: not reproduced on the iOS simulator; root cause and fix remain pending.
No application/package code, dependencies or debugger settings were changed.

## Verified comparison

- `main.dart` and the executable body of `bootstrap()` are byte-for-byte
  identical to HEAD. The bootstrap diff is documentation only.
- Binding initialization still precedes SharedPreferences, provider-container
  creation, session restoration, background settings refresh and `runApp`.
- Router, auth controller and iOS plugin-registration code are unchanged.
- Startup now uses a local `Image.asset`, not a network image/cache manager.
- Lock entries for cached_network_image 3.4.1, flutter_cache_manager 3.4.2,
  path_provider 2.1.6 and path_provider_foundation 2.6.0 are unchanged from HEAD.

## Caller chain established from installed source (not a captured error stack)

Home product thumbnails (`product_card.dart`, `_Thumb.build`) and banner images
(`home_banners.dart`, `_BannerImage.build`) use `CachedNetworkImage`. Its image
provider uses the default image cache manager. `flutter_cache_manager` creates
an IO configuration whose `IOFileSystem` constructor starts `createDirectory`;
that method calls `getTemporaryDirectory()`.

On iOS, path_provider_foundation 2.6.0 uses Foundation FFI (not a missing native
MethodChannel registration) to query `NSSearchPathForDirectoriesInDomains` for
`NSCachesDirectory` / `NSUserDomainMask`. A null path would cause the reported
`MissingPlatformDirectoryException('Unable to get temporary directory')`.
This null-return condition has NOT been observed in this investigation. The
reported source location alone does not establish why it returned null, nor
whether this was the earliest exception. Repeated cache/image operations can
propagate a failed cache-directory future; suppressing those errors would not
establish or fix the cause.

## Runtime evidence

- Existing iPhone 17 Pro simulator, iOS 26.5, Flutter 3.41.9, DATA_SOURCE=mock.
- Fresh Debug process (normal Flutter run settings): reached Home with banner
  and product images; runtime log contained no reported exceptions.
- Hot Restart also completed (339ms), without the reported failure.
- Read-only VM snapshot: isolate `main`, state `Resume`, empty current stack;
  widget tree contains the Home UI. Screenshot captured independently.
- Observed user's VS Code session: Chrome, Running; All Exceptions unchecked,
  Uncaught Exceptions checked. These controls were not changed. Therefore there
  is no evidence supporting an explanation based on Pause on All Exceptions.
- Physical iPhone attempt: Debug build succeeded (21s); wireless install/launch
  did not establish a Dart VM service during the observation window. It was
  stopped without claiming a successful device cold start or a Dart exception.
- A proposed all-exceptions tracing script was blocked by automatic approval
  review before execution; it did not change a debugger setting. Subsequent
  inspection used normal run logs and read-only VM/UI queries.

## Verification and remaining evidence

`flutter analyze --no-pub`: clean. All 78 focused startup/auth/router/Home/banner
Flutter tests passed. No speculative catch/delay, cache purge, package edit,
upgrade/downgrade or splash removal was applied. No commit/push.

To complete diagnosis, identify the failing target and cold-start versus hot-
restart sequence, then leave that session paused at its FIRST exception. Read
its exception type/message, full synchronous/async stack and originating
project/package frame without changing its exception filters. A successful
simulator run does not prove the original physical-device/debugger failure fixed.

Local investigation artifacts (temporary, not repository assets):
- `/tmp/shubayr-startup-debug-normal.log`
- `/tmp/shubayr-startup-snapshot.log`
- `/tmp/shubayr-startup-debug.png`
- `/tmp/shubayr-startup-debug-device.log`
- `/tmp/shubayr-startup-diagnosis-analyze.log`
- `/tmp/shubayr-startup-diagnosis-tests.log`

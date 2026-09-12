# Startup Debug investigation

## Flutter 3.47.4 upgrade — current status, 2026-09-12

The shared SDK is `/Users/ahmeda.alwan/DeveloperTools/flutter` on official
Flutter `3.47.4 stable`, with Dart `3.13.3`. The app and Podfile now target iOS 15.0. CocoaPods
1.16.2 remains in use and SwiftPM remains disabled. The versioned SDK selection
instructions below describe the earlier investigation, not the current setup.

`flutter pub get` succeeded. Final verification: `flutter analyze --no-pub`
is clean; `flutter test --no-pub` reports **504 passed / 0 failed**.
The 43 pre-existing failures are resolved: AppCard now supplies the transparent
Material needed by descendant controls, and the banner test matches the current
aspect ratio. AppCard regression tests were added; the existing design is preserved.

Two consecutive simulator cold starts reached `/home` with 15 cached images
each, without cleaning outputs or uninstalling the app (builds: 18.2s, 4.2s).
`objective_c.framework` reports IOSSIMULATOR with minimum iOS 15.0, and the app
passes deep/strict codesign verification. The initial wireless-device attempt
could not find the iPhone. After connecting via USB, the remaining sequence
completed: physical iPhone → iPhone 17 Pro simulator → physical iPhone.
All three cold starts reached `/home` with 15 cached images, without cleaning
outputs or uninstalling either app. The native `objective_c` binary reported
IOS → IOSSIMULATOR → IOS respectively; no native-assets errors appeared in
the runtime logs. Build times were 18.6s, 10.5s and 9.4s. Flutter 3.47.4
upgrade verification is complete.
Evidence: `/tmp/shubayr-usb-device1.log`, `/tmp/shubayr-usb-simulator.log`,
`/tmp/shubayr-usb-device2.log` and their corresponding `-runtime.log` files.

Ahmed also confirmed a successful manual Cold Start of the installed Release
app on the physical iPhone without Flutter tooling. The earlier delay was
associated with Debug launch/installation, not Startup in Release.

## Root cause established — 2026-09-12 (historical investigation)

The failure was reproduced before changing the SDK. Flutter 3.41.9 completed
Xcode's simulator build in 7.5 seconds, skipped `install_code_assets`, then
embedded `build/native_assets/ios/objective_c.framework/objective_c`.
The Dart build hook's simulator dylib was correctly marked IOSSIMULATOR, but
this shared staging framework was marked IOS. The simulator's dyld rejected it:

```text
ArgumentError: Couldn't resolve native function 'DOBJC_initializeApi'
in 'package:objective_c/objective_c.dylib'
... incompatible platform (have 'iOS', need 'iOS-simulator')
```

This was an **unhandled application exception**, not a debugger stopping on an
expected/caught exception. A fresh process was observed from PauseStart with
Unhandled exception mode; the first pause was at `getTemporaryDirectory`
(`package:path_provider/path_provider.dart:55`). Its async causal frame was
`IOFileSystem.createDirectory` in flutter_cache_manager. No failing isolate was
resumed to mask the error. Complete diagnostic data is in the local logs below.

### Why a clean only helped temporarily

In 3.41.9, `nativeAssetsBuildUri` selects a common `build/native_assets/ios/`
for both device and simulator. The `InstallCodeAssets` depfile/stamp tracks
`native_assets.json`, but does not track the copied framework as an output.
After another target replaces that shared framework, the cached simulator
installation step still looks current. `xcode_backend.dart` then embeds the
shared framework into the simulator bundle without rerunning installation.
The recorded verbose build explicitly shows both the skipped target and that
copy. Clearing caches resets the situation but does not correct the build graph.

Startup itself does not use path_provider. Binding setup precedes preferences,
local logo/font readiness, the provider container and runApp. The existing
session/router gate then reveals Home; Home's CachedNetworkImage instances
start flutter_cache_manager directory/database initialization and expose the
invalid FFI library. Session/auth rules, startup timing and local artwork were
not the cause. The cache/path-provider dependency versions did not change with
the Startup increment. CocoaPods and native MethodChannel registration are not
responsible for this FFI library; Podfile.lock and Pods/Manifest.lock agree.

### Approved correction

Use the separate official Flutter **3.44.9** SDK, revision
`6b182d2c7585eba26d4edce0f97630effd256c33` (Dart 3.12.2).
Its upstream build implementation installs native assets under
`environment.outputDir/native_assets`, records the installed binaries and plists
as dependency outputs, and embeds from `BUILT_PRODUCTS_DIR/native_assets`.
Thus the SDK fixes both target separation and cache validity; no custom copying,
per-run cleaning, plugin fallback or patched package is used.

Official implementation:
- [InstallCodeAssets in 3.44.9](https://github.com/flutter/flutter/blob/3.44.9/packages/flutter_tools/lib/src/build_system/targets/native_assets.dart)
- [Xcode embedding in 3.44.9](https://github.com/flutter/flutter/blob/3.44.9/packages/flutter_tools/bin/xcode_backend.dart)

Ahmed approved this separate SDK and the only required lockfile updates:
`meta` 1.17.0 → 1.18.0 and `test_api` 0.7.10 → 0.7.11. Cache/image,
path_provider and objective_c packages retain their versions. The SDK source,
old SDK and .pub-cache source are untouched.

A one-time `flutter clean` with the new SDK regenerated old Dart 3.11 hook
kernels (format 127), which Dart 3.12 cannot load (expects 130). This is a
migration cleanup, not the fix for the shared native-assets path. CocoaPods
remains enabled via `flutter.config.enable-swift-package-manager: false`;
the automatic SwiftPM trial was removed and the existing native project and
Pod lockfile preserved. The final framework is IOSSIMULATOR and codesign
verification passes.

### Local SDK selection

Installed at `/Users/ahmeda.alwan/DeveloperTools/flutter-3.44.9`.
The ignored, machine-local `mobile/.vscode/settings.json` selects this SDK and
prepends it to PATH for new integrated terminals. Reopen the `mobile/` workspace
(or reload its IDE window) and open a new terminal to use those settings.
Generated iOS configuration points to the new SDK. External terminals must use
this SDK explicitly or prepend its bin directory to their session PATH; the old
system Flutter selection was deliberately not changed for other projects.

```sh
/Users/ahmeda.alwan/DeveloperTools/flutter-3.44.9/bin/flutter --version
```

Do not alternate SDK versions in this checkout. Future iOS builds must use the
fixed toolchain; running the old SDK reintroduces its original build behavior.

### Verification evidence

Three consecutive Debug cold starts completed on the same iPhone 17 Pro
simulator (iOS 26.5), without uninstalling the app between attempts:

| Run | Xcode build | Destination | Unhandled exceptions | Decoded network images |
|---|---|---|---|---|
| 1 | 16.9 s | `/home` | 0 | 12 products + 2 banners |
| 2 | 4.6 s | `/home` | 0 | 12 products + 2 banners |
| 3 | 4.3 s | `/home` | 0 | 12 products + 2 banners |

Each process was observed from Dart's initial PauseStart with Unhandled
exception mode; only initial startup was resumed, never a PauseException.
After 25 seconds, each isolate was Resume, with 15 decoded image-cache entries
(the local logo plus 14 network images), zero pending images and 19,263,076
cached bytes. Public mock URL keys identify the two banners and 12 products.
No runtime exception or build hang occurred during those observations.
The final simulator framework reports IOSSIMULATOR and passes deep/strict
codesign verification. The new installation depfile includes both the framework
binary and Info.plist under `build/ios/Debug-iphonesimulator/native_assets/`.
This verifies the fixed target separation, not merely a successful cache purge.

The third check completed before the later tool/quota interruption; its log
subsequently records a disconnected device. At resumption the simulator was
Shutdown. The completed checks were preserved rather than repeated, and no
long-running/background stability claim is made beyond these observations.

`flutter analyze --no-pub` passed. The full compatibility suite completed with
**459 passed, 43 failed**. Of these, 42 failures expose Flutter 3.44's new
ListTile background/Material diagnostic in the existing AppCard composition.
Ahmed explicitly requested leaving AppCard unchanged. The remaining failure is
the existing banner proportion mismatch: its test expects at least 2.25 while
the committed `AppLayout.homeBannerAspectRatio` starts at 2.0. Neither the banner
values/test nor AppCard were changed in this investigation. These remain open
compatibility/test issues; the full suite is **not** reported as passing.

The final offline package resolution succeeded after recording Flutter
`>=3.44.9` in pubspec; only the two approved package versions changed. The new
and old SDK source trees remain clean. No screenshots, widget-tree inspection,
physical-device launch, app uninstall, commit or push were performed.

Local diagnostic files (not tracked):
`/tmp/shubayr-causal-before-verbose.log`,
`/tmp/shubayr-causal-first-exception.log`,
`/tmp/shubayr-sdk-clean.log`, `/tmp/shubayr-sdk-pub-final.log`,
`/tmp/shubayr-fixed-cold*-check.log`, `/tmp/shubayr-fixed-cold*.log`,
`/tmp/shubayr-sdk-analyze.log`, `/tmp/shubayr-sdk-tests.log`.

---

## Earlier investigation — historical, superseded by the root cause above

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

# Shubayr — Flutter phone application

Flutter for **guests, customers, delivery agents and order monitors**. All
administrative operations belong to the separate Next.js Web Admin. The retained
Chrome launch is an isolated development preview of this phone app.

Current contract: repository-root [`api/openapi.yaml`](../api/openapi.yaml),
**11.0.0**. [AGENTS.md](AGENTS.md) defines development/architecture decisions;
[ROADMAP.md](ROADMAP.md) separates completed hardening from external acceptance.
The [contract synchronization log](docs/contract-sync-log.md) records the consumed
v9 → v10 → v11 changes. Earlier API/admin/mock progress records are historical.

Bundled Flutter identity lives in `StoreIdentity`. `GET /settings` can override
supported display values at runtime; native IDs/icons/signing remain build-time
configuration. See the branding section below.

---

## Run

Use **Flutter 3.47.4 stable** (Dart 3.13.3), with **iOS 15.0 or newer**.
On this machine, Terminal and VS Code use the shared SDK at
`/Users/ahmeda.alwan/DeveloperTools/flutter`; no directory-based SDK switch is
needed. CocoaPods remains enabled; Swift Package Manager migration is deferred.
Flutter 3.41.9 can reuse device native assets in a simulator build. See the
[iOS startup diagnosis](docs/startup-debug-diagnosis.md) for the original issue
and the current upgrade verification status.

```bash
flutter pub get
flutter run                        # phone app (server-assigned role)
flutter run -d chrome --web-hostname=localhost --web-port=7357  # isolated preview
flutter test
flutter analyze --no-pub
```

### Configuration (`--dart-define`)

For the local database-backed workflow, development OTP accounts, and remaining
integration gaps, see [Local real-data development](docs/local-real-data.md).

| Define | Values | Default | Purpose |
|---|---|---|---|
| `API_URL` | HTTPS production DNS URL in profile/release; local HTTP allowed in debug | Debug: `http://localhost:8000/api/v1`; profile/release: none | Backend base URL |
| Runtime data | `remote` | `remote` | Live backend; no fixture fallback |

```bash
# Against the real API once the backend is up:
flutter run --dart-define=API_URL=http://localhost:8000/api/v1
```

Normal application launches always use remote repositories. Fixture repositories
are retained only for explicit automated-test overrides. `DATA_SOURCE=mock`
does not enable a mock application. Use work phones configured by Web Admin;
the OTP response determines the role.

### VS Code: simulators and physical devices

Opening either the repository root or `mobile/` provides these five Mobile profiles
and a separate **Web Admin** launcher:

| Profile | Target | Development API |
|---|---|---|
| iPhone Simulator | iPhone 17 Pro simulator | `http://localhost:8000/api/v1` |
| iPad Simulator | Existing iPad Pro simulator | `http://localhost:8000/api/v1` |
| Android Emulator | `emulator-5554` | `http://10.0.2.2:8000/api/v1` |
| iPhone Device — iPhone 16 Pro | Existing iPhone 16 Pro UDID | Active home/work Mac address |
| Android Device — Galaxy A34 | Existing Galaxy A34 serial | Active home/work Mac address |

Select the profile and press **F5**. Start the selected simulator or connect the
physical device first. Device IDs remain pinned in the two launch files; check
`flutter devices` if replacing a device. VS Code's extension-provided entries
such as “Node.js…” and “Add Configuration…” are commands, not project profiles.
Select **Web Admin** and press F5 to run the current compatible admin at
`http://localhost:3200`. Its shared `tool/run_web_admin.mjs` launcher exports the
pinned main revision `fd6a3bc` into `$HOME/.config/shubayr/web-admin/<revision>/`,
installs its locked dependencies once with Node 22.12+ (Node 22), and starts it
against the same local Docker API/database. No branch switch or changes to the
older `admin/` checkout are needed. Repeated F5 reuses that admin if already
running; another program on port 3200 is left untouched. Stop the originating
terminal/debug session to stop the server. No database setup runs automatically.
Mobile profiles never start Web Admin as a side effect.

`tool/check_debug_environment.mjs` is the single preparation entry point. It:

1. Validates the existing platform-specific external Firebase client file.
2. Checks that the API publishing Docker port 8000 runs in development and points
   to `db:5432/shubayr` on the same Docker network as `shubayr_db`.
3. Checks API health, then writes an ignored `.dart_tool/run/<target>.json`
   containing the real-data mode and the appropriate API URL.

Physical-device profiles automatically detect **192.168.3.50** at home or
**192.168.4.50** at work from the Mac's active interfaces. An unknown or ambiguous
network fails clearly. No manual IP edits, network picker, alternate database,
mock fallback, installation, seed or migration occurs during F5. Stop/relaunch
after changing networks: Dart defines are build-time values. Resolve any pending
checkout before switching networks; pending-operation storage is API-URL scoped.

The development API must publish `0.0.0.0:8000:8000`; internal/database services
stay bound to localhost. Keep both phone and Mac on the same LAN. Allow iOS
**Local Network** access and the Mac firewall's development API access. Verify
`http://<active-Mac-IP>:8000/api/v1/health` in the phone browser. A Mac-side
preflight cannot prove the phone's Wi-Fi/firewall reachability. Trust the iPhone
and enable Developer Mode; authorize USB debugging on Android.

All five profiles load the same existing per-platform client files:

- `$HOME/Documents/firebase/shubayr-ios.json`
- `$HOME/Documents/firebase/shubayr-android.json`

Each file contains only four non-empty string keys: `FIREBASE_API_KEY`,
`FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_PROJECT_ID`. Use the
existing registered `com.shubayr.app` clients, platform-specific App IDs and the
Backend's Firebase project. Server credentials stay outside these client files.
The preflight validates the file shape/platform/sender without printing values.
Existing native signing, entitlements, APNs-token waiting and session-scoped
registration remain unchanged. No special Firebase launch profile is needed.

For push testing, Android needs Google Play services / a supported Google APIs
emulator image. Apple simulator remote notifications require a supported host
and iOS runtime (Apple introduced support with iOS 16 on macOS 13 on Apple
silicon/T2 Macs); Firebase still needs a real APNs token, correct signing and
permission. Local `simctl push` alone does not verify FCM end-to-end delivery.
See [Firebase's Flutter setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started)
and [Apple's simulator support](https://developer.apple.com/documentation/xcode-release-notes/xcode-14-release-notes).

Only Xcode **Debug** uses `ios/Runner/Info-Debug.plist` and local networking;
Profile/Release keep the existing production HTTPS guards and signing settings.
For the local Docker runtime and checkout setup, see
[Local real-data development](docs/local-real-data.md).

### Production release configuration

Profile and release require an explicit `--dart-define=API_URL=https://<production-dns-host>/api/v1`.
Supply the approved platform-specific Firebase client defines through the same
external-file mechanism in the build/release environment. The Debug LAN profiles
are not release configurations. Production Firebase/APNs, distribution signing,
Backend sending and production OTP require separate verification.
The app validates this before opening stores, restoring a session, or making
requests. Missing URLs, HTTP, localhost, IP literals (including loopback/private
and emulator addresses), single-label hosts, reserved/development host labels,
embedded credentials, query strings and fragments are rejected with a localized
configuration error. A corrected build is required; retry cannot repair a
compile-time value. This rule applies to Android, iOS and web.

Debug retains the localhost default and the design gallery. Android cleartext
traffic is permitted only in the debug overlay. Profile/release omit the gallery
route entirely and always use remote repositories; `DATA_SOURCE=mock` is ignored.
HTTP diagnostics retain C11 redaction. There is no remote-to-fixture fallback.

Android release packaging requires `android/key.properties` (already Git-ignored)
with all four values: `storeFile` (absolute path to the production keystore),
`storePassword`, `keyAlias`, and `keyPassword`. Supply these privately on the
signing machine/CI through its secret store; never commit the file or keystore.
The build does not create keys or fall back to debug signing. Debug builds and
release manifest/compile tasks do not require signing material. APK/AAB packaging
fails clearly when material is missing; invalid keys/passwords fail in the Android
signing tools. Existing iOS local signing remains described in
[Local iOS device signing](docs/ios-local-signing.md).

Real Android release verification remains external until an Android SDK/JDK
and private production signing material are configured. On that machine, verify
the effective manifest with:

```bash
cd android
./gradlew :app:processReleaseMainManifest
# Inspect app's merged release AndroidManifest.xml under ../build/app/intermediates/.
# It must contain android.permission.INTERNET and usesCleartextTraffic=false.
./gradlew :app:validateProductionSigning
```

Use `flutter build appbundle --release --dart-define=API_URL=https://<production-dns-host>/api/v1`
with the real production host and private signing material. An unsigned compile
is not evidence of a distributable release or backend connectivity.

### Startup recovery

API configuration and secure authentication state are mandatory. Secure-store
errors and unverifiable sessions use the existing localized session error/retry
screen; credentials are never treated as disposable preferences. Temporary
verification failures retain credentials without granting authenticated access.

Locale, theme and cached store settings are disposable presentation inputs.
Malformed types affect only their own key; incompatible settings JSON is ignored
as a whole and refreshed remotely. Missing/nullable settings and unknown legacy
fields remain compatible. No migration database or blanket preferences reset is
used. If the preferences platform store fails or exceeds its five-second load budget,
this launch uses defaults;
new choices are not persisted until a later launch can access that store again.

The bundled splash logo and brand font are optional presentation resources. A
resource error or five-second preload timeout records sanitized diagnostics and
uses text/system-font fallback. Optional remote settings never block startup.
Unexpected pre-app failures show the existing localized error view and allow a
single retry at a time. No raw exception or configuration URL is displayed.

### Code generation

Models use `json_serializable`. The generated `*.g.dart` files are **committed**
(CI does not run `build_runner`). After changing a model:

```bash
dart run build_runner build
```

Localisations are generated from the ARB files by `flutter pub get` /
`flutter gen-l10n` into `lib/core/l10n/generated/` and are committed too.

Generation explicitly enables Dart formatting in `l10n.yaml`. Mobile's
`.gitattributes` keeps the manifest, ARBs and generated Dart on LF line endings:
Flutter derives generated line endings from `pubspec.yaml`, so a platform's
checkout conversion must not change them. Do not hand-format or ignore tracked
generated files as a workaround for build changes.

After changing translations, run `flutter gen-l10n`, review the generated diff,
then verify repeatability with:

```bash
dart run tool/check_localizations.dart
```

The check generates twice and rejects stale or non-repeatable output. It leaves
regenerated files available for review. Run it before and after release builds;
also inspect `git diff -- lib/core/l10n/generated`. Use the same Flutter/Dart
toolchain when comparing results; generator or formatter upgrades can require
an intentional regeneration commit. The Release 1 investigation on Flutter
3.47.4 found no drift in standalone generation or an unsigned iOS release build;
the historical build drift was not reproduced on that baseline. These explicit
settings and the check guard the output invariant without changing translations.

---

## Architecture

Shallow and feature-first — **UI → Riverpod controller/provider → repository →
ApiClient**. Models generally follow the consumed contract, with business types
where useful. There is no mandatory DTO/entity/use-case hierarchy; fixture
adapters stay outside live model decoding.

```
lib/
├── main.dart · bootstrap.dart        # config validation, recoverable prefs/assets, session restore
├── app/
│   ├── app.dart                      # MaterialApp.router (theme + locale from providers)
│   ├── router/                       # routes, GoRouter, role guard
│   ├── shell/                        # customer/work shells and application composition
│   └── splash_screen.dart
├── core/
│   ├── config/                       # remote API configuration, explicit test overrides
│   ├── network/                      # Dio client, interceptors, AppFailure mapping
│   ├── storage/                      # secure token store, shared-prefs store
│   ├── error/                        # AppFailure + localised messages
│   ├── l10n/                         # ARB files, generated localisations, locale controller
│   ├── theme/                        # tokens, AppColors extension, component themes
│   ├── widgets/                      # buttons, cards, skeletons, state views
│   └── utils/                        # currency, validators, hex colours
└── features/
    ├── settings/  auth/              # implemented
    ├── catalog/  cart/  orders/      # customer commerce
    ├── delivery/  monitoring/        # role-specific work pages
    └── notifications/                # saved inbox and read synchronization
```

Features use `data/` (models/repositories), optional `domain/` contracts/types,
and `presentation/` controllers/providers/screens. Account data is session-owned;
Cart writes are serialized; checkout/cancellation commit independently of widget
lifetime. Repositories use ApiClient/error boundaries, not navigation. Core has
no feature dependencies. Server prices/totals, quantity precision and API version
conflicts remain authoritative. See AGENTS.md for the concrete decision rules.

### Current work

The planned C01–C22 hardening work is implemented; C21 records its closure.
Follow [ROADMAP.md](ROADMAP.md) for external acceptance boundaries, not the old
migration backlog. Tests use isolated fixtures; signed release/device and live
API integration need their actual configured environments. Interactive checks
are used only when they add evidence beyond deterministic tests.

### Branding another application

`lib/core/config/store_identity.dart` owns the bundled Arabic/English name,
logo asset and startup wordmark font resource. Keep the referenced assets and
`pubspec.yaml` declarations in sync (font family tokens live in
`core/theme/tokens/app_typography.dart`). Startup uses this build identity;
Home, monitoring and the app title use API store settings when provided.
`GET /settings` supplies only `store_name`, `logo_url`, `primary_color` and
`currency`; missing values use the existing bundled presentation defaults.

A separately published app still needs native/build changes: Android label in
`android/app/src/main/AndroidManifest.xml`, namespace/applicationId in
`android/app/build.gradle.kts` and matching MainActivity package; iOS display
name in `ios/Runner/Info.plist` and bundle IDs/signing in
`ios/Runner.xcodeproj/project.pbxproj`; launcher icons in Android mipmaps and
iOS `Runner/Assets.xcassets/AppIcon.appiconset`. Update any enabled desktop/web
runner metadata/icons, Dart package references if renaming the package, API
build configuration and release signing for that app. Native identifiers are
never taken from runtime settings. No flavors or tenant framework are required.

Presentation dates use `DisplayDate`: timestamps become device-local time;
calendar-only values retain their year/month/day. Numeric Gregorian dates use
Western digits in both Arabic and English. These strings never replace raw
API/domain dates. Product reviews display a read-only first-page preview, with
an explicit shown/total label when further reviews exist.

### Customer account deletion and privacy policy

Release 1 uses API 14.2.0 `DELETE /me/account`. Deletion requires explicit
confirmation and is restricted to a verified customer session. A refused
request leaves the account signed in and localizes open-order, pending-return
and unsettled-amount blockers. A successful 204 revokes local authorization,
clears credentials and deletes the account's pending-request journals. Other
accounts and device display preferences are preserved.

Supply the real published policy with `--dart-define=PRIVACY_POLICY_URL=...`
or an external `--dart-define-from-file` build configuration. Only a valid
production HTTPS DNS URL opens, using the system browser. There is deliberately
no default policy address; missing configuration shows localized unavailable
feedback. Publishing and verifying this URL is a release blocker, not a
completed integration check. The production API URL, policy URL and Firebase
project are currently **pending production configuration**. Never substitute
localhost/LAN, sample domains or invented production identifiers.


### Official support destination

Supply `SUPPORT_DESTINATION` externally at build time after Hiader provides the
actual customer contact. Supported forms are a production HTTPS link, one
`mailto:` address without query recipients, or an international `tel:` number.
No default contact is bundled. Missing/invalid configuration and unavailable
OS handlers show localized Arabic/English feedback. The existing Help row opens
the destination using the system handler. **Live support verification is pending**;
unit-test contact values are fixtures, not production configuration.

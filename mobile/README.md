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

### Production release configuration

Profile and release require an explicit `--dart-define=API_URL=https://<production-dns-host>/api/v1`.
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

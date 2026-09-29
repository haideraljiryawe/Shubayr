# Shubayr — Flutter phone application

Flutter for **guests, customers, delivery agents and order monitors**. All
administrative operations belong to the separate Next.js Web Admin. The retained
Chrome launch is an isolated development preview of this phone app.

See [API 7.1 migration progress](docs/app-access-v6-progress.md) for the current
scope, implemented behavior, deferred backend phases and acceptance checklist.
Historical admin/mock progress documents do not define the current backlog.

Branding is **white-label**: the store name, logo, primary colour and currency
come from `GET /settings` at runtime — nothing brand-specific is hard-coded.

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
flutter analyze
```

### Configuration (`--dart-define`)

For the local database-backed workflow, development OTP accounts, and remaining
integration gaps, see [Local real-data development](docs/local-real-data.md).

| Define | Values | Default | Purpose |
|---|---|---|---|
| `API_URL` | any URL | `http://localhost:8000/api/v1` | Backend base URL |
| Runtime data | `remote` | `remote` | Live backend; no fixture fallback |

```bash
# Against the real API once the backend is up:
flutter run --dart-define=API_URL=http://localhost:8000/api/v1 \
            --dart-define=DATA_SOURCE=remote
```

Normal application launches always use remote repositories. Fixture repositories
are retained only for explicit automated-test overrides. `DATA_SOURCE=mock`
does not enable a mock application. Use work phones configured by Web Admin;
the OTP response determines the role.

### Code generation

Models use `json_serializable`. The generated `*.g.dart` files are **committed**
(CI does not run `build_runner`). After changing a model:

```bash
dart run build_runner build --delete-conflicting-outputs
```

Localisations are generated from the ARB files by `flutter pub get` /
`flutter gen-l10n` into `lib/core/l10n/generated/` and are committed too.

---

## Architecture

Shallow and feature-first — **model → repository → Riverpod → UI**. There is no
DTO/entity split, no use-case layer and no mappers: with the API contract still
in flux, a second model layer would only double the churn.

```
lib/
├── main.dart · bootstrap.dart        # startup: prefs → first frame → background refresh
├── app/
│   ├── app.dart                      # MaterialApp.router (theme + locale from providers)
│   ├── router/                       # routes, GoRouter, role guard
│   ├── shell/                        # customer navigation shell (bar ⇄ rail)
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

Each feature is `data/` (models + repository implementations), `domain/`
(repository interface + domain types), `presentation/` (providers + screens).

### Current work

Follow [ROADMAP.md](ROADMAP.md) and the API 7.1 progress record. Older progress
records are historical evidence, not implementation instructions. Tests use
isolated fixtures; final integration uses the actual development API.

# Shubayr — Mobile & Admin (Flutter)

> Current guest sign-in and customer after-sales mock workflows are documented in
> [Customer mock journeys](docs/customer-mock-progress.md). The older feature and
> API-blocker inventory below predates those implementations and must not be used
> as the current backlog; check the code and root OpenAPI contract.

One Flutter codebase for **Customer + Delivery + Admin**, also building for
**Flutter Web** (admin dashboard). See
[`../docs/setup/SETUP_MOBILE.md`](../docs/setup/SETUP_MOBILE.md) for full
environment setup and [`../prompts/MOBILE_CLAUDE_FULL.md`](../prompts/MOBILE_CLAUDE_FULL.md)
for the authoritative build prompt.

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
flutter run                        # device/emulator (customer/delivery)
flutter run -d chrome              # admin web dashboard
flutter test
flutter analyze
```

### Configuration (`--dart-define`)

For the local database-backed workflow, development OTP accounts, and remaining
integration gaps, see [Local real-data development](docs/local-real-data.md).

| Define | Values | Default | Purpose |
|---|---|---|---|
| `API_URL` | any URL | `http://localhost:8000/api/v1` | Backend base URL |
| `DATA_SOURCE` | `mock` \| `remote` | `mock` | Which repositories the app builds |

```bash
# Against the real API once the backend is up:
flutter run --dart-define=API_URL=http://localhost:8000/api/v1 \
            --dart-define=DATA_SOURCE=remote
```

While `DATA_SOURCE=mock`, signing in accepts **any 6-digit code**. The last
digit of the phone number picks the area you land in — `…1` delivery agent,
`…2` staff, anything else customer. That is a mock-only dev affordance, not API
behaviour.

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
│   ├── config/                       # dart-define configuration, data-source switch
│   ├── network/                      # Dio client, interceptors, AppFailure mapping
│   ├── storage/                      # secure token store, shared-prefs store
│   ├── error/                        # AppFailure + localised messages
│   ├── l10n/                         # ARB files, generated localisations, locale controller
│   ├── theme/                        # tokens, AppColors extension, component themes
│   ├── widgets/                      # buttons, cards, skeletons, state views
│   └── utils/                        # currency, validators, hex colours
└── features/
    ├── settings/  auth/              # implemented
    ├── catalog/  cart/  orders/      # placeholder screens (next phase)
    └── delivery/  admin/             # routing shells only
```

Each feature is `data/` (models + repository implementations), `domain/`
(repository interface + domain types), `presentation/` (providers + screens).

### Mock ⇄ remote repositories

Every feature declares an interface in `domain/` and two implementations in
`data/`: `…RepositoryMock` and `…RepositoryRemote` (Dio). One provider picks
between them from `DATA_SOURCE`:

```dart
final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock   => const SettingsRepositoryMock(),
    DataSource.remote => SettingsRepositoryRemote(ref.watch(apiClientProvider)),
  };
});
```

Presentation code only ever sees the interface, so flipping a feature to the
real API changes no UI code. A single feature can be moved to `remote` ahead of
the others by overriding its provider in a `ProviderScope`. Both
implementations throw the same `AppFailure`, so error handling is identical.

**Mocks are only written for endpoints whose response schema exists in
`api/openapi.yaml`.** Endpoints documented as bare `"200": { description: OK }`
get no mock — inventing a shape would harden a guess.

### Design system

Colour, type, spacing, radii, shadow and motion values live in
`core/theme/tokens/`. `AppColors` (a `ThemeExtension`) is the semantic layer —
`primary`, `primaryDark`, `primaryLight`, `primarySoft`, `onPrimary`, `accent`,
`background`, `surface`, `surfaceAlt`, `textPrimary/Secondary/Muted`, `border`,
`divider`, `success`, `warning`, `danger`, `info`.

Widgets read `context.colors` / `context.text`. **Colour literals are allowed in
`core/theme/tokens/color_primitives.dart` only** — never in feature widgets.

`AppColors.fromSeed(primary)` derives the brand shades from a single colour,
which is what makes runtime white-labelling work: `GET /settings` supplies
`primary_color`, everything else stays bundled. Material 3 is the base, with
elevation tinting switched off so surfaces keep the warm neutral palette.

### Localisation

Arabic-first (`ar` default, `en` secondary), ARB files in `core/l10n/arb/`, the
choice persisted in shared preferences. Layout mirrors automatically; use
`EdgeInsetsDirectional` and `start`/`end` in new widgets.

### Fonts

Cairo, bundled from local assets only — never fetched over the network. All four
weights used by `AppTypography` (400/500/600/700) are present and declared in
`pubspec.yaml`; see [`assets/fonts/README.md`](assets/fonts/README.md).

### Startup

Native launch screen (warm off-white on Android, iOS and web) → `bootstrap()`
loads shared preferences → first frame with the cached brand and locale →
session restore and settings refresh continue in the background. There is no
artificial delay, and `Skeleton` / `SkeletonList` are in place so content
screens can render immediately and fill in as data lands.

---

## Not implemented yet (waiting on the API contract)

These are blocked by `api/openapi.yaml`, not by effort:

| Area | Blocker |
|---|---|
| Address book, checkout | no addresses endpoints |
| Permission-gated admin UI | no `permissions[]` on the user |
| Silent token refresh | no `/auth/refresh` — a 401 signs the user out |
| Order history, tracking, cancel | no response schemas |
| Reviews | `Order.items[]` has no `order_item_id` |
| Wishlist | no response schema, no delete endpoint |
| Push notifications | no device-token endpoint |
| Stock availability | no stock field on `Product` |
| Warehouses/locations, purchasing, inventory, picking, returns, reports, admin CRUD | no response schemas |
| Delivery agent workflows | `/deliveries/assigned` has no response schema |

Catalog and cart screens are placeholders on purpose: they are the next feature
phase, not a contract gap.

## Working agreement

All app work stays inside `mobile/`. Branch off the latest `main`, use Conventional
Commits, and open a PR into `main`. Delete the task branch after merge — see the
repository `CONTRIBUTING.md`.

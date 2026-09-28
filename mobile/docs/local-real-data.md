# Local real-data development

Flutter talks to the Backend API; it never connects directly to PostgreSQL.
Use `DATA_SOURCE=remote` for database-backed repositories. `mock` remains
available for isolated UI work. The default without a define is still `mock`.

## This workstation

The local stack uses PostgreSQL, Redis, Meilisearch, MinIO and the API in Docker.
The API is `http://localhost:8000/api/v1`. Database and image data live in named
Docker volumes (`shubayr_db_data` and `shubayr_minio_data`). The initial catalog
is development seed data, not production records and not Flutter mock fixtures.

The local `store_settings.primary_color` value is `#396D48`, matching Mobile's
approved bundled green. The Backend seed supplies navy `#0B2A54`; Remote mode
honors that setting for the whole brand theme, including selected navigation
icons. After seeding a fresh local database, set the `primary_color` row to
`#396D48` to keep this design. The shared Backend seed is unchanged.

From the repository root, start or resume the configured stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml --profile full up -d api
```

`docker-compose.local.yml` is an ignored workstation configuration. It binds
service ports to localhost, permits Flutter Web on `http://localhost:7357`, and
overrides API startup to generate Prisma, deploy migrations and run the API
**without reseeding**. It does not modify Backend source or the shared compose
file. If this file is missing on another machine, recreate those overrides
before using this command.

The fresh database was migrated and seeded once. Do not repeat `npm run seed`
on a working development database: it rewrites seeded catalog records and stock.
Likewise, the base compose API command seeds automatically; keep using the local
override. Do not use `docker compose down -v` to stop work; that deletes volumes.

To stop these services without removing data:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml --profile full stop api db redis search minio
```

## Flutter and development sign-in

Both local VS Code launch menus (repository root and `mobile/`) contain:

- `Shubayr — Remote / Dev OTP (iOS)` — booted iPhone 17 Pro simulator.
- `Shubayr — Remote / Dev OTP (Chrome)` — fixed localhost port 7357 for CORS.
- `Shubayr — Remote / Dev OTP (iOS + Chrome)` — both instances together.

The combined option starts Chrome first and launches the standalone iOS debug
configuration through VS Code's `serverReadyAction` after Chrome reports
`Starting application from main method`. Both remain running together, with full
debugging available on both targets. Stop both debug sessions before relaunching
the combined option.

On 2026-09-26 a verbose simultaneous-start reproduction captured:
`Error when reading '.dart_tool/flutter_build/dart_plugin_registrant.dart': No such file or directory`.
Flutter then exited with `App failed to start`, leaving the installed iOS app at
`PauseStart`, before `main`. The earlier `noDebug` workaround did not address
this: Dart-Code 3.142.0 forces a debug connection even for that option. Sequencing
the initial launches avoids overlapping startup against the same generated
project files. Neither the Backend nor periodic catalog refresh caused this
failure. Two successive VS Code launches using the sequenced configuration
connected both targets and returned HTTP 200 for the iOS catalog requests.
No SDK, dependency or application startup code was changed.

For a two-role preview, sign into Chrome as administrator and keep iOS signed
out as a guest, or sign in with the customer account below. Browser and iOS
credentials are stored separately; signing into one does not sign into the other.

Automatic periodic catalog refresh is disabled. The combined option only starts
both instances; it does not synchronize their in-memory state. After saving a
catalog edit in the admin client, return to Home on iOS and pull down. Home
refetches categories, offers and banners and expires cached product details,
availability and category feeds. Reopen the category/product to see fresh data,
including changed media URLs. This also works when Home is shorter than the
viewport. Other screens do not acquire a refresh gesture from this change.
Hot reload preserves application state; it is not a catalog refresh. Store
settings retain their separate startup refresh lifecycle.

During the 2026-09-26 investigation VS Code displayed `Paused on entry` while
the iOS VM service reported `Resume` and the app had already fetched catalog
data. The label alone does not establish that the app is paused. No debugger,
SDK or extension patch was applied to hide it.

Stop the existing Mock debug session and select a Remote profile before starting
again. Hot reload does not change build-time defines. The launch files are
ignored local editor configuration. For a preview without the VS Code debugger
session UI, use ordinary `flutter run` in two terminals. Stop the existing IDE
sessions first; start Chrome in terminal 1 and wait for the application to be
ready before starting iOS in terminal 2. Both terminals use `mobile/` as their
working directory:

```bash
# Terminal 1
flutter run -d chrome --web-hostname=localhost --web-port=7357 --dart-define=DATA_SOURCE=remote --dart-define=API_URL=http://localhost:8000/api/v1

# Terminal 2, after Chrome is ready
flutter run -d "iPhone 17 Pro" --dart-define=DATA_SOURCE=remote --dart-define=API_URL=http://localhost:8000/api/v1
```

Terminal `r` applies code changes with hot reload; `R` hot-restarts the app.
Use the IDE debug profiles when breakpoints are needed. For catalog changes,
use the application's Home pull-to-refresh instead of either command.

Use these seeded accounts with OTP **000000**:

| Role | Phone |
|---|---|
| Customer | `+9647700000006` |
| Administrator | `+9647700000001` |
| Delivery agent | `+9647700000005` |

The Backend's existing `APP_ENV=development` flow skips SMS but stores OTP state,
validates the code and issues real JWTs for database users. Mock auth tokens
cannot authorize real API requests. Sign in again when switching from Mock to
Remote; an old mock session is invalid. Do not enable development OTP on a
public production service. These localhost URLs target this Mac's browser and
iOS simulator, not a physical phone or Android emulator.

## Verified scope and remaining gaps

The opt-in Flutter smoke test exercises the real remote repositories for public
catalog/pricing/schedules/media, banners/settings, customer authentication,
cart/order reads, an address write/read/delete including `contact_phone`, admin
catalog/order reads, and assigned deliveries. It does not automate the UI or
claim full checkout/after-sales UI acceptance.

```bash
flutter test test/local_api_smoke_test.dart --dart-define=RUN_LOCAL_API_SMOKE=true
```

This test only targets localhost:8000, requires the development seed and OTP
000000, creates login sessions, and cleans up its temporary address. Ordinary
`flutter test` skips it and requires no server.

Current limitations verified against the local Backend:

- `/wishlist`, `/admin/users`, `/admin/roles`, `/admin/permissions`, `/suppliers`
  and `/warehouses` return 404. Their Flutter Remote screens cannot function
  fully until Backend implementations exist. No silent Mock fallback is added.
- Flutter does not refresh JWTs automatically yet; the default access token
  expires after 15 minutes and a subsequent 401 ends the session.
- Flutter checkout does not send an `Idempotency-Key`; safe replay after an
  uncertain checkout response still needs client integration.
- Inventory allocation/picking remains incomplete in Backend; current checkout
  uses simple stock holds. SMS and push delivery remain development providers.

These gaps permit local development of the implemented flows, but do not amount
to production readiness or completion of the whole roadmap.

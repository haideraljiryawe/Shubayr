# Local real-data development

Flutter talks to the Backend API; it never connects directly to PostgreSQL.
Normal application launches use database-backed remote repositories only.
Isolated automated tests explicitly inject their fixtures.

## Active workstation runtime (2026-10-15)

The existing Docker API container is `shubayr_backend_test_api`. Despite its
historical name, inspection confirms **APP_ENV/NODE_ENV=development** and the
single database `db:5432/shubayr` in `shubayr_db`, using the existing
`shubayr_db_data` volume. No alternate test database is used by the app.

Its persistent workstation configuration is:
`$HOME/.config/shubayr/backend-test/compose.local.json`.
Start/resume that API without starting a competing API on port 8000:

```bash
docker compose -f "$HOME/.config/shubayr/backend-test/compose.local.json" up -d --no-deps api
```

The API now publishes `0.0.0.0:8000:8000` so home/work network changes do not
require recreating it. PostgreSQL and other internal ports remain localhost-only.
The previous compose settings are retained beside it as
`compose.before-mobile-run-cleanup.json`. The existing external Backend env file,
FCM provider/service-account configuration, network and database were preserved.
Startup generates/builds the existing API; it does **not** migrate or seed.
Do not run seed, `down -v`, or reset the existing database.

The pre-existing runtime was older than API 16.2's address-aware cart pricing.
Image `shubayr-backend-dev:pricing-16.2` layers the exact Backend source changes
from reviewed `origin/main` commit `fd6a3bc8ddcb612dd6f672538aaaf992f3ab4f6b`
(PR #142) onto the existing push-enabled image. Every replaced production source
file matched that commit's parent before replacement. This preserves the
workstation's existing notification changes. Build context and source attribution:
`$HOME/.config/shubayr/backend-test/pricing-16.2/`. The image build passed the
pricing/cart/route-policy unit suites (1057 tests); it performs no DB writes.
No Backend source, contract, or migration in the Mobile checkout was edited.

For another workstation, configure its existing real development API to use
Docker database `shubayr`, expose port 8000, and preserve its environment/signing.
Do not run the base compose API command blindly: it includes seeding. The older
ignored `docker-compose.local.yml` is retained for its other services, but should
not start a second API while the above runtime owns port 8000.

## Run & Debug and notifications

Both workspace roots contain the same five Mobile profiles plus **Web Admin**. See
[README](../README.md#vs-code-simulators-and-physical-devices) for automatic
home/work selection, emulator routing and the existing external Firebase files.
Mobile preflight is read-only for Docker and the database; generated debug defines are
ignored. Select **Web Admin** in Run & Debug and press F5, or run
`node mobile/tool/run_web_admin.mjs` from the repository root. The launcher checks
the same Docker API/database, serves `http://localhost:3200`, and uses an exported
copy of main `fd6a3bc` (API 16.2.0), including its shared styles/font/forwarding
files. The copy and locked dependencies live outside the checkout under
`$HOME/.config/shubayr/web-admin/<revision>/`. It is a runtime distribution, not a
Git clone/worktree. Updating the pinned revision is deliberate, not automatic
on every F5. The older `admin/` checkout remains untouched.

Sign in with your existing Web Admin staff account. Open **Settings →
Governorates** (`/settings/governorates`) and **Settings → Delivery zones**
(`/settings/delivery-zones`). The launcher never signs in, creates users, seeds,
migrates, or changes delivery settings. Its server uses
`API_URL=http://localhost:8000/api/v1`, `ADMIN_ORIGIN=http://localhost:3200`, secure
localhost cookies, and all modules enabled; the Backend still enforces account
permissions.

### Automatic permissions for this workstation's admin

The owner opted the existing local `admin` into automatic permission grants.
The opt-in is outside Git at
`$HOME/.config/shubayr/local-admin-access.json` (`enabled: true`, `userId`: the
existing account UUID). An absent/disabled file leaves normal permissions alone.
On every **Web Admin** launch, including F5 when its server is already running,
`tool/local_admin_access.mjs` reads the **running Backend's** permission registry,
registers missing permission definitions and adds missing direct grants to that
active account only. It preserves shared presets, other accounts, credentials
and business data, increments `permission_version` and audits actual additions.
Repeated launches without new permissions do not write grants or audit entries.

After upgrading the local Backend, launch **Web Admin** and refresh the page;
no manual permission assignment is needed. This is a launch-time sync, not a
background watcher or automatic source upgrade. The launcher refuses a remote
Docker endpoint, production environment, alternate database, renamed/deactivated
account or a replacement account with a different UUID. Backend authorization
and production source/configuration are unchanged. Set `enabled` to `false` to
stop future synchronization; this does not revoke previously granted permissions.

Verification (creates and then drops a unique empty verification database):

```bash
RUN_LOCAL_ADMIN_ACCESS_ACCEPTANCE=1 node --test mobile/tool/local_admin_access.test.mjs mobile/tool/debug_environment.test.mjs
```

## Checkout: delivery setup required

The reported 409 was traced to legacy addresses without `governorate_id`.
The existing cart subtotal was 1,844,500 IQD, matching the screenshot. Both saved
addresses lacked the governorate and the database had no delivery zones. The
running Backend rejects these before creating an order with
`ADDRESS_GOVERNORATE_REQUIRED`, then `DELIVERY_ZONE_NOT_SERVED` for unserved areas.
This is a real contract/setup requirement, not a payment gateway failure (the
flow uses cash on delivery).

Mobile now preserves/saves the selected governorate, provides an explicit edit
path for legacy addresses, and loads `GET /cart?address_id=...` for authoritative
fees/discounts/totals. Placement stays unavailable while pricing loads or fails.
Server checks, explicit price-change consent and idempotency are preserved;
conflicts never silently retry an order.

The owner must finish setup through **Web Admin**, now available from the
separate VS Code launcher with the current delivery settings screens:

1. Enable the governorates the store serves.
2. Create/enable delivery zones, assign those governorates and set their actual
   IQD delivery fees. A governorate must belong to an active zone.
3. In Mobile, edit the saved delivery address and explicitly select its correct
   governorate. The existing city text is preserved; no city-to-governorate guess
   or automatic address backfill is performed.
4. Return to checkout, refresh if needed, review the server's delivery fee and
   total, then place the order.

No zones, rates, address corrections or orders were inserted into development
as part of this repair. Production was not accessed. Governorate metadata may
be cached for 30 seconds by the Backend; cart pricing remains authoritative.

## Verification of the 2026-10-15 repair

- All five preflights passed against the actual local Docker API, including the
  current work LAN endpoint; home/work detection also passed isolated tests.
- `flutter analyze --no-pub`: no issues. Full Flutter suite: 2131 passed,
  5 conditional tests skipped. After the final fresh-quote availability guard,
  all 29 focused delivery/checkout widget/repository tests passed.
- Debug/Firebase preparation: 10 Node tests passed. Runtime pricing/cart/policy
  suites: 1057 tests passed during the image build, without a database connection.
- Final `flutter build apk --debug --no-pub` using the Android emulator/Firebase
  files succeeded. `git diff --check` passed.
- No additional simulator was started. Physical-device reachability, native
  notification receipt and a completed live order still need manual verification;
  live checkout is correctly blocked until the owner configures delivery zones
  and explicitly repairs the saved address. Existing development data was not
  seeded, reset or backfilled. No temporary acceptance database was used.

## Flutter and development sign-in

Normal application launches always use remote. Development OTP must be obtained
from the configured backend; fixture OTP and role selection are test-only.
The current backend seed declares customer +9647700000006, delivery agent
+9647700000005 and order monitor +9647700000008. Existing databases may not yet
have these work-phone records; configure them through Web Admin, not Flutter.

For an already running, seeded development API:

```bash
flutter test --dart-define=RUN_LOCAL_API_SMOKE=true test/local_api_smoke_test.dart
```

This opt-in test uses localhost only and covers customer reads, a temporary
address create/read/delete, monitor reads/inbox and assigned deliveries. It is
not part of the isolated unit/widget suite. Do not re-seed a working database
just to satisfy this smoke test.

# Local real-data development

Flutter talks to the Backend API; it never connects directly to PostgreSQL.
Normal application launches use database-backed remote repositories only.
Isolated automated tests explicitly inject their fixtures.

## Workstation setup snapshot

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

`docker-compose.local.yml` is an ignored workstation configuration. It publishes
only API port 8000 on `0.0.0.0` for localhost and physical devices on the LAN;
database and internal service ports stay bound to localhost. It permits Flutter
Web on `http://localhost:7357`, and
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

Current API 11.0.0 configuration and phone roles are documented in
[README](../README.md) and [AGENTS](../AGENTS.md). This workstation setup is not
evidence of a currently running/migrated backend. In VS Code, select **iOS + Web Admin (Remote)** and press F5 to launch the phone
simulator and Web Admin together against `http://localhost:8000/api/v1`.
Open `http://localhost:3200` for Web Admin. Stopping either debug session stops
both sessions in this compound. Start the existing backend before launching.

Standalone profiles remain available: **Shubayr - iOS Simulator**,
**Web Admin (Remote)** and **Chrome Preview (Remote)**. Chrome uses
`http://localhost:7357` for CORS and separate browser storage; the compound does
not launch Chrome. Stop an existing standalone session before starting the
compound to avoid duplicate processes.

For a physical iPhone, select **Shubayr - iPhone Device** instead. The shared
Mac address setting, local network requirements, and health check are described
in [VS Code: iOS Simulator and real iPhone](../README.md#vs-code-ios-simulator-and-real-iphone).

Pre-launch tasks use Node.js to check API health and require a free port for
Admin/Chrome. Admin also requires Node.js >=22.12 and installed dependencies
(`npm ci` inside `admin`, once). These checks never stop existing processes,
install packages, start Docker or migrate/seed the database. API health does not
confirm database migrations or account readiness. Refresh the relevant mobile
list after an Admin change; shared remote data does not imply live list updates.

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

# Local real-data development

Flutter talks to the Backend API; it never connects directly to PostgreSQL.
Normal application launches use database-backed remote repositories only.
Isolated automated tests explicitly inject their fixtures.

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

The current configuration and phone roles are documented in
[API 6.1 progress](app-access-v6-progress.md). There are exactly two standalone
VS Code launches: iOS Simulator (Remote), and Chrome Preview (Remote).
Both use localhost:8000/api/v1; Chrome uses localhost:7357 for CORS and separate
browser storage. No combined, mock or website launch is configured.

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

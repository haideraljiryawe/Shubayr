# Shubayr Backend API

This folder holds the Node.js 24 LTS NestJS REST API, scaffolded with Codex
using `../prompts/BACKEND_CODEX.md`. Complete environment setup is in
`../docs/setup/SETUP_BACKEND.md`. The API is served below
`http://localhost:8000/api/v1`.

## Authoritative contracts

- `prisma/migrations/`: the ordered, immutable production upgrade path.
- `prisma/schema.prisma`: the runtime database model.
- `../infra/db/schema.sql`: a synchronized clean-database bootstrap/reference;
  never apply it as an upgrade to an existing database.
- `../api/openapi.yaml`: endpoint paths, payloads, responses, and security.
- `../docs/ARCHITECTURE.md`: the 18 mandatory architecture rules.
- `../prompts/BACKEND_CODEX.md`: implementation phases and quality gates.

Do not change either shared contract silently. Contract changes require their
own reviewed pull request.

## Local development

Start the infrastructure from the repository root:

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, Meilisearch, and MinIO. MinIO keeps objects in
the named `minio_data` volume, so uploaded catalog images survive container
restarts. Its local console is `http://localhost:9001`.

Then run the API:

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run start:dev
```

On Windows PowerShell with script execution disabled, use `npm.cmd` and
`npx.cmd` in place of `npm` and `npx`.

Available scaffold endpoints:

- `GET /api/v1/health`: process liveness.
- `GET /api/v1/ready`: PostgreSQL readiness.
- `GET /api/v1/settings`: public white-label settings loaded from the database.

### Development OTP authentication

Set `APP_ENV=development` and optionally set `DEV_OTP` (defaults to `000000`).
`POST /api/v1/auth/request-otp` then logs and returns `dev_otp`; verify it with
`POST /api/v1/auth/verify-otp`. The code is persisted as a keyed hash and is
single-use. `dev_otp` is never logged or returned when `APP_ENV=production`;
production requires `SMS_GATEWAY_URL` and `SMS_GATEWAY_TOKEN` and sends the
code to that gateway. Refresh tokens are signed separately, stored only as a
digest, and rotated on every use.

The remaining OpenAPI endpoints are implemented phase-by-phase in the order
specified by the backend build prompt.

## Database migrations

New databases are created with `npm run prisma:migrate:deploy`. Existing
databases that were originally provisioned from `infra/db/schema.sql` must be
backed up, checked against that reference schema, and baselined once before
deploying later migrations:

```bash
npx prisma migrate resolve --applied 20260918000100_initial
npm run prisma:migrate:deploy
```

Every data-changing migration must document its backfill in the migration SQL
and in the pull request. Rollback is restore-first: take a database backup
before deploy, stop application writes, restore that backup if verification
fails, and redeploy the previous application version. Prisma Migrate does not
automatically run down migrations; a reviewed compensating migration is used
when restoring is inappropriate. Never edit an already-deployed migration.

## Docker API profile

From the repository root, after setting service hostnames (`db`, `redis`, and
`search`) in `backend/.env`:

```bash
docker compose --profile full up -d --build
```

## Quality gates

```bash
npm run prisma:validate
npm run typecheck
npm run lint
npm run build
npm test
```

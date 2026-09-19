# Backend setup - Abbas

You own `backend/`: Node.js 24 LTS, NestJS, TypeScript, and Prisma.

## 1. Prerequisites

Install Git, Docker, and the current Node.js LTS release.

| OS | Install |
|---|---|
| macOS | Git/Xcode Command Line Tools, Docker Desktop, and Node LTS via `nvm` or Homebrew |
| Windows | Git for Windows, Docker Desktop with WSL 2, and Node LTS via the installer or `nvm-windows` |
| Linux | Git, Docker Engine with the Compose plugin, and Node LTS via `nvm` or your distribution packages |

Verify:

```bash
git --version
docker version
docker compose version
node --version
npm --version
```

## 2. Clone and create the local root environment

```bash
git clone https://github.com/haideraljiryawe/Shubayr.git
cd Shubayr
git switch main
git pull --ff-only origin main
git switch -c feature/backend-<change>
```

Open a pull request into `main` when the work is ready; delete the feature branch
after it merges.

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

`.env` is ignored by Git. Never commit it.

## 3. Start and verify the real-data stack

```bash
docker compose --profile full up -d --build
docker compose ps
```

This starts PostgreSQL, Redis, Meilisearch, MinIO, Adminer, Mailpit, and the
NestJS API. PostgreSQL is created by the real Prisma migrations; `schema.sql`
is reference/bootstrap documentation and is not applied as an upgrade. The API
runs the idempotent seed on boot and is available at
`http://localhost:8000/api/v1`. If a host port
is busy, change only the matching `*_PORT` value in `.env`; for example:

```dotenv
REDIS_PORT=6380
```

Container-to-container URLs still use `redis:6379`, `db:5432`, and
`search:7700`.

Open [Adminer](http://localhost:8081) and use:

- System: PostgreSQL
- Server: `db`
- Username/password/database: `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE`
  from your local `.env`

Confirm `GET http://localhost:8000/api/v1/ready` returns a ready response. The
seed supplies all six roles, eight bilingual departments plus subcategories,
32 stocked products, durable MinIO images, discounts, and banners.

## 4. Run the API directly on the host

```bash
cd backend
npm install
npx prisma generate
npm run prisma:migrate:deploy
npm run seed
npm run start:dev
```

For commands running directly on the host, use `localhost` in `DATABASE_URL`,
`REDIS_URL`, `MEILI_HOST`, and `S3_ENDPOINT`. The Docker profile supplies its
own container service names, so `backend/.env` is optional. An old disposable
local volume made from `schema.sql` should be recreated, or baselined using the
migration guidance in `backend/README.md` when its data must be retained.

## 5. Development login and client configuration

`APP_ENV=development` returns and logs the fixed `DEV_OTP` (default `000000`)
from `POST /auth/request-otp`. This never happens in production.

| Role | Seed phone |
|---|---|
| admin | `+9647700000001` |
| manager | `+9647700000002` |
| purchasing | `+9647700000003` |
| warehouse | `+9647700000004` |
| delivery | `+9647700000005` |
| customer | `+9647700000006` |

Point both clients at the same API and disable mocks:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_USE_MOCKS=false
```

```bash
flutter run --dart-define=API_URL=http://localhost:8000/api/v1 --dart-define=DATA_SOURCE=remote
```

Use `10.0.2.2` instead of `localhost` for an Android emulator.

## Contracts

- [Database upgrade source of truth](../../backend/prisma/migrations)
- [Database bootstrap/reference](../../infra/db/schema.sql)
- [REST API source of truth](../../api/openapi.yaml)
- [Architecture rules](../ARCHITECTURE.md)

Do not change a contract silently. Use a dedicated pull request and coordinate
with Hiader and Ahmed.

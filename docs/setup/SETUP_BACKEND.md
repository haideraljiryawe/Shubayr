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
git switch develop
```

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

`.env` is ignored by Git. Never commit it.

## 3. Start and verify shared infrastructure

```bash
docker compose up -d
docker compose ps
```

This starts PostgreSQL, Redis, Meilisearch, Adminer, and Mailpit. If a host port
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

Confirm the `public` schema contains 37 tables and the `roles` table is seeded.

## 4. Scaffold and run the API

First follow the [authoritative backend build prompt](../../prompts/BACKEND_CODEX.md).
After the NestJS package files exist:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

For commands running directly on the host, use `localhost` in `DATABASE_URL`,
`REDIS_URL`, and `MEILI_HOST`. For the Docker API, copy the example into the
backend environment and retain the service names `db`, `redis`, and `search`:

macOS/Linux, from the repository root:

```bash
cp .env.example backend/.env
docker compose --profile full up -d --build
```

Windows PowerShell, from the repository root:

```powershell
Copy-Item .env.example backend/.env
docker compose --profile full up -d --build
```

The API must be available at `http://localhost:8000/api/v1`.

## Contracts

- [Database source of truth](../../infra/db/schema.sql)
- [REST API source of truth](../../api/openapi.yaml)
- [Architecture rules](../ARCHITECTURE.md)

Do not change a contract silently. Use a dedicated pull request and coordinate
with Hiader and Ahmed.

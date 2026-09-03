# Shubayr - Backend API (NestJS + TypeScript + Prisma)

This folder holds the Node.js 24 LTS NestJS REST API. It is scaffolded with
Codex using `../prompts/BACKEND_CODEX.md`.

## Contracts

- Match all 37 tables in `../infra/db/schema.sql` exactly through Prisma models
  and migrations.
- Implement `../api/openapi.yaml` exactly at `/api/v1`.
- Follow the 18 rules in `../docs/ARCHITECTURE.md`.

## Run locally (after scaffolding)

```bash
cp ../.env.example .env
# When running outside Docker, change db/redis/search hosts to localhost.
npm install
npx prisma migrate dev
npm run start:dev
```

## Run with Docker

From the repository root:

```bash
docker compose --profile full up -d --build
```

API base URL: `http://localhost:8000/api/v1`

Before opening a pull request, run:

```bash
npx prisma validate
npm run build
npm test
```

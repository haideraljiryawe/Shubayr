# Shubayr Backend API

This folder holds the Node.js 24 LTS NestJS REST API, scaffolded with Codex
using `../prompts/BACKEND_CODEX.md`. Complete environment setup is in
`../docs/setup/SETUP_BACKEND.md`. The API is served below
`http://localhost:8000/api/v1`.

## Authoritative contracts

- `../infra/db/schema.sql`: all 37 PostgreSQL tables and constraints.
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

The remaining OpenAPI endpoints are implemented phase-by-phase in the order
specified by the backend build prompt.

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

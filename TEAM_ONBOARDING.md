# Shubayr team onboarding

Start here. This page identifies each owner, the shared contracts, and the safe
workflow. Role-specific setup details are linked below.

## Team ownership

| Person | Responsibility | Folder | Setup | Build prompt |
|---|---|---|---|---|
| Hiader | Website - Next.js | `web/` | [Web setup](docs/setup/SETUP_WEB.md) | [Web build prompt](prompts/WEB_CLAUDE_FULL.md) |
| Ahmed | Mobile app only - Flutter | `mobile/` | [Mobile setup](docs/setup/SETUP_MOBILE.md) | [Mobile build prompt](prompts/MOBILE_CLAUDE_FULL.md) |
| Abbas | Backend - Node.js, NestJS, TypeScript, Prisma | `backend/` | [Backend setup](docs/setup/SETUP_BACKEND.md) | [Backend build prompt](prompts/BACKEND_CODEX.md) |

Only the listed owner should lead changes in each application folder. Shared
contract changes require coordination with every affected owner.

## What already exists

- [Database contract](infra/db/schema.sql): the authoritative PostgreSQL schema
  with 37 tables.
- [API contract](api/openapi.yaml): the authoritative REST contract served at
  `http://localhost:8000/api/v1`.
- [Docker Compose stack](docker-compose.yml): PostgreSQL, Redis, Meilisearch,
  Adminer, Mailpit, and the optional API profile.
- [Architecture rules](docs/ARCHITECTURE.md): the 18 non-negotiable design rules.
- [Diagrams](docs/diagrams/README.md): editable Mermaid sources plus rendered
  PNG and SVG files.
- `docs/Shubayr_Software_Engineering_Analysis_v2.pdf`: the full analysis report.
- [Contribution guide](CONTRIBUTING.md): branching, commits, reviews, and the
  definition of done.

## Git workflow

Never push directly to `main`.

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/<area>-<change>

# work, test, and commit
git fetch origin
git rebase origin/main
git push -u origin feature/<area>-<change>
```

Open a pull request into `main`, request review, and merge only after checks
pass. Delete the feature branch after the merge. Never commit `.env`,
credentials, generated secrets, or silent changes to either shared contract.

## Where each person goes next

1. **Abbas:** follow [Backend setup](docs/setup/SETUP_BACKEND.md), then use the
   [Node backend prompt](prompts/BACKEND_CODEX.md).
2. **Hiader:** follow [Web setup](docs/setup/SETUP_WEB.md), then use the
   [full web prompt](prompts/WEB_CLAUDE_FULL.md).
3. **Ahmed:** follow [Mobile setup](docs/setup/SETUP_MOBILE.md), then use the
   [full mobile prompt](prompts/MOBILE_CLAUDE_FULL.md).

Web and mobile must implement [the OpenAPI contract](api/openapi.yaml), using
contract-shaped mocks until Abbas has the corresponding endpoints running.

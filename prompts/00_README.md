# Authoritative build prompts

Run the matching prompt with the coding tool from the repository root so it can
read the shared contracts and contribution rules.

| Part | Owner | Working folder | Authoritative prompt |
|---|---|---|---|
| Backend | Abbas | `backend/` | [BACKEND_CODEX.md](BACKEND_CODEX.md) |
| Website | Hiader | `web/` | [WEB_CLAUDE_FULL.md](WEB_CLAUDE_FULL.md) |
| Mobile app | Ahmed | `mobile/` | [MOBILE_CLAUDE_FULL.md](MOBILE_CLAUDE_FULL.md) |

There is one prompt per part. Do not add shortened copies; update the relevant
authoritative prompt through a reviewed pull request.

## Shared rules

- [The API contract](../api/openapi.yaml) defines all endpoints and payloads.
- [The database contract](../infra/db/schema.sql) defines all 37 tables.
- [The architecture guide](../docs/ARCHITECTURE.md) defines the 18 design rules.
- [The contribution guide](../CONTRIBUTING.md) defines the Git workflow.
- Sensitive actions must produce an `audit_logs` entry.

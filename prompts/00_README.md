# How to use these prompts

Each file is a **ready-to-paste prompt** to scaffold one part of Shubayr with an
AI coding tool. Run them from inside the matching folder so files land correctly.

| Prompt | Tool | Run from | Produces |
|---|---|---|---|
| `BACKEND_CODEX.md` | **Codex** | `backend/` | Laravel API, migrations, RBAC, auth, inventory, orders |
| `WEB_CLAUDE.md` | **Claude Code** | `web/` | Next.js public storefront |
| `MOBILE_CLAUDE.md` | **Claude Code** | `mobile/` | Flutter app (customer + delivery + admin) |

### Recommended order
1. **Backend first** (`BACKEND_CODEX.md`) — it defines the API the apps consume.
2. Then **web** and **mobile** in parallel; both point at the running API on `http://localhost:8000/api/v1`.

### Golden rules for every tool
- The database schema in **`../infra/db/schema.sql`** is the contract. Match it. Do not invent columns.
- Honor the **18 architecture rules** in `../docs/ARCHITECTURE.md`.
- Never edit files outside your own folder except via a reviewed PR.
- Write an **audit log** entry for every sensitive action (stock, price, cost, purchase, return, order status, permission).

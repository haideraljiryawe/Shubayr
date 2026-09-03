# Shubayr — Team Onboarding / دليل الفريق

Welcome to **Shubayr**. This guide gets everyone working cleanly from the same
repo. Read it once, then keep `CONTRIBUTING.md` handy for the daily git flow.

> **الملخص:** هذا المستودع (repo) يحتوي الهيكل الكامل للمشروع + قاعدة البيانات
> الموحّدة + كل المخططات + برومبتات جاهزة لكل مطوّر. المطوّر الخلفي (Backend) يستخدم
> Codex داخل مجلد `backend/`، ومطوّر الواجهات يستخدم Claude Code داخل `web/`
> و`mobile/`. لا تعدّل قاعدة البيانات المشتركة إلا عبر Pull Request مراجَع.

---

## 1. What is already done (the starting point)

This repo is **not empty** — it ships a complete foundation so both developers
start aligned:

- **Monorepo structure**: `backend/`, `web/`, `mobile/`, `infra/`, `docs/`, `prompts/`.
- **The database is designed and validated**: `infra/db/schema.sql` (37 tables, loads cleanly on PostgreSQL 16) — this is the **shared contract**. Plus `seed_rbac.sql` (roles, permissions, white-label defaults).
- **Docker dev stack**: `docker-compose.yml` — PostgreSQL, Redis, Meilisearch, Adminer, Mailpit. Postgres auto-loads the schema + seed on first boot.
- **Architecture & rules**: `docs/ARCHITECTURE.md` — the 18 design rules from the team review (suppliers, batches, warehouses/locations, stock movements, FEFO, reservation, picking, costing, returns, loyalty, ratings, RBAC, audit, white-label).
- **All UML diagrams**: `docs/diagrams/` (PNG + SVG + editable Mermaid `.mmd`).
- **Full analysis report**: `docs/Shubayr_Software_Engineering_Analysis_v2.pdf` (+ Word).
- **Ready-to-paste prompts**: `prompts/BACKEND_CODEX.md`, `prompts/WEB_CLAUDE.md`, `prompts/MOBILE_CLAUDE.md`.
- **CI**: `.github/workflows/ci.yml` validates the schema on every push and builds each app once it exists.

**Not yet written (this is your job):** the actual Laravel app, Next.js app, and
Flutter app. Each has a prompt that scaffolds it against the contract above.

## 2. Who builds what

| Developer | Tool | Folder | Start by running |
|---|---|---|---|
| Backend | **Codex** | `backend/` | `prompts/BACKEND_CODEX.md` |
| Frontend — web | **Claude Code** | `web/` | `prompts/WEB_CLAUDE.md` |
| Frontend — mobile/admin | **Claude Code** | `mobile/` | `prompts/MOBILE_CLAUDE.md` |

Build the **backend first** (it defines the API); web and mobile can then proceed in parallel.

## 3. Prerequisites

- **Everyone:** Git, Docker Desktop (for the DB and services).
- **Backend:** PHP 8.3 + Composer (or just use Docker).
- **Web:** Node.js 20+.
- **Mobile:** Flutter (stable channel).

## 4. One-time: create the GitHub repo (owner does this once)

The repo currently lives locally with its first commit already made. To publish it:

**Option A — GitHub CLI (easiest):**
```bash
# install gh from https://cli.github.com, then:
gh auth login
gh repo create Shubayr --private --source=. --remote=origin --push
```

**Option B — plain git (create an empty repo named "Shubayr" on github.com first):**
```bash
git remote add origin https://github.com/<your-username>/Shubayr.git
git branch -M main
git push -u origin main
# create the shared integration branch:
git checkout -b develop && git push -u origin develop
```

Then, in the repo settings on GitHub, **protect `main` and `develop`** (require a
pull request before merging), and invite the two developers as collaborators.

## 5. One-time: each developer sets up

```bash
git clone https://github.com/<your-username>/Shubayr.git
cd Shubayr
cp .env.example .env
docker compose up -d          # brings up the database + services
# verify the DB: open http://localhost:8081 (Adminer) and log into "shubayr"
```

Then run your prompt (section 2) inside your folder.

## 6. Daily workflow — pull & push

Full detail is in `CONTRIBUTING.md`. The short version:

```bash
git checkout develop
git pull origin develop                 # always start from the latest
git checkout -b feature/<area>-<thing>  # your branch

# ... do the work ...
git add -A
git commit -m "feat(backend): receive purchase invoice into batches"

git fetch origin && git rebase origin/develop   # stay current
git push -u origin feature/<area>-<thing>
# open a Pull Request into develop on GitHub → get a review → merge
```

**Golden rules**
- Never push straight to `main` or `develop` — always via a PR.
- Never commit `.env` or secrets (only `.env.example`).
- **Never change `infra/db/schema.sql` silently** — it is the contract. Schema
  changes are their own PR, reviewed by the other developer, with the ER
  diagram/docs updated in the same PR.
- Write an **audit log** for sensitive actions (stock, price, cost, purchase,
  return, order status, permissions).

## 7. Where to look

| I need… | Look at |
|---|---|
| The data model | `infra/db/schema.sql` |
| The rules & decisions | `docs/ARCHITECTURE.md` |
| The diagrams | `docs/diagrams/` (edit the `.mmd` at mermaid.live) |
| The full report | `docs/Shubayr_Software_Engineering_Analysis_v2.pdf` |
| How to scaffold my part | `prompts/` |
| Git workflow | `CONTRIBUTING.md` |

Questions or a schema change idea? Open an issue or ping the backend owner first.
Happy building. 🚀

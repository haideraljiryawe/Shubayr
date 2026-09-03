# Shubayr — منصة متجر شُبَيّر

Online multi-section store (a digital shopping mall for a single owner) — **web + mobile**, built as one monorepo.

> **White-label:** the store name, logo, colors and currency live in `store_settings` — Shubayr is the default identity, not a hard-coded one.

---

## Repository layout

```
shubayr/
├── backend/      Node.js API (NestJS + TypeScript + Prisma) — REST/JSON         ← Codex
├── web/          Next.js public storefront (SSR/SEO)                            ← Claude Code
├── mobile/       Flutter app — customer + delivery + admin (also Web target)    ← Claude Code
├── infra/
│   └── db/       schema.sql (the shared DB contract) + seed_rbac.sql
├── docs/         Analysis report (PDF/Word), diagrams, ARCHITECTURE.md
├── prompts/      Copy-paste initiation prompts for Codex & Claude Code
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Tech stack

| Layer | Technology |
|---|---|
| Mobile (customer + delivery + admin) | **Flutter** (also Flutter **Web** for admin) |
| Public web storefront | **Next.js** (React, SSR/SEO) |
| Backend API | **Node.js 24 LTS** (NestJS + TypeScript + Prisma) — REST/JSON |
| Database | **PostgreSQL 16** |
| Cache / queues | **Redis** |
| Search | **Meilisearch** |
| Push / SMS | Firebase Cloud Messaging / local SMS OTP |
| Payments | **Cash on Delivery** now; pluggable module for gateways later |

## Quick start (infrastructure)

```bash
cp .env.example .env
docker compose up -d          # starts db, redis, search, adminer, mailpit
```

On first boot, PostgreSQL auto-loads `infra/db/schema.sql` + `seed_rbac.sql`.

| Service | URL |
|---|---|
| PostgreSQL | `localhost:5432` (db/user/pass from `.env`) |
| Adminer (DB UI) | http://localhost:8081 |
| Meilisearch | http://localhost:7700 |
| Mailpit (dev email) | http://localhost:8025 |

Once the backend exists in `backend/`, run the full stack:

```bash
docker compose --profile full up -d --build   # adds the NestJS API on :8000
```

## Getting started as a developer

1. Read **`docs/ARCHITECTURE.md`** and skim **`infra/db/schema.sql`** — that schema is the contract.
2. Backend dev: open **`prompts/BACKEND_CODEX.md`** and run it in Codex inside `backend/`.
3. Web / mobile dev: open **`prompts/WEB_CLAUDE.md`** / **`prompts/MOBILE_CLAUDE.md`** in Claude Code.
4. Follow the git workflow in **`CONTRIBUTING.md`**.

## The 18 architecture rules (team review)

These are non-negotiable design rules — see `docs/ARCHITECTURE.md` for detail:
white-label · Flutter (customer/delivery/admin) + Next.js web · detailed RBAC ·
goods enter via purchase invoices · independent inventory batches · warehouse
locations · stock movements for every change · FEFO picking · order reservation
before deduction · guided picking · per-batch cost + separate sale price ·
returns with condition (partial allowed) · loyalty points ledger · points
negotiation data model · verified product reviews · separate delivery rating ·
full audit trail.

---
© Shubayr project. Proprietary — for the client and authorized team only.

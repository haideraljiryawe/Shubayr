# Contributing to Shubayr

This guide is the **single source of truth** for how we work together in this repo.
Please read it once before your first push.

## 1. Branching model

We use a simple, safe model:

```
main        ← always deployable. Protected. No direct pushes.
feature/*   ← your day-to-day work branches.
fix/*       ← bug fixes.
```

- `main` is **protected**: changes land only through Pull Requests (PRs).
- Branch off `main`, never off another unfinished feature branch.
- After a PR merges into `main`, delete its source branch.

Branch naming:
```
feature/backend-auth-otp
feature/web-product-listing
feature/mobile-cart
fix/order-total-rounding
```

## 2. The daily loop (pull → work → push)

```bash
# 1. Get the latest main branch
git checkout main
git pull --ff-only origin main

# 2. Start your feature
git checkout -b feature/backend-purchase-invoices

# 3. Work, then stage & commit in small logical chunks
git add -A
git commit -m "feat(purchasing): create purchase invoice + receive to batches"

# 4. Keep up to date while you work (avoids big conflicts)
git fetch origin
git rebase origin/main         # or: git merge origin/main

# 5. Push your branch
git push -u origin feature/backend-purchase-invoices

# 6. Open a Pull Request into main on GitHub, request a review.
#    After it merges, delete the feature branch.
```

## 3. Commit messages (Conventional Commits)

```
<type>(<scope>): <short summary>
```
Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`.
Scopes: `backend`, `web`, `mobile`, `db`, `infra`, `docs`.

Examples:
```
feat(backend): FEFO reservation on order confirm
fix(web): cart total ignores coupon
docs(db): document return conditions
```

## 4. Ownership (who touches what)

| Area | Folder | Owner |
|---|---|---|
| API / DB / business logic | `backend/` | Backend dev (Codex) |
| Public storefront | `web/` | Frontend dev (Claude Code) |
| Mobile & admin apps | `mobile/` | Frontend dev (Claude Code) |
| Shared DB contract | `infra/db/` | Backend dev (changes need a PR + review) |

**Rule:** never change `infra/db/schema.sql` silently. It is the contract both
sides build against. Any schema change is its own PR, reviewed by the other dev,
and the ER diagram/docs are updated in the same PR.

## 5. Pull Request checklist

- [ ] Branch is up to date with `main`.
- [ ] Code builds locally; lint/tests pass.
- [ ] No secrets committed (`.env` is gitignored — use `.env.example`).
- [ ] If DB changed: `schema.sql` + migration + docs updated together.
- [ ] PR description says **what** and **why**, and links the task.

## 6. Environment & secrets

- Never commit `.env`. Copy `.env.example` → `.env` locally.
- Backend keeps its own `backend/.env` (NestJS/Prisma). Never commit it.
- Rotate the Meilisearch/JWT keys before production.

## 7. Definition of Done

A feature is done when: it works end-to-end against the real schema, has at least
basic tests, respects RBAC permissions, writes an **audit log** for sensitive
actions, and is merged to `main` via an approved PR. Delete the feature branch
after the merge.

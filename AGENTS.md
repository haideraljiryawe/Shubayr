# Shubayr standing rules

## Project

- Shubayr: single-owner multi-department store in Iraq. Base currency IQD (precision 0), optional USD. Time zone Asia/Baghdad. Weekday convention Sunday=0…Saturday=6.
- Spec: `docs/Shubayr_Software_Engineering_Analysis_v5.1` (.docx/.pdf + Markdown copy). The contract `api/openapi.yaml` is the source of truth.
- Product decisions: [`2026-10-12`](docs/decisions/2026-10-12.md) and
  [`2026-10-17`](docs/decisions/2026-10-17.md). Shubayr has no delivery-agent
  app; delivery-agent app work, including agent wages, is a future add-on.

## Ahmed's responsibility — local development only (mandatory)

- Ahmed's work and responsibility are limited to local development, local
  testing, and reviewing the resulting source changes. He is not responsible
  for modifying, deploying, operating, or maintaining the production environment.
  Production changes belong to the designated production/operations team;
  do not assign their execution, operational approval, or accountability to Ahmed.
- For tasks requested by Ahmed, agents must not modify production services,
  databases or data, infrastructure, DNS/TLS, credentials, access controls,
  secrets, backups, or production-specific configuration and deployment/release
  automation. Preparing production-specific changes in a local checkout does
  not bring those changes into Ahmed's scope.
- Do not connect to production, run production commands or migrations, deploy
  or publish releases, restart production services, or restore production data
  as part of Ahmed's local tasks. Local testing must target explicitly verified
  development/test services and data; never infer the environment from a script
  name or from the fact that a command runs on his computer.
- Authorized commits, pushes, PRs, merges, and isolated non-production CI remain
  part of source collaboration. They are not authorization for a production
  deployment or release. If an action would trigger production automation,
  stop that action and hand it to the production owner rather than executing it.
- When local work depends on a production change, document the dependency and
  hand it off to the responsible team. Continue independent local work; do not
  work around this boundary, request production credentials from Ahmed, or
  treat his implementation/Git approval as production approval.
- This boundary takes precedence over general workflow and handoff instructions
  for Ahmed's tasks. Local sensitive operations still require the user's
  separate concrete approval; "local only" is not permission to destroy data,
  change access/security settings, run migrations, or reboot local machines.

## Git workflow

### Flutter / Mobile — `mobile/` lives on `main`

- Since merge `46a80e9`, `mobile/` on `main` is the real Flutter app,
  maintained by Ahmed. It is not a snapshot: its CI checks (Mobile (Flutter))
  must stay green on every PR, whatever the PR is about.
- Ahmed works like everyone else: short-lived branches off `origin/main` and
  PRs into `main`, under the workflow below. There is no long-lived `mobile`
  branch any more; the old `origin/mobile` (and `codex/mobile-*`) branches are
  history — don't base new work on them or push to them.
- Agents (Codex, Claude Code) do not edit `mobile/` unless Ahmed explicitly asks
  for that task. Authorization for other work never extends to `mobile/`, and a
  Mobile task never extends to the other projects.
- Before editing a shared checkout, check the working tree and Git operation
  state. If uncommitted changes, an unfinished merge/rebase or conflicts could
  put someone's work at risk, stop and ask; never stash, move or discard another
  developer's work as a workaround.

### Workflow for all projects

- One agent per clone/worktree. Branch off current `origin/main`.
- Open a DRAFT PR as soon as the first commit exists; push after every locally green step so another session can continue.
- Never force-push. Never delete a branch, worktree or folder whose unique commits aren't proven on the remote.
- Squash-merge only when ALL real GitHub CI checks are green — the Mobile checks included; then delete the branch (local + remote).
- After every merge, leave the shared checkout (`Desktop\Shubayr`) on an up-to-date `main` — never on a deleted feature branch.
- Don't rename shipped vocabulary (statuses, enum values, field names) and don't go outside the task's scope.

## Contract

- For Mobile tasks, `origin/main:api/openapi.yaml` is authoritative, rather than
  the checked-out branch's contract. Follow the fetch, version discovery and
  migration-note review procedure in `mobile/AGENTS.md`; never silently use a
  stale local contract as the current authority.
- Any `api/openapi.yaml` change regenerates `web/` and `admin/` generated types in the same PR (CI drift checks must pass).
- Strict response validation (types + no undeclared properties) must pass.
- Bump the version per semver and state in the PR description what is breaking (if anything).
- Declare every new error code on every affected route.
- web/ and admin/ live suites must pass before a breaking change merges, and the Mobile CI checks must stay green.
- Document every mobile-facing contract change in docs/mobile/contract-changes-<from>-to-<to>.md in the same PR. A BREAKING mobile-facing change needs Ahmed's OK before it merges. Backend/web/admin contract work does not authorize edits to mobile/ — the app adopts the change in its own PR.
- Delivery-pricing changes may merge only after the checkout → confirmation → delivery → receipt acceptance flow proves that the order total, collection amount, revenue posting, receipt, and exact return allocation reconcile.
- Catalog imports may merge only when preview is proven read-only for catalog/inventory data, every committed row is durably idempotent and restart-resumable, failed batches report exactly what was retained, Stock rows create exactly one phase-5 opening document after product rows succeed, costs remain gated by `cost.view`, and the 5,000-row limit is covered.
- Returns changes may merge only after acceptance proves immutable net-paid shares across successive piece and decimal-quantity returns, delivered-minus-returned eligibility, original-issue-cost inspection, delivery-fee caps, loyalty reversal/restoration, custody and cash refund sources, idempotency, separation of duties, and inventory/custody/cash/loyalty/GL reconciliation.

## Money and dates

- Every money effect goes through the phase-3 posting service, with an operation id on every posting document (replay = same result; different payload = 409). Corrections by reversal/correction documents only — posted entries are immutable.
- All business/accounting dates come from the single Asia/Baghdad business-date helper (#75). Never use UTC midnight or raw `new Date()` as a business date.
- Currency conversion never assumes a rate of 1; a missing rate is a declared error.
- Cost fields are visible only with `cost.view`.
- Separation of duties goes through the existing helper.

## Testing

- Run acceptance on a unique throwaway `shubayr_*_verify` database and drop it afterwards; stop any containers you started.
- Local stack: Postgres host port 55432, API :8000, Web Admin :3200, Mailpit SMTP 11025.

## Handoff (for switching sessions/accounts)

- The PR description keeps:
  - a checklist of the task's numbered items, ticked as they are done;
  - a "Handoff" section updated before you stop for any reason: last green commit, what is in progress, the exact next step, commands to verify.
- The final report starts with: PR link, merge commit (and merge method), contract version, migration count, test counts (Jest, strict-schema, acceptance packs/assertions), anything not done. Report fields that do not apply as N/A; do not merge merely to fill them in.

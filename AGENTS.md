# Shubayr standing rules

## Project

- Shubayr: single-owner multi-department store in Iraq. Base currency IQD (precision 0), optional USD. Time zone Asia/Baghdad. Weekday convention Sunday=0…Saturday=6.
- Spec: `docs/Shubayr_Software_Engineering_Analysis_v5.1` (.docx/.pdf + Markdown copy). The contract `api/openapi.yaml` is the source of truth.

## Git workflow

### Flutter / Mobile — standing policy

- Authorized repository collaborators may request and perform Mobile changes
  through Codex. The requesting authorized team member may approve actions for
  their own task; approval is not reserved to any named developer.
- The default branch for all Flutter/Mobile work is `mobile`. Make requested
  changes directly in the collaborator's existing project checkout on `mobile`,
  and leave them there for the team member to run and inspect.
- Do not create a branch, clone, worktree or Pull Request unless the requesting
  authorized team member explicitly requests it. An isolated branch/worktree is
  not an automatic safety measure.
- Do not merge, squash or rebase without explicit approval from the requesting
  authorized team member. Do not switch to or work on `main` unless explicitly
  requested by that team member. If the checkout is on another branch, stop and
  ask before switching or starting edits.
- Before editing, check the working tree and Git operation state. If conflicting
  uncommitted changes, an unfinished merge/rebase, Git conflicts or another
  condition could put existing work at risk, stop, explain the issue briefly,
  and wait for the requesting team member's decision. Preserve unrelated local
  changes and never overwrite another developer's work. Do not create a
  branch/worktree or move, stash or discard existing work as an automatic
  workaround.
- Leave changes uncommitted unless the requesting authorized team member
  explicitly requests a commit or a clear earlier instruction for the current
  task already requires one. Approval of the implementation alone is not an
  instruction to commit or push; pushing
  also requires explicit authorization for the task.
- Never force-push without explicit authorization for that action. Respect GitHub
  repository permissions and branch protection rules; task approval does not
  authorize bypassing them.
- Changes outside `mobile/` require authorization from the responsible project
  owner; authorization for Mobile work alone does not extend to other projects.
- This policy supersedes conflicting Git/handoff rules for Mobile, including
  the former prohibition on working on `mobile`, automatic branching from
  `origin/main`, automatic PRs/pushes and returning the checkout to `main`.
  The branch/worktree/PR workflow used for PR #99 is not the Mobile default.

### Other projects

The following workflow applies outside Flutter/Mobile. It does not override
the Mobile policy above.

- One agent per clone/worktree. Branch off current `origin/main`.
- Open a DRAFT PR as soon as the first commit exists; push after every locally green step so another session can continue.
- Never force-push. Never delete a branch, worktree or folder whose unique commits aren't proven on the remote.
- Squash-merge only when ALL real GitHub CI checks are green; then delete the branch (local + remote).
- After every merge, leave the shared checkout (`Desktop\Shubayr`) on an up-to-date `main` — never on a deleted feature branch.
- For non-Mobile tasks, do not modify the `mobile` or
  `codex/mobile-app-access-v6` branches. Authorized Mobile tasks follow the
  Flutter/Mobile policy above.
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
- web/ and admin/ live suites must pass before a breaking change merges. mobile/ on main is a stale snapshot of the app: do not block on it — instead document every mobile-affecting change in docs/mobile/contract-changes-<from>-to-<to>.md in the same PR. Backend/web/admin contract work does not authorize edits to mobile/ or the mobile branches; authorized Mobile work follows the Flutter/Mobile policy above.

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

- For Flutter/Mobile, report changed files, verification and remaining work in
  the conversation; keep the edits in the usual checkout on `mobile`. Do not
  create a PR or commit merely to satisfy handoff requirements. The PR-based
  requirements below apply only when a PR workflow is authorized for the task.
- The PR description keeps:
  - a checklist of the task's numbered items, ticked as they are done;
  - a "Handoff" section updated before you stop for any reason: last green commit, what is in progress, the exact next step, commands to verify.
- For an authorized PR workflow, the final report starts with: PR link, merge commit (and merge method), contract version, migration count, test counts (Jest, strict-schema, acceptance packs/assertions), anything not done. Report fields that do not apply as N/A; do not merge merely to fill them in.

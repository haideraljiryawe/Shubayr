# Shubayr standing rules

## Project

- Shubayr: single-owner multi-department store in Iraq. Base currency IQD (precision 0), optional USD. Time zone Asia/Baghdad. Weekday convention Sunday=0…Saturday=6.
- Spec: `docs/Shubayr_Software_Engineering_Analysis_v5.1` (.docx/.pdf + Markdown copy). The contract `api/openapi.yaml` is the source of truth.

## Git workflow

### Flutter / Mobile — standing policy

- The default branch for all Flutter/Mobile work is `mobile`. Make requested
  changes directly in Ahmed's usual project checkout on `mobile`, and leave
  them there so he can run and inspect the app immediately.
- Do not create a branch, clone, worktree or Pull Request unless Ahmed explicitly
  requests it. An isolated branch/worktree is not an automatic safety measure.
- Do not merge, squash or rebase without Ahmed's explicit request. Do not switch
  to or work on `main` unless he explicitly requests it. If the checkout is on
  another branch, stop and ask before switching or starting edits.
- Before editing, check the working tree and Git operation state. If conflicting
  uncommitted changes, an unfinished merge/rebase, Git conflicts or another
  condition could put existing work at risk, stop, explain the issue briefly,
  and wait for Ahmed's decision. Do not create a branch/worktree or move, stash,
  discard or overwrite existing work as an automatic workaround.
- Leave changes uncommitted unless Ahmed explicitly requests a commit or a clear
  earlier instruction for the current task already requires one. Approval of
  the implementation alone is not an instruction to commit or push; pushing
  also requires explicit authorization for the task.
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
- Never touch the `mobile` or `codex/mobile-app-access-v6` branches.
- Don't rename shipped vocabulary (statuses, enum values, field names) and don't go outside the task's scope.

## Contract

- Any `api/openapi.yaml` change regenerates `web/` and `admin/` generated types in the same PR (CI drift checks must pass).
- Strict response validation (types + no undeclared properties) must pass.
- Bump the version per semver and state in the PR description what is breaking (if anything).
- Declare every new error code on every affected route.

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
- Final report starts with: PR link, squash commit, contract version, migration count, test counts (Jest, strict-schema, acceptance packs/assertions), anything not done.

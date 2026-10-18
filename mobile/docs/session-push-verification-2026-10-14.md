# Mobile session and push verification — 14 October 2026

## Scope and baselines

This handoff records the session revalidation changes on `mobile`, the related
Backend fixes, and physical-device observations confirmed by the operator.
It supersedes the outstanding-work status of the **13 October** audit in
[backend-push-integration.md](backend-push-integration.md), which remains a
historical record, not a description of today's runtime.

Authoritative contract checked from `origin/main` at `bc9bd42`: **16.1.0**.
The local Backend used for physical tests is based on `f58e728`, contract
**15.1.1**, with the push fixes described below. Later main changes have not been
merged into that runtime. The relevant authentication/device/inbox wire shapes
are unchanged; this does not certify unrelated Mobile compatibility with all
16.1.0 features. No API changes are introduced by this handoff.

## Mobile behavior

- A foreground return after backgrounding triggers one shared `/me` verification.
  Credential presence alone does not authorize private presentation.
- The verification cover hides private pages during verification or an unresolved
  network error without disposing their navigation stack or form inputs.
- System back is blocked on the root and tab Navigators while covered. Successful
  verification releases the guard; definitive rejection still allows the normal
  redirect to sign-in/guest.
- Network errors preserve credentials and expose retry. Definitive rejection
  after the existing refresh/recovery path ends the session and clears only that
  account's pending-operation journals. Rejection is not labeled account deletion.
- Serialized credentials, revision ownership and shared refresh remain the
  existing authority. Stored account scope is cleanup metadata, not authorization
  or a second token cache. Late results cannot replace a newer session.
- Push permission/registration, notification polling and tap navigation wait for
  verification. The authenticated inbox and current account ownership remain intact.

Primary files: `lib/app/session_verification_gate.dart`,
`lib/app/router/session_navigation_guard.dart`,
`lib/features/auth/presentation/providers/auth_providers.dart`, credential storage,
session exit tasks, and the existing push/polling providers.

`tool/check_debug_environment.mjs` also accepts an optional explicit API URL;
its previous local-file fallback remains compatible. Machine-specific Home/Work,
local-hostname and device launch/task edits are deliberately **not published**.
The unrelated local `ROADMAP.md` edit is also excluded and preserved.

## Backend companion changes

The separate Backend submission contains:

Review: [Backend draft PR #141](https://github.com/haideraljiryawe/Shubayr/pull/141),
commit `1553e76`. It is published for team review, not merged or deployed elsewhere.

1. Migration `20261014000200_allow_internal_push_test`, allowing `push_test`
   only when `is_test=true`, without dropping the allowed-type protection.
2. Exclusion of test events from the unread count published to the event stream.
3. Default APNs sound for the existing visible HTTP v1 notification payload,
   without Android overrides or a new silent/data-message path.
4. An HTTP payload unit test and an isolated PostgreSQL acceptance script.

The migration is already applied to the local test runtime. Preserve its name
and contents. The submission must be reviewed and integrated by the Backend team;
publishing this Mobile document does not deploy those fixes to another environment.

## Automated evidence

The final implementation review reported **2121 Flutter tests passed, 5 live-API
tests skipped**, plus clean Flutter analysis, 213 focused tests, 7 Firebase-config
tests and 4 isolated checks against tracked launch configuration. The full run was
after the back-navigation fix; it is not a claim that live API tests ran.

Backend review on the unchanged companion files reported build/typecheck/lint
passing, **17 focused unit tests, 2 schema tests and 61 PostgreSQL assertions**.
The acceptance script owns a throwaway `shubayr_*_verify` database and does not
boot the production worker or call FCM. It is **not included in `npm test`**.

At publication, Flutter analysis, 14 focused session/Router/HTTP tests and 7
Firebase-config tests were run again and passed. A separate network-disabled
Node 24 container passed 10 provider/CLI tests and 2 schema tests; the five
Backend implementation/test/migration files were hash-matched against its image.
The full suites and PostgreSQL acceptance above are prior final-review evidence,
not newly repeated publication runs. No implementation was changed in publication.

Reproduce Mobile verification from `mobile/`:

```sh
flutter analyze --no-pub
flutter test --no-pub
node --test tool/firebase_debug_config.test.mjs
git diff --check
```

## Physical-device evidence

These results combine server registration/eligibility checks with the user's
observations on iPhone and Galaxy A34. FCM acceptance alone is not delivery proof.
Test events are hidden from the inbox; opening the current notifications page is
the expected generic test-message destination.

| Scenario | Observed result |
| --- | --- |
| Background notification on each platform | Visible delivery, audible sound, tap opens notifications page |
| Samsung logout while iPhone stays signed in | Samsung session/registration becomes ineligible; iPhone remains eligible and receives another notification |
| Samsung login again | New eligible registration; previous registration remains inactive; iPhone unaffected |
| Samsung switches to a second test account | Registrations/joined sessions separate correctly; second-account message reaches Samsung only |
| First-account fan-out after account switch | Unfiltered preview selects only iPhone; sent message reaches iPhone, not Samsung |
| Samsung removed from Recents, screen locked | Notification arrives with sound; after unlock, tap opens notifications page |
| iPhone stopped, screen locked, Flutter debug connection ended | Notification arrives with sound; opening is blocked by Flutter Debug startup restrictions |
| Delete the second account on Samsung while both devices use it | Backend disables/anonymizes account, removes all refresh/device registrations; iPhone returns to sign-in/guest on resume, with no private-data flash noticed and no error |
| Unrelated first account after deletion | Database comparison found account, refresh credentials and device records unchanged |

The account-deletion test was **online**. Database evidence does not establish
direct inspection of secure storage on the phone.

## Remaining checks and deployment boundaries

- Back-navigation fix is covered automatically, not separately re-tested on phones.
- Foreground presentation, Android Settings Force stop, long idle/Doze, physical
  offline/reconnection behavior and request races remain outside manual evidence.
- iOS cold-start routing needs a suitable Profile/Release build. Preserve HTTPS
  and signing requirements; do not weaken them to bypass the Debug limitation.
- Navigation to a specific order from a real operational notification is separate
  work; generic test-message success does not verify that routing.
- No production readiness or exactly-once delivery is claimed. Review production
  credentials, deployment and signing separately; no secrets or private runtime
  evidence files belong in Git.

## Workspace and team handoff

Keep the original checkout on `mobile`. Preserve local launch/tasks and roadmap
changes. The Backend worktree is retained as the reproducible source checkout for
the running local API. Publication inspection confirmed that the container uses
a built image, with no bind mounts, rather than reading live worktree files.
Local credentials, backups and raw verification records remain outside Git with
restricted permissions. Do not clean them merely to obtain an empty Git status.

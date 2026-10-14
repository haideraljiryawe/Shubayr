# Push test constraint and iOS sound fixes — 14 October 2026

## Reviewer summary

The developer CLI could preview an eligible registration but failed before FCM:
`recordTestPush` inserts `type=push_test`, which the PostgreSQL
`notification_events_type_check` constraint rejected. Separately, visible iPhone
notifications arrived without sound because the HTTP v1 payload omitted
`apns.payload.aps.sound`.

This submission fixes those two observed failures:

- New migration `20261014000200_allow_internal_push_test` allows the internal
  type only with `is_test=true` and retains the previous public type whitelist.
- Stream unread counts exclude `is_test` events, consistent with the inbox.
- The existing visible-notification sender adds APNs `sound: default`, with no
  Android override and no new data-only/silent path.
- A provider unit test asserts the actual HTTP request payload. A PostgreSQL
  acceptance test exercises the old schema, migration, real service insertion,
  accepted/rejected types, inbox/count/stream exclusion and session eligibility.

No request/response shape or contract version is changed. No Mobile source is
included in this Backend submission.

## Baseline and integration

Physical tests and automated review used `f58e728` (contract **15.1.1**).
Latest main checked at handoff is `bc9bd42` (contract **16.1.0**). The submitting
owner authorized preserving the tested runtime and submitting its fixes for team
review rather than updating the running source checkout. Main's later changes
have not been integrated or tested together with this submission. Review the PR
against current main and run its real CI before deciding to merge; do not claim
that historical test results cover the combined tree.

The new migration is already applied locally (40 migrations in that runtime).
**Keep its name and contents unchanged.** Review pending migrations and take an
appropriate backup before applying normal migration deployment elsewhere. Do not
edit old applied migrations, run seed or manually weaken the database constraint.

## Validation and reproduction

On the unchanged submitted implementation, review recorded:

- build, TypeScript and ESLint: pass;
- focused CLI/provider unit tests: 17 pass;
- strict response-schema tests: 2 pass;
- PostgreSQL acceptance: 61 assertions pass; disposable database/resources removed.

Publication additionally re-ran 10 provider/CLI unit tests and 2 schema tests in
a disposable network-disabled Node 24 container, all passing. All five submitted
implementation/test/migration files matched that image by SHA-256. The broader
review results above were not re-run; implementation files remained unchanged.

From `backend/`, use the supported Node 24 environment and installed dependencies:

```sh
npm run prisma:generate
npm run build
npm run typecheck
npm run lint
npx jest --runInBand src/modules/notifications/notification-provider.spec.ts src/cli/push-cli-policy.spec.ts
node --test test/openapi-response-validator.spec.mjs
node test/push-test-migration.acceptance.mjs
```

For the final command, supply `DATABASE_URL` through a private environment pointing
to an approved test PostgreSQL server with CREATE DATABASE permission. Do not
supply `FCM_SERVICE_ACCOUNT_JSON_BASE64` or live service credentials. The script
creates/drops its own random `shubayr_*_verify` database, forbids external HTTP,
and does not initialize AppModule/Redis/the live notification worker. Generate
Prisma and build first. **This test is not wired into `npm test`; invoke it explicitly.**

The CLI diagnostic/list/preview commands initialize AppModule and can process
already pending work. They are not equivalent to this isolated acceptance test
and must not be described as guaranteeing no sends.

## Physical verification, confirmed by the operator

- iPhone and Galaxy A34: background receipt, audible sound, tap opens inbox.
- Independent sessions: Samsung logout/relogin leaves iPhone eligible and able
  to receive; old Samsung registration stays ineligible.
- Account switch: new-account message reaches Samsung only; unfiltered old-account
  preview selects only iPhone, which receives the old-account message alone.
- Samsung removed from Recents with screen locked: receipt/sound and navigation
  after unlocking succeed. This is not Settings Force stop or long idle testing.
- iPhone stopped with screen locked: receipt and sound succeed; tap startup is
  blocked by Flutter Debug restrictions, so cold-start routing is unverified.
- Deletion of a dedicated test account removes its refresh/device registrations;
  the second device exits on resume using companion Mobile changes. Another
  account's database state is unchanged. This is an online-only manual test.

The Mobile companion is published separately on `mobile`, documented in
`mobile/docs/session-push-verification-2026-10-14.md` on that branch. No account
deletion Backend behavior was changed by this fix.

## Limits and local workspace

FCM accepted is not device delivery; the results above include user observation.
No production, offline-device, long-idle, Force stop or Profile/Release claims are
made. Backend fixes were not merged to main by this handoff. The active local API
uses a built image with no bind mounts (verified at publication); the worktree is
retained as its reproducible source checkout. Credentials, backups, device identifiers and raw test records are not
part of the submission.

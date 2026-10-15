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

Physical tests and Ahmed's original automated review used `f58e728` (contract
**15.1.1**). During final review, `origin/main` at `c31cc2f` (contract
**16.3.0**) was merged into the PR branch without rewriting history. The
combined tree was then rebuilt and re-tested. No OpenAPI shape changed, so the
contract remains **16.3.0** and generated Web/Admin types do not change.

The new migration was already applied in Ahmed's local 40-migration runtime;
the integrated tree contains 42 migrations.
**Keep its name and contents unchanged.** Review pending migrations and take an
appropriate backup before applying normal migration deployment elsewhere. Do not
edit old applied migrations, run seed or manually weaken the database constraint.

## Validation and reproduction

On the unchanged submitted implementation, review recorded:

- build, TypeScript and ESLint: pass;
- focused CLI/provider unit tests: 17 pass;
- strict response-schema tests: 2 pass;
- PostgreSQL acceptance: 61 assertions pass; disposable database/resources removed.

Final integration review additionally passed the complete 1,357-test Jest suite,
2 strict response-schema tests, and 31 PostgreSQL acceptance packs with 3,087
assertions and 29 replay checks. The focused push migration pack contributed 61
of those assertions. Fresh deployment applied all 42 migrations in timestamp
order; the focused pack also applied this older-timestamp migration after all
later migrations. Its file SHA-256 remained
`29B5995F4D175AC25FB597403135A2EC87A979D7071E20BD4936572893E2BB15`.

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
Prisma and build first. The PostgreSQL test remains intentionally outside the
unit-only `npm test` command, but is now wired into `npm run test:acceptance`
and therefore the CI acceptance job. It can still be invoked directly for a
focused migration check.

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
made. Credentials, backups, device identifiers and raw test records are not part
of the submission.

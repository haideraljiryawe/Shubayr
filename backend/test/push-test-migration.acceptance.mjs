// Run after prisma generate/build: node test/push-test-migration.acceptance.mjs
// DATABASE_URL supplies a PostgreSQL server with CREATE DATABASE permission.
// Owns a fresh *_verify database; never boots AppModule, Redis, FCM or seed.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const require = createRequire(import.meta.url);
require('reflect-metadata');
const { PrismaService } = require('../dist/src/database/prisma.service');
const { AuditService } = require('../dist/src/modules/audit/audit.service');
const {
  NotificationsService,
} = require('../dist/src/modules/notifications/notifications.service');
const {
  NotificationsProcessor,
} = require('../dist/src/modules/notifications/notifications.processor');
const {
  notificationTypes,
} = require('../dist/src/modules/notifications/notification-types');
const { assertPushCliPolicy } = require('../dist/src/cli/push-cli-policy');

assert.equal(
  process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64,
  undefined,
  'Never pass FCM credentials to this test',
);
globalThis.fetch = () => {
  throw new Error('External HTTP forbidden in this test');
};
const root = fileURLToPath(new URL('../', import.meta.url));
const migration = '20261014000200_allow_internal_push_test';
const name = `shubayr_${randomBytes(8).toString('hex')}_verify`;
const source = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(source.protocol));
const target = new URL(source);
target.pathname = `/${name}`;
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const prisma = new PrismaService({ getOrThrow: () => target.toString() });
let created = false;
let staging;
let assertions = 0;
const check = (actual, expected) => {
  assert.deepEqual(actual, expected);
  assertions++;
};
const rejects = async (fn, pattern) => {
  await assert.rejects(fn, pattern);
  assertions++;
};

async function deploy() {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--config',
      path.join(staging, 'prisma.config.ts'),
    ],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: target.toString() },
      encoding: 'utf8',
    },
  );
  assert.equal(
    result.status,
    0,
    'Prisma migrate deploy failed on disposable database',
  );
  assertions++;
}

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await mkdir(path.join(root, 'tmp'), { recursive: true });
  staging = await mkdtemp(path.join(root, 'tmp/push-migration-'));
  await mkdir(path.join(staging, 'migrations'));
  for (const entry of await readdir(path.join(root, 'prisma/migrations'))) {
    if (entry === migration) continue;
    await cp(
      path.join(root, 'prisma/migrations', entry),
      path.join(staging, 'migrations', entry),
      { recursive: true },
    );
  }
  await writeFile(
    path.join(staging, 'prisma.config.ts'),
    `import { defineConfig } from ${JSON.stringify(require.resolve('prisma/config'))};\n` +
      `export default defineConfig({schema:${JSON.stringify(path.join(root, 'prisma/schema.prisma'))},migrations:{path:${JSON.stringify(path.join(staging, 'migrations'))}},datasource:{url:process.env.DATABASE_URL}});\n`,
  );
  await deploy();
  await prisma.$connect();
  const role = await prisma.role.upsert({
    where: { name: 'customer' },
    update: {},
    create: { name: 'customer' },
  });
  const user = await prisma.user.create({
    data: { phone: '+9647700099201', role_id: role.id },
  });
  const other = await prisma.user.create({
    data: { phone: '+9647700099202', role_id: role.id },
  });
  const operator = await prisma.user.create({
    data: { username: 'push-test-operator' },
  });
  const jobs = [];
  const deliveries = [];
  const service = new NotificationsService(
    prisma,
    new AuditService(),
    {
      add: async (jobName, data) => {
        jobs.push({ name: jobName, data });
      },
    },
    {
      send: async (input) => {
        deliveries.push(input);
        return { messageId: `isolated-test-${deliveries.length}` };
      },
    },
    {
      send: async () => {
        throw new Error('Test pushes must not use SMS');
      },
    },
  );
  const processor = new NotificationsProcessor(service);
  async function device(owner, platform = 'ios') {
    const sessionId = randomUUID();
    await prisma.refreshToken.create({
      data: {
        id: randomUUID(),
        session_id: sessionId,
        user_id: owner.id,
        token_hash: randomBytes(32).toString('hex'),
        surface: 'app',
        session_version: owner.session_version,
        expires_at: new Date(Date.now() + 3600000),
      },
    });
    const token = `synthetic-${randomUUID()}`;
    const row = await service.register(
      owner.id,
      sessionId,
      owner.session_version,
      { token, platform, locale: 'en' },
    );
    return { ...row, sessionId, token };
  }
  const iphone = await device(user);
  const second = await device(user, 'android');
  const foreign = await device(other);
  const input = {
    userId: user.id,
    operatorId: operator.id,
    deviceIds: [iphone.id],
    title: 'Isolated test',
    body: 'No network provider',
    operationId: randomUUID(),
  };
  await rejects(
    () => service.recordTestPush(input),
    /notification_events_type_check/,
  );
  check(await prisma.notificationEvent.count(), 0);
  check(
    await prisma.auditLog.count({ where: { action: 'push_test.enqueue' } }),
    0,
  );

  await cp(
    path.join(root, 'prisma/migrations', migration),
    path.join(staging, 'migrations', migration),
    { recursive: true },
  );
  await deploy();
  const applied =
    await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  check(
    applied.some((row) => row.migration_name === migration),
    true,
  );
  const event = await service.recordTestPush(input); // Same service used by CLI.
  check(event.is_test, true);
  check(event.type, 'push_test');
  check(event.target_device_ids, [iphone.id]);
  check((await service.recordTestPush(input)).id, event.id);
  check(await prisma.notificationEvent.count(), 1);
  check((await service.history(user.id, {})).total, 0);
  check((await service.unreadCount(user.id)).unread_count, 0);
  check(await prisma.notificationStreamEvent.count(), 0);
  await service.enqueuePending();
  check(jobs, [{ name: 'fanout', data: { eventId: event.id } }]);
  await processor.process(jobs[0]);
  check(
    deliveries.map((d) => d.recipient),
    [iphone.token],
  );
  const results = await service.testPushResults(event.id);
  check(results.length, 1);
  check(results[0].status, 'sent');
  check(results[0].attempt_count, 1);
  check(results[0].provider_message_id, 'isolated-test-1');
  await processor.process(jobs[0]);
  check(deliveries.length, 1);

  const eventData = (type, isTest = false) => ({
    event_key: randomUUID(),
    user_id: user.id,
    type,
    is_test: isTest,
    target_role: 'customer',
    entity_type: 'order',
    entity_id: randomUUID(),
    title_ar: 'test',
    body_ar: 'test',
    title_en: 'test',
    body_en: 'test',
    deep_link: '/notifications',
    processed_at: new Date(),
  });
  for (const type of notificationTypes) {
    check(
      (await prisma.notificationEvent.create({ data: eventData(type) })).type,
      type,
    );
  }
  for (const [type, isTest] of [
    ['invalid_notification', false],
    ['invalid_notification', true],
    ['push_test', false],
  ]) {
    await rejects(
      () => prisma.notificationEvent.create({ data: eventData(type, isTest) }),
      /notification_events_type_check/,
    );
  }
  // Internal test vocabulary must not become a public preference option.
  await rejects(
    () =>
      prisma.notificationChannelPreference.create({
        data: {
          user_id: user.id,
          type: 'push_test',
          channel: 'push',
          enabled: true,
        },
      }),
    /notification_channel_preferences_type_check/,
  );
  check(
    (await service.history(user.id, { per_page: 100 })).total,
    notificationTypes.length,
  );
  check(
    (await service.unreadCount(user.id)).unread_count,
    notificationTypes.length,
  );
  await prisma.$transaction((tx) =>
    service.record(tx, user.id, 'order_placed', 'order', randomUUID()),
  );
  const stream = await prisma.notificationStreamEvent.findFirst({
    where: { user_id: user.id, event: 'unread.count' },
    orderBy: { sequence: 'desc' },
  });
  check(stream.data.unread_count, notificationTypes.length + 1);
  check(
    (await service.markAllRead(user.id)).updated,
    notificationTypes.length + 1,
  );
  check((await service.unreadCount(user.id)).unread_count, 0);
  check(
    (await prisma.notificationEvent.findUnique({ where: { id: event.id } }))
      .read_at,
    null,
  );

  const revoked = await device(user);
  await prisma.refreshToken.updateMany({
    where: { session_id: revoked.sessionId },
    data: { revoked_at: new Date() },
  });
  const expired = await device(user);
  await prisma.refreshToken.updateMany({
    where: { session_id: expired.sessionId },
    data: { expires_at: new Date(0) },
  });
  const stale = await device(user);
  await prisma.deviceToken.update({
    where: { id: stale.id },
    data: { last_seen_at: new Date(0) },
  });
  const inactive = await device(user);
  await prisma.deviceToken.update({
    where: { id: inactive.id },
    data: { is_active: false },
  });
  const unbound = await device(user);
  await prisma.deviceToken.update({
    where: { id: unbound.id },
    data: { session_id: null },
  });
  const wrongVersion = await device(user);
  await prisma.refreshToken.updateMany({
    where: { session_id: wrongVersion.sessionId },
    data: { session_version: user.session_version + 1 },
  });
  check(
    (await service.eligibleDevices(user.id)).map((d) => d.id).sort(),
    [iphone.id, second.id].sort(),
  );
  const restricted = await service.recordTestPush({
    ...input,
    operationId: randomUUID(),
    deviceIds: [
      iphone.id,
      foreign.id,
      revoked.id,
      expired.id,
      stale.id,
      inactive.id,
      unbound.id,
      wrongVersion.id,
    ],
  });
  await processor.process({ name: 'fanout', data: { eventId: restricted.id } });
  check(
    deliveries.map((d) => d.recipient),
    [iphone.token, iphone.token],
  );
  await rejects(
    () =>
      service.register(user.id, revoked.sessionId, user.session_version, {
        token: 'synthetic-revoked',
        platform: 'ios',
      }),
    /Session is no longer active/,
  );
  const race = await service.recordTestPush({
    ...input,
    operationId: randomUUID(),
  });
  await prisma.refreshToken.updateMany({
    where: { session_id: iphone.sessionId },
    data: { revoked_at: new Date() },
  });
  await processor.process({ name: 'fanout', data: { eventId: race.id } });
  check(deliveries.length, 2);
  const disabled = await service.recordTestPush({
    ...input,
    operationId: randomUUID(),
    deviceIds: [second.id],
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { is_active: false },
  });
  await processor.process({ name: 'fanout', data: { eventId: disabled.id } });
  check(deliveries.length, 2);
  check(await service.eligibleDevices(user.id), []);
  const policy = {
    nodeEnv: 'development',
    allowedAccounts: user.phone,
    allowedOperators: operator.username,
  };
  for (const options of [
    { account: other.phone, operator: operator.username },
    { account: user.phone, operator: 'unauthorized' },
  ]) {
    assert.throws(
      () => assertPushCliPolicy({ ...policy, options }),
      /NOT_ALLOWLISTED/,
    );
    assertions++;
  }
  console.log(
    `Push migration acceptance: ${assertions} assertions passed; provider/queue isolated; no real messages.`,
  );
} finally {
  await prisma.$disconnect();
  if (created) {
    await admin.query(`DROP DATABASE "${name}"`);
    console.log('Disposable verify database dropped.');
  }
  await admin.end();
  if (staging) await rm(staging, { recursive: true, force: true });
}

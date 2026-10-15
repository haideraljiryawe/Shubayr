import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { buildAdminSyncSql, requireLocalDocker } from './local_admin_access.mjs';
import { checkLocalDevelopmentApi } from './debug_environment.mjs';

const adminId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const registry = { 'settings.manage': ['settings', 'Manage settings'] };

test('admin automation refuses remote Docker endpoints', () => {
  requireLocalDocker('unix:///var/run/docker.sock');
  for (const endpoint of ['ssh://remote', 'tcp://localhost:2375', 'https://production', '']) {
    assert.throws(() => requireLocalDocker(endpoint));
  }
});

test('admin automation rejects arbitrary accounts, databases and invalid registries', () => {
  assert.throws(() => buildAdminSyncSql(registry, 'admin'));
  assert.throws(() => buildAdminSyncSql(registry, adminId, 'production'));
  assert.throws(() => buildAdminSyncSql({}, adminId));
  assert.throws(() => buildAdminSyncSql({ '*': ['access', 'Wildcard'] }, adminId));
  assert.throws(() => buildAdminSyncSql({ 'roles.manage': ['access'] }, adminId));
});

test('real PostgreSQL: new permissions, idempotency, account isolation and fail-closed rollback', {
  skip: process.env.RUN_LOCAL_ADMIN_ACCESS_ACCEPTANCE !== '1',
}, async () => {
  const docker = (args, options = {}) => execFileSync('docker', args, {
    encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'], ...options,
  });
  requireLocalDocker(process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT
    ? process.env.DOCKER_HOST
    : docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim());
  const { dbId } = await checkLocalDevelopmentApi();
  const database = `shubayr_admin_${randomUUID().replaceAll('-', '')}_verify`;
  const psql = (input) => docker(['exec', '-i', dbId, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-U', 'shubayr', '-d', database], { input }).trim();
  docker(['exec', dbId, 'createdb', '-U', 'shubayr', database]);
  try {
    // Real current schema, no copies of users, credentials or business data.
    const tables = ['roles', 'users', 'permissions', 'user_permission_grants',
      'permission_presets', 'preset_permissions', 'user_presets', 'audit_logs'];
    psql(docker(['exec', dbId, 'pg_dump', '-U', 'shubayr', '-d', 'shubayr', '--schema-only',
      '--no-owner', '--no-privileges', ...tables.flatMap((name) => ['-t', name])]));
    psql(`INSERT INTO users(id,username) VALUES('${adminId}','admin'),('${otherId}','operator');
      INSERT INTO permissions(key,"group",description) VALUES('settings.manage','settings','Keep description');
      INSERT INTO user_permission_grants(user_id,permission_id,granted_by,reason)
      SELECT '${otherId}',id,'${otherId}','Preserve existing grant' FROM permissions;
      INSERT INTO permission_presets(name,is_system) VALUES('operator',true);
      INSERT INTO preset_permissions SELECT pr.id,p.id FROM permission_presets pr CROSS JOIN permissions p;
      INSERT INTO user_presets(user_id,preset_id,assigned_by,reason)
      SELECT '${adminId}',id,'${adminId}','Preserve assigned preset' FROM permission_presets;`);
    const untouched = () => psql(`SELECT jsonb_build_object(
      'other_user',(SELECT to_jsonb(u) FROM users u WHERE id='${otherId}'),
      'other_grants',(SELECT jsonb_agg(g) FROM user_permission_grants g WHERE user_id='${otherId}'),
      'presets',(SELECT jsonb_agg(p) FROM permission_presets p),
      'preset_permissions',(SELECT jsonb_agg(p) FROM preset_permissions p),
      'assignments',(SELECT jsonb_agg(p) FROM user_presets p));`);
    const original = untouched();
    const sync = (keys) => psql(buildAdminSyncSql(keys, adminId, database));
    const state = () => psql(`SELECT permission_version,
      (SELECT count(*) FROM audit_logs),
      (SELECT count(*) FROM user_permission_grants WHERE user_id='${adminId}')
      FROM users WHERE id='${adminId}';`);
    sync(registry);
    assert.equal(state(), '2|1|1');
    sync(registry);
    assert.equal(state(), '2|1|1', 'repeated launches must not bump versions or duplicate audit entries');
    const future = { ...registry, 'future.view': ['future', "Future page's permission"] };
    sync(future);
    assert.equal(state(), '3|2|2', 'new Backend permission must be registered and granted');
    assert.equal(psql("SELECT description FROM permissions WHERE key='settings.manage';"), 'Keep description');
    assert.equal(untouched(), original, 'other accounts and shared presets must remain unchanged');
    const rejected = { ...future, 'rejected.view': ['future', 'Must roll back'] };
    assert.throws(() => psql(buildAdminSyncSql(rejected, otherId, database)));
    assert.throws(() => psql(buildAdminSyncSql(rejected, randomUUID(), database)));
    assert.throws(() => psql(buildAdminSyncSql(rejected, adminId))); // wrong actual database
    psql(`UPDATE users SET is_active=false WHERE id='${adminId}';`);
    assert.throws(() => sync(rejected));
    assert.equal(psql("SELECT count(*) FROM permissions WHERE key='rejected.view';"), '0');
    assert.equal(state(), '3|2|2');
    assert.equal(untouched(), original);
  } finally {
    docker(['exec', dbId, 'dropdb', '-U', 'shubayr', database]);
  }
});

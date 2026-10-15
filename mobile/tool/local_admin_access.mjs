// Explicit workstation opt-in only. Never imported by the Backend or production.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkLocalDevelopmentApi } from './debug_environment.mjs';

export function requireLocalDocker(endpoint) {
  if (!endpoint.startsWith('unix:///')) {
    throw new Error('Automatic local admin access requires a local Unix Docker socket.');
  }
}

export function buildAdminSyncSql(registry, userId, database = 'shubayr') {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('Local admin access requires the existing account UUID.');
  }
  // The alternate name is only for isolated acceptance tests, never runtime.
  if (database !== 'shubayr' && !/^shubayr_[a-z0-9_]+_verify$/.test(database)) {
    throw new Error('Unexpected local admin database.');
  }
  const rows = Object.entries(registry).map(([key, value]) => {
    if (!/^[a-z][a-z0-9_.]{0,119}$/.test(key) || !Array.isArray(value) ||
        value.length !== 2 || typeof value[0] !== 'string' || !value[0] || value[0].length > 80 ||
        typeof value[1] !== 'string' || value[1].length > 255) {
      throw new Error('Unsupported Backend permission registry; no grants changed.');
    }
    return { key, group: value[0], description: value[1] };
  });
  if (!rows.length) throw new Error('Backend permission registry is empty.');
  const payload = JSON.stringify(rows).replaceAll("'", "''");
  return `BEGIN;
SET LOCAL standard_conforming_strings = on;
CREATE TEMP TABLE requested_permissions ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset('${payload}'::jsonb)
AS p(key text, "group" text, description text);
DO $sync$
DECLARE
  target_id uuid;
  before_access jsonb;
  after_access jsonb;
  inserted_grants integer;
BEGIN
  IF current_database() <> '${database}' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
  SELECT id INTO STRICT target_id FROM users
  WHERE id='${userId}' AND username='admin' AND is_active=true FOR UPDATE;
  SELECT jsonb_build_object('permission_keys', COALESCE(jsonb_agg(p.key ORDER BY p.key), '[]'::jsonb))
    INTO before_access FROM user_permission_grants g JOIN permissions p ON p.id=g.permission_id
    WHERE g.user_id=target_id;
  INSERT INTO permissions(key,"group",description)
    SELECT key,"group",description FROM requested_permissions ON CONFLICT(key) DO NOTHING;
  INSERT INTO user_permission_grants(user_id,permission_id,granted_by,reason)
    SELECT target_id,p.id,target_id,'Owner-enabled local admin permission synchronization at Web Admin launch.'
    FROM permissions p JOIN requested_permissions r ON r.key=p.key
    ON CONFLICT(user_id,permission_id) DO NOTHING;
  GET DIAGNOSTICS inserted_grants=ROW_COUNT;
  IF inserted_grants > 0 THEN
    UPDATE users SET permission_version=permission_version+1 WHERE id=target_id;
    SELECT jsonb_build_object('permission_keys', COALESCE(jsonb_agg(p.key ORDER BY p.key), '[]'::jsonb))
      INTO after_access FROM user_permission_grants g JOIN permissions p ON p.id=g.permission_id
      WHERE g.user_id=target_id;
    INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,"before","after",reason)
      VALUES(target_id,'staff.access.replace','user',target_id,before_access,after_access,
        'Owner-enabled local admin synchronization: additive grants from running Backend registry only.');
  END IF;
END $sync$;
COMMIT;
`;
}

export async function syncLocalAdminPermissions() {
  const path = join(homedir(), '.config/shubayr/local-admin-access.json');
  let config;
  try {
    config = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return; // No opt-in: preserve ordinary RBAC.
    throw new Error('Cannot read local admin access opt-in.');
  }
  if (config.enabled !== true) return;
  const docker = (args, options = {}) => execFileSync('docker', args, {
    encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'], ...options,
  });
  // DOCKER_CONTEXT takes precedence over DOCKER_HOST, as in the Docker CLI.
  const endpoint = process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT
    ? process.env.DOCKER_HOST
    : docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim();
  requireLocalDocker(endpoint);
  const { apiId, dbId } = await checkLocalDevelopmentApi();
  const registry = JSON.parse(docker(['exec', apiId, 'node', '-e',
    'console.log(JSON.stringify(require("/app/dist/src/common/access/permission-registry.js").PERMISSION_REGISTRY))',
  ]));
  const input = buildAdminSyncSql(registry, config.userId);
  docker(['exec', '-i', dbId, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'shubayr', '-d', 'shubayr'], { input });
  console.log(`Local admin permissions synchronized: ${Object.keys(registry).length} supported Backend permissions.`);
}

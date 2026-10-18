import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDebugApi, validateLocalStack } from './debug_environment.mjs';

const nic = (address) => ({ address, family: 'IPv4', internal: false });
test('simulators route to the same Mac API without requiring LAN access', () => {
  assert.equal(resolveDebugApi('iphone-simulator', {}), 'http://localhost:8000/api/v1');
  assert.equal(resolveDebugApi('ipad-simulator', {}), 'http://localhost:8000/api/v1');
  assert.equal(resolveDebugApi('android-emulator', {}), 'http://10.0.2.2:8000/api/v1');
});
test('physical devices follow the active home/work interface, not a stored IP', () => {
  for (const address of ['192.168.3.50', '192.168.4.50']) {
    for (const target of ['iphone-device', 'android-device']) {
      assert.equal(resolveDebugApi(target, { en0: [nic(address)], utun: [nic('10.5.0.1')] }), `http://${address}:8000/api/v1`);
    }
  }
  for (const interfaces of [{}, {en0: [nic('192.168.1.50')]}, {en0: [nic('192.168.3.50')], en1: [nic('192.168.4.50')]}]) {
    assert.throws(() => resolveDebugApi('iphone-device', interfaces));
  }
  assert.throws(() => resolveDebugApi('production', {}));
});
test('preflight refuses production and alternate databases, even with healthy HTTP', () => {
  const api = { State: {Running: true}, Config: {Env: [
    'NODE_ENV=development', 'APP_ENV=development', 'DATABASE_URL=postgresql://local:password@db:5432/shubayr',
  ]}, NetworkSettings: {Networks: {local: {}}} };
  const db = {State: {Running: true}, NetworkSettings: {Networks: {local: {Aliases: ['db']}}}};
  validateLocalStack(api, db);
  for (const [from, to] of [['development','production'], ['/shubayr','/alternate'], ['@db:', '@remote:']]) {
    const changed = structuredClone(api);
    changed.Config.Env = changed.Config.Env.map((e) => e.replaceAll(from, to));
    assert.throws(() => validateLocalStack(changed, db));
  }
  assert.throws(() => validateLocalStack(api, {...db, State: {Running: false}}));
});

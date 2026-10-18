import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkFirebaseDebugConfig, validateFirebaseDebugConfig } from './firebase_debug_config.mjs';

const fixture = (platform) => ({
  FIREBASE_API_KEY: 'test-client-key',
  FIREBASE_APP_ID: `1:123:${platform}:abcdef`,
  FIREBASE_MESSAGING_SENDER_ID: '123',
  FIREBASE_PROJECT_ID: 'test-project',
});

for (const platform of ['ios', 'android']) {
  test(`accepts complete ${platform} client configuration`, () => {
    validateFirebaseDebugConfig(fixture(platform), platform);
  });
}

test('rejects incomplete, wrong-platform and mismatched-sender configuration', () => {
  for (const key of Object.keys(fixture('ios'))) {
    assert.throws(() => validateFirebaseDebugConfig({ ...fixture('ios'), [key]: '' }, 'ios'));
  }
  for (const config of [null, [], {}, { ...fixture('ios'), FIREBASE_APP_ID: 'bad' },
    { ...fixture('ios'), FIREBASE_MESSAGING_SENDER_ID: '456' }, fixture('android')]) {
    assert.throws(() => validateFirebaseDebugConfig(config, 'ios'));
  }
});

test('rejects server credentials and API overrides without disclosing values', () => {
  for (const key of ['private_key', 'FCM_SERVICE_ACCOUNT_JSON_BASE64', 'API_URL']) {
    assert.throws(() => validateFirebaseDebugConfig({ ...fixture('ios'), [key]: 'DO-NOT-PRINT' }, 'ios'),
      (error) => !error.message.includes('DO-NOT-PRINT'));
  }
});

test('missing and malformed external files fail safely; valid file succeeds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shubayr-firebase-config-'));
  const path = join(directory, 'client.json');
  try {
    await assert.rejects(checkFirebaseDebugConfig(path, 'ios'), /missing, unreadable or invalid JSON/);
    await writeFile(path, 'DO-NOT-PRINT');
    await assert.rejects(checkFirebaseDebugConfig(path, 'ios'), (error) => !error.message.includes('DO-NOT-PRINT'));
    await writeFile(path, JSON.stringify(fixture('ios')));
    await checkFirebaseDebugConfig(path, 'ios');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const folder of ['../../.vscode/', '../.vscode/']) {
  test(`${folder} has five Mobile profiles plus the local Web Admin launcher`, async () => {
    const read = async (name) => JSON.parse(await readFile(new URL(folder + name, import.meta.url), 'utf8'));
    const config = await read('launch.json');
    const tasks = (await read('tasks.json')).tasks;
    assert.deepEqual(config.configurations.map((c) => c.name), [
      'iPhone Simulator', 'iPad Simulator', 'Android Emulator', 'iPhone Device — iPhone 16 Pro', 'Android Device — Galaxy A34', 'Web Admin',
    ]);
    assert.equal(config.compounds, undefined);
    assert.equal(tasks.length, 5);
    const admin = config.configurations.find((c) => c.name === 'Web Admin');
    assert.equal(admin.type, 'node-terminal');
    assert.equal(admin.command, 'node tool/run_web_admin.mjs');
    for (const launch of config.configurations.filter((c) => c.type === 'dart')) {
      const platform = launch.name.startsWith('Android') ? 'android' : 'ios';
      assert.equal(launch.flutterMode, 'debug');
      assert.equal(launch.type, 'dart');
      assert.ok(launch.toolArgs.includes(`--dart-define-from-file=\${env:HOME}/Documents/firebase/shubayr-${platform}.json`));
      const task = tasks.find((t) => t.label === launch.preLaunchTask);
      assert.equal(task.command, 'node');
      assert.ok(launch.toolArgs.some((arg) => arg.endsWith(`/.dart_tool/run/${task.args[1]}.json`)));
    }
  });
}

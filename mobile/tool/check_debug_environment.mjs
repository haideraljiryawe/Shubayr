// Prepares only ignored Flutter debug defines. Never starts/migrates/seeds Docker.
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkFirebaseDebugConfig } from './firebase_debug_config.mjs';
import { resolveDebugApi, targets, checkLocalDevelopmentApi } from './debug_environment.mjs';

try {
  const target = process.argv[2];
  const apiUrl = resolveDebugApi(target);
  await checkFirebaseDebugConfig(
    join(homedir(), 'Documents/firebase', `shubayr-${targets[target].platform}.json`),
    targets[target].platform,
  );
  await checkLocalDevelopmentApi(apiUrl);
  const directory = new URL('../.dart_tool/run/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const path = new URL(`${target}.json`, directory);
  const temporary = new URL(`${target}.${process.pid}.tmp`, directory);
  await writeFile(temporary, JSON.stringify({ DATA_SOURCE: 'remote', API_URL: apiUrl }, null, 2) + '\n');
  await rename(temporary, path);
  console.log(`Mobile debug ready: ${target}; API ${apiUrl}; local Docker database shubayr.`);
  console.log('Firebase client configuration validated. Push delivery also requires platform permissions/APNs or Google Play services.');
} catch (error) {
  // Child-process errors may contain environment details; never echo them.
  const message = error.cmd || error.stdout || error.stderr
    ? 'Cannot inspect the local Docker stack. Start Docker and the existing development API.'
    : error.message;
  console.error(`\nMobile launch blocked: ${message}\n`);
  process.exitCode = 1;
}

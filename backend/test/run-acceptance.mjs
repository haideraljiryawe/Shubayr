import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import pg from 'pg';

const { Client } = pg;
const source = process.env.DATABASE_URL;
if (!source) throw new Error('DATABASE_URL is required to create a disposable acceptance database');
const baseUrl = new URL(source);
if (!['postgres:', 'postgresql:'].includes(baseUrl.protocol)) {
  throw new Error('DATABASE_URL must be a PostgreSQL URL');
}
const name = `shubayr_${randomBytes(8).toString('hex')}_verify`;
const adminUrl = new URL(baseUrl);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${name}`;
const admin = new Client({ connectionString: adminUrl.toString() });
const environment = { ...process.env, DATABASE_URL: testUrl.toString(), APP_ENV: 'development' };
const node = process.execPath;
const prisma = 'node_modules/prisma/build/index.js';
const tsNode = 'node_modules/ts-node/dist/bin.js';
const apiEntry = 'dist/src/main.js';
let api;
let created = false;

function run(script, args = [], env = environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [script, ...args], { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${code ?? signal}`));
    });
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForApi(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (api.exitCode !== null) throw new Error('Acceptance API stopped before it became ready');
    try {
      const response = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* API is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Acceptance API did not become ready within 30 seconds');
}

try {
  if (!existsSync(apiEntry)) throw new Error('Build the backend first: npm run build');
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  console.log(`Acceptance database: ${name} (disposable)`);
  const port = await freePort();
  const apiUrl = `http://127.0.0.1:${port}/api/v1`;
  environment.API_PORT = String(port);
  environment.PUBLIC_API_URL = apiUrl;
  await run(prisma, ['migrate', 'deploy']);
  await run(tsNode, ['--transpile-only', 'prisma/seed.ts']);
  // A second seed run proves idempotency, including the SHUBAYR10 coupon.
  await run(tsNode, ['--transpile-only', 'prisma/seed.ts']);
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  const acceptanceEnv = { ...environment, ACCEPTANCE_API_URL: apiUrl, ACCEPTANCE_DATABASE_NAME: name };
  await run('test/real-data.acceptance.mjs', [], acceptanceEnv);
  await run('test/order.acceptance.mjs', [], acceptanceEnv);
  await run('test/deliveries.acceptance.mjs', [], acceptanceEnv);
} finally {
  if (api && api.exitCode === null) {
    api.kill();
    await new Promise((resolve) => api.once('exit', resolve));
  }
  if (created) {
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    console.log(`Dropped disposable acceptance database: ${name}`);
  }
  await admin.end();
}

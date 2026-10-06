import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import pg from 'pg';

const { Client } = pg;
const source = process.env.DATABASE_URL;
if (!source)
  throw new Error(
    'DATABASE_URL is required to create a disposable acceptance database',
  );
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
const environment = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  APP_ENV: 'development',
  TRUSTED_PROXIES: process.env.TRUSTED_PROXIES ?? '127.0.0.1/32',
  RATE_LIMIT_CATALOG_PER_MINUTE: '600',
  RATE_LIMIT_NORMAL_PER_MINUTE: '120',
  RATE_LIMIT_STRICT_PER_MINUTE: '30',
};
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
  await new Promise((resolve, reject) =>
    server.listen(0, '127.0.0.1', (error) =>
      error ? reject(error) : resolve(),
    ),
  );
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForApi(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (api.exitCode !== null)
      throw new Error('Acceptance API stopped before it became ready');
    try {
      const response = await fetch(`${url}/ready`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      /* API is still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Acceptance API did not become ready within 60 seconds');
}

async function stopApi() {
  if (api && api.exitCode === null) {
    api.kill();
    await new Promise((resolve) => api.once('exit', resolve));
  }
}

try {
  if (!existsSync(apiEntry))
    throw new Error('Build the backend first: npm run build');
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  console.log(`Acceptance database: ${name} (disposable)`);
  const port = await freePort();
  const apiUrl = `http://127.0.0.1:${port}/api/v1`;
  environment.API_PORT = String(port);
  environment.PUBLIC_API_URL = apiUrl;
  await run(prisma, ['migrate', 'deploy']);
  await run(prisma, [
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'prisma/schema.prisma',
    '--script',
    '--exit-code',
  ]);
  await run(tsNode, ['--transpile-only', 'prisma/seed.ts']);
  // A second seed run proves idempotency, including the SHUBAYR10 coupon.
  await run(tsNode, ['--transpile-only', 'prisma/seed.ts']);
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  const acceptanceEnv = {
    ...environment,
    ACCEPTANCE_API_URL: apiUrl,
    ACCEPTANCE_DATABASE_NAME: name,
    NODE_OPTIONS:
      `${process.env.NODE_OPTIONS ?? ''} --import=./test/openapi-response-validator.mjs`.trim(),
  };
  await run('test/financial-core.acceptance.mjs', [], acceptanceEnv);
  await run('test/catalog-v2.acceptance.mjs', [], acceptanceEnv);
  await run('test/inventory-costing.acceptance.mjs', [], acceptanceEnv);
  await run('test/purchasing.acceptance.mjs', [], acceptanceEnv);
  await run('test/real-data.acceptance.mjs', [], acceptanceEnv);
  await run('test/access-model.acceptance.mjs', [], acceptanceEnv);
  await run('test/backend-followups.acceptance.mjs', [], acceptanceEnv);
  await run('test/wishlist.acceptance.mjs', [], acceptanceEnv);
  await run('test/order.acceptance.mjs', [], acceptanceEnv);
  await run('test/delivery-collection.acceptance.mjs', [], acceptanceEnv);
  await run('test/admin-orders.acceptance.mjs', [], acceptanceEnv);
  await run('test/deliveries.acceptance.mjs', [], acceptanceEnv);
  await run('test/delivery-parties.acceptance.mjs', [], acceptanceEnv);
  await run('test/returns.acceptance.mjs', [], acceptanceEnv);
  // Each pack models a separate client, but packs without an explicit
  // forwarded address otherwise share the runner's loopback OTP bucket.
  // Reset only the in-memory limiter before the remaining app-client packs;
  // the disposable database and all durable state stay in place.
  await stopApi();
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  await run('test/loyalty.acceptance.mjs', [], acceptanceEnv);
  await run('test/reviews.acceptance.mjs', [], acceptanceEnv);
  await run('test/notifications.acceptance.mjs', [], acceptanceEnv);
  await run('test/phase2-monitoring.acceptance.mjs', [], acceptanceEnv);
  // Reset the in-memory admin-login throttle before the final packs. The C5
  // delivery collection pack adds another staff session to the combined run.
  await stopApi();
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  await run('test/c5c-cart-rate-limits.acceptance.mjs', [], acceptanceEnv);
  await run('test/c5b-gaps.acceptance.mjs', [], acceptanceEnv);
  await run('test/qa-fixes.acceptance.mjs', [], acceptanceEnv);
  // Keep inventory lifecycle last: delivered/returned rows are intentionally
  // immutable and cannot be removed without defeating the database guards.
  // Restart against the same disposable database first: the combined packs
  // intentionally exceed the production admin-login throttle, whose store is
  // in memory. This also proves that all prior state survives an API restart.
  await stopApi();
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  await run('test/inventory-lifecycle.acceptance.mjs', [], acceptanceEnv);
} finally {
  await stopApi();
  if (created) {
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    console.log(`Dropped disposable acceptance database: ${name}`);
  }
  await admin.end();
}

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname } from 'node:path';
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
const closingName = `shubayr_${randomBytes(8).toString('hex')}_verify`;
const adminUrl = new URL(baseUrl);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const testUrl = new URL(baseUrl);
testUrl.pathname = `/${name}`;
const closingUrl = new URL(baseUrl);
closingUrl.pathname = `/${closingName}`;
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
let closingCreated = false;
let suiteError = null;
const suiteStartedAt = new Date();
const packResults = [];

function isAcceptancePack(script) {
  return /^test[\\/].+\.acceptance\.mjs$/.test(script);
}

function assertionCount(output) {
  const counts = [];
  for (const pattern of [
    /([\d,]+)\s+assertions?\b/giu,
    /assertions?\s*:\s*([\d,]+)/giu,
  ]) {
    for (const match of output.matchAll(pattern)) {
      counts.push(Number(match[1].replaceAll(',', '')));
    }
  }
  return counts.length === 0 ? null : Math.max(...counts);
}

function gitValue(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function contractVersion() {
  const contract = readFileSync('../api/openapi.yaml', 'utf8');
  return contract.match(/^\s{2}version:\s*([^\s#]+)/mu)?.[1] ?? null;
}

function writeAcceptanceResults() {
  const target = process.env.ACCEPTANCE_RESULTS_PATH?.trim();
  if (!target) return;
  const finishedAt = new Date();
  const failedPacks = packResults.filter((pack) => pack.status === 'failed');
  const result = {
    schema_version: 1,
    status: suiteError || failedPacks.length > 0 ? 'failed' : 'passed',
    commit:
      process.env.ACCEPTANCE_COMMIT?.trim() || gitValue(['rev-parse', 'HEAD']),
    tag:
      process.env.ACCEPTANCE_RELEASE_TAG?.trim() ||
      gitValue(['describe', '--tags', '--exact-match']),
    contract_version: contractVersion(),
    started_at: suiteStartedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - suiteStartedAt.getTime(),
    pack_count: packResults.length,
    passed_packs: packResults.filter((pack) => pack.status === 'passed').length,
    failed_packs: failedPacks.length,
    assertion_count: packResults.reduce(
      (sum, pack) => sum + (pack.assertions ?? 0),
      0,
    ),
    error: suiteError instanceof Error ? suiteError.message : null,
    packs: packResults,
  };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Acceptance results written to ${target}`);
}

function run(script, args = [], env = environment) {
  return new Promise((resolve, reject) => {
    const pack = isAcceptancePack(script);
    const startedAt = new Date();
    let output = '';
    let settled = false;
    const child = spawn(node, [script, ...args], {
      env,
      stdio: pack ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    });
    if (pack) {
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        process.stdout.write(chunk);
      });
      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
        process.stderr.write(chunk);
      });
    }
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      if (pack) {
        packResults.push({
          pack: basename(script),
          status: 'failed',
          assertions: assertionCount(output),
          started_at: startedAt.toISOString(),
          duration_ms: Date.now() - startedAt.getTime(),
          error: error.message,
        });
      }
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      const error =
        code === 0 ? null : new Error(`${script} exited with ${code ?? signal}`);
      if (pack) {
        packResults.push({
          pack: basename(script),
          status: error ? 'failed' : 'passed',
          assertions: assertionCount(output),
          started_at: startedAt.toISOString(),
          duration_ms: Date.now() - startedAt.getTime(),
          error: error?.message ?? null,
        });
      }
      if (error) reject(error);
      else resolve();
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

  // The closing pack owns a complete clean business day. Run it in a second
  // disposable database so its real USD rate and documents cannot invalidate
  // older packs that intentionally test an empty accounting precondition.
  await admin.query(`CREATE DATABASE "${closingName}"`);
  closingCreated = true;
  console.log(`Closing acceptance database: ${closingName} (disposable)`);
  const closingPort = await freePort();
  const closingApiUrl = `http://127.0.0.1:${closingPort}/api/v1`;
  const closingEnvironment = {
    ...environment,
    DATABASE_URL: closingUrl.toString(),
    API_PORT: String(closingPort),
    PUBLIC_API_URL: closingApiUrl,
  };
  await run(prisma, ['migrate', 'deploy'], closingEnvironment);
  await run(
    prisma,
    [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
      '--exit-code',
    ],
    closingEnvironment,
  );
  await run(tsNode, ['--transpile-only', 'prisma/seed.ts'], closingEnvironment);
  await run(tsNode, ['--transpile-only', 'prisma/seed.ts'], closingEnvironment);
  api = spawn(node, [apiEntry], {
    env: closingEnvironment,
    stdio: 'inherit',
  });
  await waitForApi(closingApiUrl);
  await run('test/phase8-closing.acceptance.mjs', [], {
    ...closingEnvironment,
    ACCEPTANCE_API_URL: closingApiUrl,
    ACCEPTANCE_DATABASE_NAME: closingName,
    NODE_OPTIONS:
      `${process.env.NODE_OPTIONS ?? ''} --import=./test/openapi-response-validator.mjs`.trim(),
  });
  await stopApi();
  await admin.query(`DROP DATABASE "${closingName}" WITH (FORCE)`);
  closingCreated = false;
  console.log(`Dropped disposable closing database: ${closingName}`);

  // This pack deliberately deploys every later migration first, then adds the
  // older corrective push-test migration. Keep it in the CI acceptance run so
  // both historical-upgrade ordering and the isolated delivery safeguards are
  // continuously verified.
  await run('test/push-test-migration.acceptance.mjs', [], environment);

  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  const acceptanceEnv = {
    ...environment,
    ACCEPTANCE_API_URL: apiUrl,
    ACCEPTANCE_DATABASE_NAME: name,
    NODE_OPTIONS:
      `${process.env.NODE_OPTIONS ?? ''} --import=./test/openapi-response-validator.mjs`.trim(),
  };
  await run('test/delivery-pricing-d1.acceptance.mjs', [], acceptanceEnv);
  // The D1 pack uses several independent app/admin sessions; reset only the
  // in-memory throttles before the established acceptance sequence.
  await stopApi();
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  await run('test/financial-core.acceptance.mjs', [], acceptanceEnv);
  await run('test/expenses.acceptance.mjs', [], acceptanceEnv);
  await run('test/catalog-v2.acceptance.mjs', [], acceptanceEnv);
  await run('test/catalog-import-d2.acceptance.mjs', [], acceptanceEnv);
  await run('test/inventory-costing.acceptance.mjs', [], acceptanceEnv);
  await run('test/purchasing.acceptance.mjs', [], acceptanceEnv);
  await run('test/real-data.acceptance.mjs', [], acceptanceEnv);
  await run('test/access-model.acceptance.mjs', [], acceptanceEnv);
  await run('test/backend-followups.acceptance.mjs', [], acceptanceEnv);
  await run('test/wishlist.acceptance.mjs', [], acceptanceEnv);
  await run('test/order.acceptance.mjs', [], acceptanceEnv);
  await run('test/delivery-collection.acceptance.mjs', [], acceptanceEnv);
  // C17 adds purchase/courier operator sessions to the shared sequence. On a
  // fast runner those independent packs now reach the production admin-login
  // limit before its one-minute window expires. Reset only the in-memory
  // limiter; keep the database and all durable cross-pack state intact.
  await stopApi();
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  await run('test/cash-receipts.acceptance.mjs', [], acceptanceEnv);
  // C7 adds two staff sessions to a sequence that already approaches the
  // production admin-login limit. Each acceptance pack models a separate
  // client, so reset only the in-memory limiter before the new pack.
  await stopApi();
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  await run('test/custody-exceptions.acceptance.mjs', [], acceptanceEnv);
  await stopApi();
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  await run('test/external-driver-trips.acceptance.mjs', [], acceptanceEnv);
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
  await stopApi();
  api = spawn(node, [apiEntry], { env: environment, stdio: 'inherit' });
  await waitForApi(apiUrl);
  await run('test/push-p1.acceptance.mjs', [], acceptanceEnv);
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
  await run('test/c13-settings.acceptance.mjs', [], acceptanceEnv);
  await run('test/notes-contract-c16.acceptance.mjs', [], acceptanceEnv);
  await run('test/mobile-audit-m1.acceptance.mjs', [], acceptanceEnv);
  await run('test/inventory-lifecycle.acceptance.mjs', [], acceptanceEnv);
  // Reports seed 20,001 immutable posted order lines across three months and
  // intentionally close one period, so keep this last in the shared database.
  await run('test/reports-part1.acceptance.mjs', [], acceptanceEnv);
  await run('test/reports-part2.acceptance.mjs', [], acceptanceEnv);
  await run('test/phase11-12-completion.acceptance.mjs', [], acceptanceEnv);
  await run('test/report-export-permissions.acceptance.mjs', [], acceptanceEnv);
  // Final cross-pack gate: all earlier scenarios have posted into the same
  // real database, so prove the release examples and ledger invariants last.
  await run('test/section29-release.acceptance.mjs', [], acceptanceEnv);
} catch (error) {
  suiteError = error;
  throw error;
} finally {
  try {
    await stopApi();
    if (closingCreated) {
      await admin.query(`DROP DATABASE "${closingName}" WITH (FORCE)`);
      console.log(`Dropped disposable closing database: ${closingName}`);
    }
    if (created) {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      console.log(`Dropped disposable acceptance database: ${name}`);
    }
    await admin.end();
  } catch (error) {
    suiteError ??= error;
    throw error;
  } finally {
    writeAcceptanceResults();
  }
}

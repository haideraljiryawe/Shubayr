// Uses cached Docker images, isolated services and a unique disposable database.
// Run from the checkout: node mobile/tool/verify_api134.mjs
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceBackend = resolve(mobile, '../backend');
const require = createRequire(join(sourceBackend, 'package.json'));
const { Client } = require('pg');
const name = `shubayr_${randomBytes(8).toString('hex')}_verify`;
const temp = mkdtempSync(join(tmpdir(), 'shubayr-api134-'));
const backend = join(temp, 'backend');
cpSync(sourceBackend, backend, { recursive: true, filter: path => !/[/\\](node_modules|dist|\.env(?:\..*)?)($|[/\\])/.test(path) });
const log = openSync(join(temp, 'services.log'), 'w');
const containers = [];
let apiProcess;
let db;
let created = false;
let succeeded = false;
const environment = { ...process.env };
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function freePort() {
  const server = createServer();
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const port = server.address().port;
  await new Promise(ok => server.close(ok)); return port;
}
function run(command, args, cwd = backend) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: ['ignore', log, log] });
    child.once('error', fail);
    child.once('exit', code => code === 0 ? ok() : fail(new Error(`${command} exited ${code}; see ${temp}/services.log`)));
  });
}
function startContainer(suffix, args) {
  const container = `${name}-${suffix}`;
  docker('create', '--name', container, ...args);
  containers.push(container);
  docker('start', container);
}
try {
  const redisPort = await freePort(), s3Port = await freePort(), apiPort = await freePort();
  const password = randomBytes(24).toString('hex');
  const s3Password = randomBytes(24).toString('hex');
  startContainer('db', ['-e', `POSTGRES_PASSWORD=${password}`, '-p', '127.0.0.1:55432:5432', 'postgres:16-alpine']);
  startContainer('redis', ['-p', `127.0.0.1:${redisPort}:6379`, 'redis:7-alpine']);
  startContainer('s3', ['-e', 'MINIO_ROOT_USER=verify', '-e', `MINIO_ROOT_PASSWORD=${s3Password}`, '-p', `127.0.0.1:${s3Port}:9000`,
    'quay.io/minio/minio:RELEASE.2025-07-23T15-54-02Z', 'server', '/data']);
  Object.assign(environment, {
    APP_ENV: 'development', NODE_ENV: 'test', API_PORT: String(apiPort),
    DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:55432/${name}?schema=public`,
    REDIS_URL: `redis://127.0.0.1:${redisPort}`, PUBLIC_API_URL: `http://127.0.0.1:${apiPort}/api/v1`,
    // Search is deliberately unavailable; the API's documented DB fallback is used.
    MEILI_HOST: 'http://127.0.0.1:1', MEILI_MASTER_KEY: 'isolated-verification',
    JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    S3_ENDPOINT: `http://127.0.0.1:${s3Port}`, S3_ACCESS_KEY: 'verify', S3_SECRET_KEY: s3Password,
    S3_BUCKET: 'verify-media', NOTIFICATION_PROVIDER: 'disabled', SMS_GATEWAY_URL: '', SMS_GATEWAY_TOKEN: '',
    TRUSTED_PROXIES: '127.0.0.1/32', RATE_LIMIT_STRICT_PER_MINUTE: '120',
  });
  for (let i = 0; i < 60; i++) {
    try { docker('exec', containers[0], 'pg_isready', '-U', 'postgres'); break; }
    catch { if (i === 59) throw new Error('Postgres did not start'); await new Promise(r => setTimeout(r, 500)); }
  }
  db = new Client({ connectionString: environment.DATABASE_URL.replace(`/${name}?`, '/postgres?') });
  await db.connect(); await db.query(`CREATE DATABASE "${name}"`); created = true;
  console.log(`Created isolated database ${name}; existing services are untouched.`);
  await run('npm', ['ci']);
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'generate']);
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await run(process.execPath, ['node_modules/ts-node/dist/bin.js', '--transpile-only', 'prisma/seed.ts']);
  await run('npm', ['run', 'build']);
  apiProcess = spawn(process.execPath, ['dist/src/main.js'], { cwd: backend, env: environment, stdio: ['ignore', log, log] });
  for (let i = 0; i < 120; i++) {
    if (apiProcess.exitCode !== null) throw new Error('API stopped during startup');
    try { if ((await fetch(`${environment.PUBLIC_API_URL}/ready`)).ok) break; } catch {}
    if (i === 119) throw new Error('API readiness timed out');
    await new Promise(r => setTimeout(r, 500));
  }
  environment.ACCEPTANCE_API_URL = environment.PUBLIC_API_URL;
  environment.ACCEPTANCE_DATABASE_NAME = name;
  // Reuse the repository's real accounting fixture instead of inventing a
  // reduced order that bypasses custody or posting invariants.
  const source = readFileSync(join(backend, 'test/delivery-collection.acceptance.mjs'), 'utf8');
  const marker = '\nconst expected = {';
  if (!source.includes(marker)) throw new Error('Collection fixture source changed; review this runner');
  const fixturePath = join(temp, 'fixture.json');
  const setup = source.slice(0, source.indexOf(marker))
    .replace("import pg from 'pg';", `import { createRequire } from 'node:module';\nconst pg = createRequire(${JSON.stringify(join(backend, 'package.json'))})('pg');`)
    + `\nconst fixtures = [];\nfor (const label of ['full','partial','unconfirmed','stale']) fixtures.push(await fixture('flutter-'+label, agent.user.id));\n`
    + `await (await import('node:fs/promises')).writeFile(${JSON.stringify(fixturePath)}, JSON.stringify({api, database: process.env.ACCEPTANCE_DATABASE_NAME, deliveries: fixtures.map(f=>f.deliveryId), ...stock}));\nawait db.end();\n`;
  writeFileSync(join(temp, 'fixture.mjs'), setup);
  await run(process.execPath, [join(temp, 'fixture.mjs')]);
  await run('flutter', ['test', '--no-pub', '--reporter', 'expanded', '--dart-define=RUN_API134_LIVE=true',
    `--dart-define=API134_FIXTURE=${fixturePath}`, 'test/api134_live_test.dart'], mobile);
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const verify = new Client({ connectionString: environment.DATABASE_URL });
  await verify.connect();
  try {
    const results = (await verify.query(`SELECT delivery_id, status, collected_amount FROM delivery_collections WHERE delivery_id = ANY($1::uuid[])`, [fixtures.deliveries])).rows;
    if (results.length !== 3 || new Set(results.map(r => r.delivery_id)).size !== 3) throw new Error('Collection replay posted twice');
    for (const [i, status, amount] of [[0,'confirmed_full','105000'],[1,'confirmed_short','95000'],[2,'unconfirmed',null]]) {
      const row = results.find(r => r.delivery_id === fixtures.deliveries[i]);
      if (row?.status !== status || (amount === null ? row.collected_amount !== null : Number(row.collected_amount) !== Number(amount))) throw new Error('Collection outcome mismatch');
    }
    console.log('Flutter live test passed; DB confirms 3 collections, full/partial/unconfirmed, no duplicate collection.');
  } finally { await verify.end(); }
  succeeded = true;
} finally {
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill('SIGTERM');
    await new Promise(resolve => { apiProcess.once('exit', resolve); setTimeout(() => { apiProcess.kill('SIGKILL'); resolve(); }, 5000).unref(); });
  }
  try {
    if (created) { await db.query(`DROP DATABASE "${name}" WITH (FORCE)`); console.log(`Dropped ${name}`); }
  } finally {
    if (db) await db.end().catch(() => {});
    for (const container of containers.reverse()) {
      try { docker('rm', '-f', '-v', container); } catch { console.error(`Could not remove ${container}`); }
    }
  }
  closeSync(log);
  console.log('Stopped and removed all verification containers.');
  if (succeeded) rmSync(temp, { recursive: true }); else console.log(`Failure diagnostics: ${temp}/services.log`);
}

// Runs a pinned, unmodified Web Admin distribution without switching branches.
// Optional workstation-only admin permission sync; no business data/seeds/migrations.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLocalDevelopmentApi } from './debug_environment.mjs';
import { syncLocalAdminPermissions } from './local_admin_access.mjs';

// Reviewed main revision with governorates, delivery zones and API 16.2 types.
const revision = 'fd6a3bc8ddcb612dd6f672538aaaf992f3ab4f6b';
const repository = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(homedir(), '.config/shubayr/web-admin');
const distribution = join(cache, revision);
const admin = join(distribution, 'admin');
const origin = 'http://localhost:3200';

async function run(command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(signal ? `Web Admin command stopped (${signal}).` : `Web Admin command exited with code ${code}.`));
      });
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}

try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 22 || minor < 12) throw new Error('Web Admin requires Node.js 22.12 or newer within Node 22.');
  await checkLocalDevelopmentApi();
  await syncLocalAdminPermissions();

  // Repeated F5 should reuse this distribution, not kill an unrelated listener.
  let listeners = '';
  try {
    listeners = execFileSync('lsof', ['-t', '-iTCP:3200', '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
  } catch (error) {
    if (error.status !== 1) throw new Error('Cannot inspect port 3200; lsof is required.');
  }
  if (listeners) {
    const pids = [...new Set(listeners.split(/\s+/))];
    const owned = pids.every((pid) => execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).split('\n').includes(`n${admin}`));
    if (!owned) throw new Error('Port 3200 is used by another application. Stop it explicitly before starting Web Admin.');
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('The existing Web Admin is not ready yet. Retry shortly.');
    console.log(`Web Admin already running: ${origin} (source ${revision.slice(0, 7)}).`);
  } else {
    await mkdir(cache, { recursive: true });
    if (!existsSync(join(distribution, 'SOURCE.json'))) {
      if (existsSync(distribution)) throw new Error(`Incomplete Web Admin distribution at ${distribution}; inspect it before retrying.`);
      const archive = execFileSync('git', ['archive', '--format=tar', revision, 'admin', 'api/openapi.yaml', 'web/src/app/tokens.css', 'web/src/fonts', 'web/src/lib/forwarding.ts'], { cwd: repository, maxBuffer: 32 * 1024 * 1024 });
      const staging = await mkdtemp(join(cache, '.prepare-'));
      execFileSync('tar', ['-xf', '-', '-C', staging], { input: archive });
      await writeFile(join(staging, 'SOURCE.json'), JSON.stringify({ revision, apiContract: '16.2.0', source: 'Shubayr origin/main' }, null, 2) + '\n');
      await rename(staging, distribution);
    }
    const source = JSON.parse(await readFile(join(distribution, 'SOURCE.json'), 'utf8'));
    if (source.revision !== revision) throw new Error('Web Admin distribution revision does not match the pinned source.');
    const env = {
      ...process.env,
      NODE_ENV: 'development',
      API_URL: 'http://localhost:8000/api/v1',
      ADMIN_ORIGIN: origin,
      ADMIN_COOKIE_SECURE: 'true',
      ADMIN_MODULES: '',
      NEXT_TELEMETRY_DISABLED: '1',
    };
    const installed = join(admin, 'node_modules/.shubayr-install-complete');
    if (!existsSync(installed)) {
      await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: admin, env });
      await writeFile(installed, revision + '\n');
    }
    console.log(`Web Admin: ${origin}; source ${revision.slice(0, 7)}; local Docker API/database only.`);
    console.log('Stop this terminal/debug session to stop the server. No database setup runs here.');
    await run(process.execPath, [join(admin, 'node_modules/next/dist/bin/next'), 'dev', '--port', '3200', '--hostname', 'localhost'], { cwd: admin, env });
  }
} catch (error) {
  console.error(`Web Admin launch blocked: ${error.cmd || error.stdout || error.stderr ? 'A local preparation command failed; inspect the command output and retry.' : error.message}`);
  process.exitCode = 1;
}

// Runs freshly fetched main in an isolated cache without switching branches.
// No permission sync, database writes, seeds or migrations run on launch.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLocalDevelopmentApi } from './debug_environment.mjs';
import { fetchMainSource } from './web_admin_source.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const cache = join(homedir(), '.config/shubayr/web-store');
const origin = 'http://localhost:3000';

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
        else reject(new Error(signal ? `Web Store command stopped (${signal}).` : `Web Store command exited with code ${code}.`));
      });
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}

try {
  if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: run_web_store.mjs [--check]');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 22 || minor < 12) throw new Error('Web Store requires Node.js 22.12 or newer within Node 22.');
  await checkLocalDevelopmentApi();
  const source = fetchMainSource(repository);
  const { revision, apiContract } = source;
  const distribution = join(cache, revision);
  const web = join(distribution, 'web');
  if (process.argv.includes('--check')) {
    console.log(`Web Store prerequisites passed; source ${revision.slice(0, 7)}, API contract ${apiContract}. No server or Docker services were started.`);
    process.exit(0);
  }

  // Repeated launches reuse this distribution without killing another listener.
  let listeners = '';
  try {
    listeners = execFileSync('lsof', ['-t', '-iTCP:3000', '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
  } catch (error) {
    if (error.status !== 1) throw new Error('Cannot inspect port 3000; lsof is required.');
  }
  if (listeners) {
    const pids = [...new Set(listeners.split(/\s+/))];
    const owned = pids.every((pid) => execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).split('\n').includes(`n${web}`));
    if (!owned) throw new Error('Port 3000 is used by another application or an older Store revision. Stop that local server explicitly before starting the latest Web Store.');
    const response = await fetch(`${origin}/categories`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('The existing Web Store is not ready yet. Retry shortly.');
    console.log(`Web Store already running: ${origin} (source ${revision.slice(0, 7)}).`);
  } else {
    await mkdir(cache, { recursive: true });
    if (!existsSync(join(distribution, 'SOURCE.json'))) {
      if (existsSync(distribution)) throw new Error(`Incomplete Web Store distribution at ${distribution}; inspect it before retrying.`);
      const archive = execFileSync('git', ['archive', '--format=tar', revision, 'web', 'api/openapi.yaml'], { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
      const staging = await mkdtemp(join(cache, '.prepare-'));
      execFileSync('tar', ['-xf', '-', '-C', staging], { input: archive });
      await writeFile(join(staging, 'SOURCE.json'), JSON.stringify(source, null, 2) + '\n');
      await rename(staging, distribution);
    }
    const cached = JSON.parse(await readFile(join(distribution, 'SOURCE.json'), 'utf8'));
    if (cached.revision !== revision || cached.apiContract !== apiContract) throw new Error('Web Store distribution metadata does not match the fetched source.');
    const env = {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_PUBLIC_API_URL: 'http://localhost:8000/api/v1',
      NEXT_PUBLIC_SITE_URL: origin,
      NEXT_PUBLIC_USE_MOCKS: 'false',
      NEXT_PUBLIC_LIVE_DOMAINS: 'all',
      PORT: '3000',
      NEXT_TELEMETRY_DISABLED: '1',
    };
    const installed = join(web, 'node_modules/.shubayr-install-complete');
    if (!existsSync(installed)) {
      await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: web, env });
      await writeFile(installed, revision + '\n');
    }
    console.log(`Web Store: ${origin}; source ${revision.slice(0, 7)}; local Docker API/database only.`);
    console.log('Stop this terminal/debug session to stop the server. No database setup runs here.');
    await run(process.execPath, [join(web, 'node_modules/next/dist/bin/next'), 'dev', '--port', '3000', '--hostname', 'localhost'], { cwd: web, env });
  }
} catch (error) {
  console.error(`Web Store launch blocked: ${error.cmd || error.stdout || error.stderr ? 'A local preparation command failed; inspect the command output and retry.' : error.message}`);
  process.exitCode = 1;
}

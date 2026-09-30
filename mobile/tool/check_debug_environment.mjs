// Read-only preflight for the VS Code remote launch profiles.
// Never starts Docker, installs dependencies, migrates data or stops processes.
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';

const target = process.argv[2];
const api = 'http://localhost:8000/api/v1/health';

async function requireFreePort(port) {
  for (const host of ['127.0.0.1', '::1']) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', (error) => {
        if (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT') {
          resolve();
        } else if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use. Stop the existing debug session/server, then retry. No process was stopped automatically.`));
        } else {
          reject(error);
        }
      });
      server.listen({ port, host, exclusive: true }, () => server.close(resolve));
    });
  }
}

try {
  if (!['ios', 'chrome', 'admin'].includes(target)) {
    throw new Error('Usage: node check_debug_environment.mjs ios|chrome|admin');
  }
  if (target === 'admin') {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 12)) {
      throw new Error('Web Admin requires Node.js 22.12 or newer.');
    }
    try {
      await access(new URL('../../admin/node_modules/next/dist/bin/next', import.meta.url));
    } catch {
      throw new Error('Web Admin dependencies are missing. Prepare them once with npm ci inside admin, then retry.');
    }
    await requireFreePort(3200);
  }
  if (target === 'chrome') await requireFreePort(7357);

  let response;
  try {
    response = await fetch(api, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`Cannot reach ${api}. Start the existing local backend, then retry.`);
  }
  if (!response.ok) throw new Error(`API health returned HTTP ${response.status}. Check the backend before launching.`);
  console.log(`Remote preflight passed (${target}). API: http://localhost:8000/api/v1`);
  console.log('This checks connectivity, not database migrations or account readiness.');
} catch (error) {
  console.error(`\nRemote launch blocked: ${error.message}\n`);
  process.exitCode = 1;
}

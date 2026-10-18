import { networkInterfaces } from 'node:os';
import { execFileSync } from 'node:child_process';

export const targets = {
  'iphone-simulator': { platform: 'ios', host: 'localhost' },
  'ipad-simulator': { platform: 'ios', host: 'localhost' },
  'android-emulator': { platform: 'android', host: '10.0.2.2' },
  'iphone-device': { platform: 'ios' },
  'android-device': { platform: 'android' },
};

export function resolveDebugApi(target, interfaces = networkInterfaces()) {
  const profile = targets[target];
  if (!profile) throw new Error(`Unknown Mobile target: ${target}`);
  if (profile.host) return `http://${profile.host}:8000/api/v1`;
  const allowed = new Set(['192.168.3.50', '192.168.4.50']);
  const addresses = [...new Set(Object.values(interfaces).flat().filter(
    (entry) => entry && !entry.internal && entry.family === 'IPv4' && allowed.has(entry.address),
  ).map((entry) => entry.address))];
  if (addresses.length !== 1) {
    throw new Error('Connect the Mac to home (192.168.3.50) or work (192.168.4.50). Exactly one must be active.');
  }
  return `http://${addresses[0]}:8000/api/v1`;
}

// Check the API's actual runtime destination, not merely an unrelated healthy port.
export function validateLocalStack(api, db) {
  const env = Object.fromEntries(api.Config.Env.map((entry) => {
    const split = entry.indexOf('=');
    return [entry.slice(0, split), entry.slice(split + 1)];
  }));
  const database = new URL(env.DATABASE_URL);
  const networks = Object.keys(api.NetworkSettings.Networks);
  if (!api.State.Running || !db.State.Running ||
      env.NODE_ENV !== 'development' || env.APP_ENV !== 'development' ||
      database.protocol !== 'postgresql:' || database.hostname !== 'db' ||
      database.port !== '5432' || database.pathname !== '/shubayr' ||
      !networks.some((name) => db.NetworkSettings.Networks[name]?.Aliases?.includes('db'))) {
    throw new Error('Mobile debug requires the local development API and shubayr_db / shubayr database. No fallback is allowed.');
  }
}

export async function checkLocalDevelopmentApi(apiUrl = 'http://localhost:8000/api/v1') {
  const ids = execFileSync('docker', ['ps', '--filter', 'publish=8000', '--format', '{{.ID}}'], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
  if (ids.length !== 1) throw new Error('Exactly one local Docker API must publish port 8000.');
  const [api, db] = JSON.parse(execFileSync('docker', ['inspect', ids[0], 'shubayr_db'], { encoding: 'utf8' }));
  validateLocalStack(api, db);
  const checkUrl = apiUrl.replace('10.0.2.2', 'localhost');
  let response;
  try {
    response = await fetch(`${checkUrl}/health`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`Cannot reach ${checkUrl}/health. Start the existing development API and publish port 8000 on 0.0.0.0 for both networks.`);
  }
  if (!response.ok) throw new Error(`Local API health returned HTTP ${response.status}.`);
  return { apiId: api.Id, dbId: db.Id };
}

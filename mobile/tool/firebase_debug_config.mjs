import { readFile } from 'node:fs/promises';

// Client-only build inputs. Reject extra keys so an external file cannot inject
// server credentials or override the shared API/authentication configuration.
const keys = ['FIREBASE_API_KEY', 'FIREBASE_APP_ID',
  'FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_PROJECT_ID'];

export function validateFirebaseDebugConfig(config, platform) {
  if (!['ios', 'android'].includes(platform)) {
    throw new Error('Unsupported Firebase client platform.');
  }
  if (!config || Array.isArray(config) || typeof config !== 'object' ||
      Object.keys(config).some((key) => !keys.includes(key)) ||
      keys.some((key) => typeof config[key] !== 'string' || !config[key].trim())) {
    throw new Error('Firebase file must contain only the four non-empty FIREBASE client defines documented in mobile/README.md.');
  }
  const app = /^1:(\d+):(ios|android):[a-f\d]+$/i.exec(config.FIREBASE_APP_ID);
  if (!app || app[2] !== platform || app[1] !== config.FIREBASE_MESSAGING_SENDER_ID) {
    throw new Error('Firebase App ID must match the device platform and messaging sender ID.');
  }
}

export async function checkFirebaseDebugConfig(path, platform) {
  let config;
  try {
    config = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // Parser errors can contain file contents. Never print configuration values.
    throw new Error('Firebase client file is missing, unreadable or invalid JSON. Follow mobile/README.md for the external device configuration.');
  }
  validateFirebaseDebugConfig(config, platform);
}

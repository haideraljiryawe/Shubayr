import { AsyncLocalStorage } from 'node:async_hooks';

const clientIp = new AsyncLocalStorage<string>();

export function runWithClientIp<T>(
  ip: string | undefined,
  callback: () => T,
): T {
  return clientIp.run(ip ?? '', callback);
}

export function currentClientIp(): string | undefined {
  return clientIp.getStore() || undefined;
}

import proxyaddr from 'proxy-addr';

export type ProxyTrust = (address: string, hop: number) => boolean;

export function parseTrustedProxies(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function compileTrustedProxies(value?: string): ProxyTrust {
  const proxies = parseTrustedProxies(value);
  if (proxies.length === 0) return () => false;
  const trust = proxyaddr.compile(proxies);
  return (address: string, hop: number) => trust(address, hop);
}

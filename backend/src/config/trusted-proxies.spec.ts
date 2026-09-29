import proxyaddr from 'proxy-addr';
import { compileTrustedProxies, parseTrustedProxies } from './trusted-proxies';

function request(peer: string, forwardedFor?: string) {
  return {
    socket: { remoteAddress: peer },
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  };
}

describe('trusted proxy client IP resolution', () => {
  it('reads right to left and skips every trusted hop', () => {
    const trust = compileTrustedProxies('10.0.0.0/8, 192.168.1.10');
    const ip = proxyaddr(
      request('10.0.0.2', '198.51.100.7, 192.168.1.10') as never,
      trust,
    );
    expect(ip).toBe('198.51.100.7');
  });

  it('ignores forwarded addresses when the direct peer is untrusted', () => {
    const trust = compileTrustedProxies('10.0.0.0/8');
    const ip = proxyaddr(
      request('203.0.113.4', '198.51.100.99') as never,
      trust,
    );
    expect(ip).toBe('203.0.113.4');
  });

  it('parses a comma-separated setting', () => {
    expect(parseTrustedProxies(' 10.0.0.1,192.168.0.0/16, ')).toEqual([
      '10.0.0.1',
      '192.168.0.0/16',
    ]);
  });
});

import { BlockList, isIP } from "node:net";

/* ---------------------------------------------------------------------------
 * The shopper's address, for the store's server-side API calls.
 *
 * The API rate-limits and audits per client address. Every page the store
 * renders reaches the API from the store server, so without this every
 * shopper would share the store server's single address (and its budget).
 *
 * The address is taken ONLY from the store's own trusted front proxies
 * (TRUSTED_FRONT_PROXIES): the X-Forwarded-For chain is read from the right
 * — each proxy appends the address it was reached from — skipping entries
 * that are trusted proxies; the first address that is not one is the
 * shopper. Anything to its left is what the client claimed and is ignored,
 * so a spoofed header never reaches the API. With no trusted proxies
 * configured nothing is forwarded at all.
 *
 * The store must be reachable only through those proxies (see
 * docs/deploy/web-and-admin.md): Next.js does not expose the connecting
 * socket to the app once a request carries X-Forwarded-For.
 * ------------------------------------------------------------------------- */

const KEYWORDS: Record<string, Array<[string, number, "ipv4" | "ipv6"]>> = {
  loopback: [
    ["127.0.0.0", 8, "ipv4"],
    ["::1", 128, "ipv6"],
  ],
  private: [
    ["10.0.0.0", 8, "ipv4"],
    ["172.16.0.0", 12, "ipv4"],
    ["192.168.0.0", 16, "ipv4"],
    ["fc00::", 7, "ipv6"],
  ],
  linklocal: [
    ["169.254.0.0", 16, "ipv4"],
    ["fe80::", 10, "ipv6"],
  ],
};

/** "::ffff:203.0.113.7" → "203.0.113.7"; brackets and an IPv4 port dropped. */
export function normalizeAddress(raw: string): string | null {
  let value = raw.trim();
  if (value.startsWith("[") && value.includes("]")) value = value.slice(1, value.indexOf("]"));
  // An IPv4 address with a port ("203.0.113.7:51234").
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(":"));
  if (value.toLowerCase().startsWith("::ffff:") && isIP(value.slice(7)) === 4) value = value.slice(7);
  return isIP(value) ? value : null;
}

/**
 * TRUSTED_FRONT_PROXIES as a predicate: comma-separated addresses, CIDRs and
 * the keywords `loopback`, `private` and `linklocal`. Null when it lists
 * nothing — then no address is ever believed or forwarded.
 */
export function compileTrust(value: string | undefined): ((address: string) => boolean) | null {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return null;
  const list = new BlockList();
  for (const entry of entries) {
    const keyword = KEYWORDS[entry];
    if (keyword) {
      for (const [network, prefix, family] of keyword) list.addSubnet(network, prefix, family);
      continue;
    }
    const [address, prefix] = entry.split("/");
    const family = isIP(address);
    if (!family) throw new Error(`TRUSTED_FRONT_PROXIES: "${entry}" is not an address, CIDR or keyword.`);
    const type = family === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
  }
  return (address) => {
    const family = isIP(address);
    return family !== 0 && list.check(address, family === 4 ? "ipv4" : "ipv6");
  };
}

/**
 * The shopper's address from the X-Forwarded-For chain the store received,
 * or null when it can't be told: nothing trusted, an empty or malformed
 * chain, or nothing but trusted proxies in it.
 */
export function shopperAddress(
  forwardedFor: string | null | undefined,
  trusted: ((address: string) => boolean) | null,
): string | null {
  if (!trusted || !forwardedFor) return null;
  const chain = forwardedFor.split(",");
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const address = normalizeAddress(chain[index]);
    // A malformed hop can't be judged: believe nothing past it.
    if (!address) return null;
    if (!trusted(address)) return address;
  }
  return null;
}

/** The headers the store sends the API: the shopper's address, and nothing a client sent. */
export function forwardedHeaders(address: string | null): Record<string, string> {
  return address ? { "X-Forwarded-For": address, "X-Real-IP": address } : {};
}

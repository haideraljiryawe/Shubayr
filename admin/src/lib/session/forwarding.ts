import {
  compileTrust,
  forwardedHeaders,
  shopperAddress,
} from "../../../../web/src/lib/forwarding";

/* ---------------------------------------------------------------------------
 * The staff member's address, for every call this server makes to the API.
 *
 * The same rule as the web store, from the same tested helper
 * (web/src/lib/forwarding.ts): the address is taken only from this server's
 * trusted front proxies (TRUSTED_FRONT_PROXIES), reading X-Forwarded-For
 * from the right past trusted hops; the API is sent that one address in
 * X-Forwarded-For and X-Real-IP, replacing whatever the client sent. With no
 * trusted proxies configured nothing is forwarded, so the API sees this
 * server's own address — never an address a client made up to dodge the
 * per-address login limit.
 * ------------------------------------------------------------------------- */

const trust = compileTrust(process.env.TRUSTED_FRONT_PROXIES);

/** Anything with a header lookup: a Request's headers, or next/headers. */
interface HeaderSource {
  get(name: string): string | null;
}

/** The forwarded-address headers for an API call made on this request's behalf. */
export function clientForwardHeaders(incoming: HeaderSource): Record<string, string> {
  return forwardedHeaders(shopperAddress(incoming.get("x-forwarded-for"), trust));
}

/** Throws when TRUSTED_FRONT_PROXIES can't be read (checked at start-up). */
export function checkTrustedFrontProxies(value: string | undefined): void {
  compileTrust(value);
}

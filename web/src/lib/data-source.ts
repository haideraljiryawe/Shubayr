/* ---------------------------------------------------------------------------
 * Live-vs-mock, decided per domain.
 *
 * The backend lands one slice at a time, so "are we on the real API yet" is not
 * one answer — it is one answer per domain. Each client method asks about its
 * own domain, which lets a slice flip the moment its endpoints exist without
 * touching the ones still waiting.
 *
 * Set NEXT_PUBLIC_LIVE_DOMAINS to override the defaults below:
 *
 *   NEXT_PUBLIC_LIVE_DOMAINS=auth,profile,catalog,banners   explicit list
 *   NEXT_PUBLIC_LIVE_DOMAINS=all                            everything live
 *   NEXT_PUBLIC_LIVE_DOMAINS=none                           everything mocked
 *
 * NEXT_PUBLIC_USE_MOCKS=true is a global override that forces every domain to
 * mock regardless — that is what the Playwright suite runs under, so the tests
 * stay hermetic and never need a backend.
 * ------------------------------------------------------------------------- */

export const DOMAINS = [
  "auth",
  "profile",
  "catalog",
  "banners",
  "cart",
  "checkout",
  "orders",
  "addresses",
  "wishlist",
  "returns",
  "reviews",
  "loyalty",
  "notifications",
  "monitor",
  "deliveries",
  "inbox",
] as const;

export type Domain = (typeof DOMAINS)[number];

/**
 * The domains the backend actually serves today. Everything else stays on
 * fixtures until its own backend slice lands.
 */
const LIVE_BY_DEFAULT: readonly Domain[] = [
  "auth",
  "profile",
  "catalog",
  "banners",
  // Slice 2: the server-authoritative cart, COD checkout and the orders it
  // produces — plus addresses, which checkout needs to name a destination.
  "cart",
  "checkout",
  "orders",
  "addresses",
  // Slice 3: the account extras. Every one of these was verified against
  // api/openapi.yaml v5.4.0 before being listed here — `reviews` covers
  // WRITING reviews and rating a delivery (reading them has always been part
  // of `catalog`), and `notifications` is the account-level preference pair,
  // not push delivery, which needs device tokens the web app does not mint.
  "returns",
  "loyalty",
  "reviews",
  "notifications",
  // Slice 4: the wishlist. The backend module landed in #55 (contract
  // v5.5.0), so GET/POST /wishlist and DELETE /wishlist/{productId} are served
  // — probed against the running API, not just read off openapi.yaml, which
  // documented these routes long before the server implemented them.
  "wishlist",
  // Build phase 2 (API 6.1, #58): the order monitor's read-only list and
  // detail, the delivery agent's assigned deliveries, and the durable
  // notification inbox with its SSE stream — probed against a running API
  // built from main before being listed.
  "monitor",
  "deliveries",
  "inbox",
];

function isDomain(value: string): value is Domain {
  return (DOMAINS as readonly string[]).includes(value);
}

function resolveLiveDomains(): ReadonlySet<Domain> {
  // The global escape hatch wins: one variable still turns the whole app back
  // onto fixtures, which is how the test suite and a backend-less demo run.
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") return new Set();

  const raw = process.env.NEXT_PUBLIC_LIVE_DOMAINS?.trim();
  if (!raw) return new Set(LIVE_BY_DEFAULT);

  const normalized = raw.toLowerCase();
  if (normalized === "all") return new Set(DOMAINS);
  if (normalized === "none") return new Set();

  // An unknown name is dropped rather than throwing: a typo in a deploy
  // variable should degrade one domain to mock, not fail every page.
  return new Set(
    normalized
      .split(",")
      .map((entry) => entry.trim())
      .filter(isDomain),
  );
}

const liveDomains = resolveLiveDomains();

/** True when this domain should call the real API. */
export function isLive(domain: Domain): boolean {
  return liveDomains.has(domain);
}

/** The live domains, for the debug banner and the README table. */
export function liveDomainList(): Domain[] {
  return DOMAINS.filter((domain) => liveDomains.has(domain));
}

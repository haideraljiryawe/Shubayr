#!/usr/bin/env node
/**
 * Page views against a running store, from many simulated shoppers.
 *
 *   STORE_URL=http://localhost:3100 API_URL=http://localhost:8000/api/v1 \
 *   RATE=300 DURATION=120 SHOPPERS=60 node scripts/load-test.mjs
 *
 * Every view is a server-rendered page (home, categories, brands, a category,
 * a product, a search) sent with its own shopper address in X-Forwarded-For,
 * as the store's front proxy would add it. Run the store with
 * TRUSTED_FRONT_PROXIES covering this machine (e.g. `loopback`) so it
 * forwards them, and the API with TRUSTED_PROXIES covering the store.
 *
 * It prints how many views answered 200, the latency, and any failures.
 * Refused API calls show up in the API's own log (HTTP 429); a page whose
 * reads were refused still renders its "temporarily unavailable" state, so
 * check the API log too.
 */

const STORE = (process.env.STORE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const API = (process.env.API_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");
const RATE = Number(process.env.RATE ?? 300); // views per minute
const DURATION = Number(process.env.DURATION ?? 120); // seconds
const SHOPPERS = Number(process.env.SHOPPERS ?? 60);

// Documentation ranges (RFC 5737): never a real shopper.
const addresses = Array.from({ length: SHOPPERS }, (_, index) =>
  index < 254 ? `203.0.113.${index + 1}` : `198.51.100.${(index % 254) + 1}`,
);

async function catalogPaths() {
  const paths = ["/", "/categories", "/brands", "/search?q=a", "/en"];
  try {
    const products = await (await fetch(`${API}/products?per_page=20`)).json();
    for (const product of products.data ?? []) paths.push(`/product/${product.id}`);
    const categories = await (await fetch(`${API}/categories`)).json();
    for (const category of categories.slice?.(0, 6) ?? []) paths.push(`/category/${category.slug}`);
  } catch {
    // The pages above still make a fair mix.
  }
  return paths;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const paths = await catalogPaths();
const total = Math.round((RATE * DURATION) / 60);
const gap = 60_000 / RATE;
const results = [];
const pending = [];
console.log(`${total} views over ${DURATION}s (${RATE}/min) across ${paths.length} pages from ${SHOPPERS} shoppers → ${STORE}`);

const started = Date.now();
for (let index = 0; index < total; index += 1) {
  const due = started + index * gap;
  const wait = due - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const path = paths[index % paths.length];
  const address = addresses[index % addresses.length];
  const begun = Date.now();
  pending.push(
    fetch(`${STORE}${path}`, { headers: { "X-Forwarded-For": address } })
      .then(async (response) => {
        await response.arrayBuffer();
        results.push({ path, status: response.status, ms: Date.now() - begun });
      })
      .catch((error) => results.push({ path, status: 0, ms: Date.now() - begun, error: String(error) })),
  );
}
await Promise.all(pending);

const ok = results.filter((row) => row.status === 200);
const failed = results.filter((row) => row.status !== 200);
const latency = ok.map((row) => row.ms);
const elapsed = (Date.now() - started) / 1000;
console.log(
  JSON.stringify(
    {
      views: results.length,
      ok: ok.length,
      failed: failed.length,
      seconds: Math.round(elapsed),
      rate_per_min: Math.round((results.length / elapsed) * 60),
      latency_ms: { p50: percentile(latency, 50), p95: percentile(latency, 95), max: Math.max(0, ...latency) },
      failures: failed.slice(0, 10),
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);

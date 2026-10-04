# Deploying the web store and the Web Admin

This guide is for whoever runs Shubayr in production. It covers the two
Next.js apps:

- **Web store** (`web/`): the public shop. Browsers call the API directly.
- **Web Admin** (`admin/`): the staff tool. Browsers talk only to the admin's
  own server (a "BFF"), which calls the API.

The API (`backend/`) is deployed separately.

## How settings are read

The two apps read their settings at different times.

| App | When settings are read | What that means |
|---|---|---|
| Web store | **At build time.** Values starting with `NEXT_PUBLIC_` are baked into the JavaScript the browser downloads. | Changing them needs a new image (`docker build`). |
| Web Admin | **When the server starts.** Nothing is baked in. | Change the environment and restart the container. |

Neither app falls back to `localhost` in production:

- the web store's production build stops with an error if
  `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_SITE_URL` is missing or malformed;
- the admin server refuses to start without `API_URL` and `ADMIN_ORIGIN`.

## Web store variables

All of these are build arguments (`docker build --build-arg NAME=value`).

| Variable | Required | Example | What it does |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://api.example.com/api/v1` | The API base URL, including `/api/v1`. Its origin is allowed in the Content-Security-Policy (`connect-src`, `img-src`) and for optimized images. |
| `NEXT_PUBLIC_SITE_URL` | **Yes** | `https://shop.example.com` | The store's public address, without a trailing slash. Used for canonical URLs, Open Graph, `sitemap.xml` and `robots.txt`. When it starts with `https://`, the CSP also upgrades insecure requests. |
| `NEXT_PUBLIC_LIVE_DOMAINS` | No (image default `all`) | `all` | Which parts of the store use the real API. Production must be `all`. |
| `NEXT_PUBLIC_USE_MOCKS` | No (image default `false`) | `false` | Forces sample data everywhere. **Never `true` in production.** It exists for tests. |
| `NEXT_PUBLIC_DELIVERY_FEE` | No (default `5`) | `5000` | Flat delivery fee shown in the cart, until the API's settings carry it. |
| `IMAGES_ALLOW_LOCAL_IP` | No | `true` | **Tests only.** Lets a local production build optimize images from an API on `localhost`. Leave unset in production; it protects against SSRF. |

Runtime variables (set with `docker run -e`):

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | The port the server listens on. |
| `HOSTNAME` | `0.0.0.0` | The interface the server listens on. |
| `TRUSTED_FRONT_PROXIES` | *(empty)* | The store's own front proxies: comma-separated addresses, CIDRs, or the keywords `loopback`, `private` and `linklocal`. The store takes the shopper's address from them and passes it to the API (see [The production chain](#the-production-chain)). **Empty means no address is forwarded**, and every shopper shares the store server's rate-limit budget. A malformed entry makes pages fail with an error naming it, rather than silently trusting nothing. |
| `STORE_CACHE_SHARED_SECONDS` | `60` | How long the store server keeps the store settings, categories and brands before reading them again. `0` turns it off. |
| `STORE_CACHE_CATALOG_SECONDS` | `10` | The same for banners, product lists and a product page's data (product, availability, review count). `0` turns it off. |

## Web Admin variables

All of these are read when the server starts (`docker run -e NAME=value`).

| Variable | Required | Example | What it does |
|---|---|---|---|
| `API_URL` | **Yes** | `https://api.internal:8000/api/v1` | Where the admin's server reaches the API. It can be a private address; browsers never see it. |
| `ADMIN_ORIGIN` | **Yes** | `https://admin.example.com` | The admin's public origin, exactly as browsers see it. Every state-changing request must carry this `Origin`; it is the CSRF check, on top of `SameSite=Strict` cookies. When it starts with `https://`, the CSP also upgrades insecure requests. |
| `ADMIN_COOKIE_SECURE` | No (default `true`) | `true` | Session cookies are `httpOnly`, `SameSite=Strict` and `Secure`. `false` exists only for plain-HTTP development hosts. **Never `false` in production.** |
| `PORT` | No (default `3200`) | `3200` | The port the server listens on. |
| `HOSTNAME` | No (default `0.0.0.0`) | `0.0.0.0` | The interface the server listens on. |

## Settings needed on the API

Two API settings depend on these apps:

- **`TRUSTED_PROXIES` must include the admin server's address.** Every staff
  request reaches the API through the admin's server, which passes the
  browser's address on in `X-Forwarded-For`. The API only believes that header
  from addresses listed in `TRUSTED_PROXIES` (comma-separated IPs or CIDRs).
  - **If it is listed:** rate limits and audit logs apply per staff member.
  - **If it is not listed:** every staff member shares one rate-limit bucket
    and one audit address, the admin server's own.

  List your load balancer or reverse proxy there too.
- **`TRUSTED_PROXIES` must also include the web store server's address.**
  The store renders pages on its server, and those renders call the API on the
  shopper's behalf with the shopper's address in `X-Forwarded-For`. If the
  store server isn't listed, every page any shopper opens counts against the
  store server's single rate-limit budget, and a busy store is throttled by its
  own API.
- **`CORS_ORIGINS` must include the web store's origin** (`NEXT_PUBLIC_SITE_URL`),
  because shoppers' browsers call the API directly. The admin needs no CORS
  entry.

## Building the images

Both images use multi-stage builds. The final stage holds only the
self-contained Next.js server (`output: "standalone"`), runs as the
unprivileged `node` user, and has a `HEALTHCHECK` on `/api/health`.

```sh
# Web store: build context is web/
docker build -t shubayr-web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com \
  web
docker run -p 3000:3000 shubayr-web

# Web Admin: build context is the repository root (it uses web's design tokens)
docker build -f admin/Dockerfile --target production -t shubayr-admin .
docker run -p 3200:3200 \
  -e API_URL=https://api.internal:8000/api/v1 \
  -e ADMIN_ORIGIN=https://admin.example.com \
  shubayr-admin
```

CI builds both images and checks their health on every pull request (the
`Production images` job).

## The production chain

A shopper's request reaches the API by two routes:

```
browser ──(1)──▶ CDN / front proxy ──(2)──▶ web store server ──(3)──▶ API
browser ─────────────────────(4)──────────────────────────────────▶ API
```

1. **Browser → front proxy.** TLS ends here. The proxy is the only thing on
   the internet that can reach the store server.
2. **Front proxy → store server.** The proxy **appends** the address it was
   reached from to `X-Forwarded-For`. With a CDN in front of your proxy, the
   chain grows: `client-claimed…, shopper, CDN edge`.
3. **Store server → API** (pages rendered on the server). The store reads
   the chain from the right, skipping every address in
   `TRUSTED_FRONT_PROXIES`; the first address that is not a trusted proxy is
   the shopper. It sends the API **only that address**, in `X-Forwarded-For`
   and `X-Real-IP`, replacing whatever it received. Anything to the left,
   which is what the client claimed, is never passed on. The API believes it
   because the store server is in the API's `TRUSTED_PROXIES`.
4. **Browser → API** (cart, checkout, account, delivery agent and monitor
   pages, which use the session the browser holds). The API sees the shopper
   directly, or through its own proxy listed in `TRUSTED_PROXIES`.

What each part must be set to:

| Part | Setting |
|---|---|
| Front proxy / CDN | Append the client address (`X-Forwarded-For`), never drop it. |
| Network | **The store server must be reachable only through the front proxy.** Once a request carries `X-Forwarded-For`, the store can't see who connected to it, so it trusts the chain's last hop to be its proxy. |
| Store server | `TRUSTED_FRONT_PROXIES` = the front proxy's address (and the CDN's ranges if there is one). |
| API | `TRUSTED_PROXIES` = the store server's and the admin server's addresses (and the API's own proxy, if any). |

Example: nginx in front of the store, on the same private network:

```nginx
location / {
  proxy_pass http://web-store:3000;
  # Appends $remote_addr to whatever chain arrived.
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Host $host;
}
```

with `TRUSTED_FRONT_PROXIES=10.0.1.5` (nginx's address as the store sees it)
on the store, and `TRUSTED_PROXIES=10.0.1.10,10.0.1.20` (the store's and the
admin's servers) on the API. Behind a CDN, add the CDN's published ranges to
`TRUSTED_FRONT_PROXIES`.

### What the store server caches

Only public catalogue reads, and only on the store server:

| Read | For |
|---|---|
| Store settings, categories, brands | `STORE_CACHE_SHARED_SECONDS` (60 s) |
| Banners, product lists (home, category, search, sitemap), a product page's product, availability and review count | `STORE_CACHE_CATALOG_SECONDS` (10 s) |

A change in the Web Admin therefore shows on the store within those times
(prices are still checked at checkout, which reads the cart live). The cache
is keyed by the read and its query, never by who asked; whichever shopper's
render misses fills it, and that read carries that shopper's address.

Nothing personal is cached: the store server never reads a shopper's data.
Cart, checkout, account, wishlist, notifications, delivery agent and monitor
pages read it in the browser, with the session the browser holds, and every
page is sent `Cache-Control: no-store` (each also carries its own CSP nonce).

## Behind a reverse proxy

- **Terminate TLS in front of both apps.** Both apps send
  `Strict-Transport-Security`, so serve them only over HTTPS once they are live.
- **Forward the client address** in `X-Forwarded-For` (see
  [The production chain](#the-production-chain)).
- **Don't strip the security headers** the apps set: Content-Security-Policy
  with a per-request nonce, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `X-Frame-Options` and `Cross-Origin-Opener-Policy`.
  The admin also sends `X-Robots-Tag: noindex`.
- **Don't cache HTML pages** at the proxy. Each page carries its own CSP nonce.
  Files under `/_next/static/` are content-hashed and safe to cache forever.
- **Health checks:** `GET /api/health` answers `200 {"status":"ok"}` when the
  server is up. It deliberately does not call the API, so the store keeps
  serving its pages, and their "temporarily unavailable" states, when the API
  is down.

## What each app serves for search engines

**Web store:**
- `/robots.txt` allows the catalog and disallows account, cart, checkout,
  sign-in and staff pages.
- `/sitemap.xml` lists home, the directories, visible categories and brands,
  and active products. Arabic is the canonical URL; English is listed as the
  alternate.
- Product pages carry schema.org `Product` data with an IQD `Offer` and
  availability.

**Web Admin:**
- Every response carries `X-Robots-Tag: noindex, nofollow`.
- Pages carry `<meta name="robots" content="noindex, nofollow">`.
- `/robots.txt` disallows everything.

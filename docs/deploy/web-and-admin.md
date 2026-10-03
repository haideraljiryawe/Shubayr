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

## Behind a reverse proxy

- **Terminate TLS in front of both apps.** Both apps send
  `Strict-Transport-Security`, so serve them only over HTTPS once they are live.
- **Forward the client address** in `X-Forwarded-For` (see `TRUSTED_PROXIES`).
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

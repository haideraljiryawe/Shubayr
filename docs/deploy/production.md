# Running Shubayr in production

This is the step-by-step for putting Shubayr on one of our servers with the
production kit: `docker-compose.prod.yml`, `.env.production.example`,
`deploy/` (proxy, backups, scripts) and the release workflow. It is written
for whoever runs the server; every command is run from the repository
checkout on that server.

Related guides: [the web store and the Web Admin](web-and-admin.md) (every
store/admin setting and the proxy chain in depth) and
[push notifications](push-notifications.md) (the Firebase key).

## What runs

```
                internet ── 80, 443 (only these) ──▶ Caddy (TLS, HTTP→HTTPS)
                                                       │
            ┌──────────────────────┬───────────────────┼────────────────────────┐
            ▼                      ▼                   ▼                        │
   <domain>: web (store)   admin.<domain>: admin   api.<domain>: api ◀─ worker  │  "edge" network
            │                      │  (BFF → api)      │                        │  (EDGE_SUBNET)
            └── calls https://api.<domain> via Caddy   │                        │
                                                       ▼                        ▼
                      "data" network (internal: no ports, no route out)
                PostgreSQL 16 · Redis 7 · Meilisearch 1.9 · SeaweedFS (pictures)
                                                       ▲
                                     backup (daily pg_dump + picture mirror) ──▶ off-server target
```

| Service | Image | Notes |
|---|---|---|
| `caddy` | `caddy:2.8.4-alpine` | The only published ports. Let's Encrypt certificates, HTTPS redirect, HSTS, `X-Robots-Tag: noindex` on admin and API. `deploy/caddy/Caddyfile` |
| `api` | `shubayr-api` | NestJS HTTP API, non-root, with `PROCESS_ROLE=api`. It enqueues jobs but never processes them. |
| `worker` | `shubayr-api` (same build) | BullMQ processors and schedulers with `PROCESS_ROLE=worker`; it opens no HTTP port. Scale with `--scale worker=2`. |
| `migrate` | `shubayr-api-migrate` | One-off: `prisma migrate deploy`. Run by the scripts only. |
| `admin` | `shubayr-admin` | Web Admin (BFF), non-root. |
| `web` | `shubayr-web` | The store, non-root. Built for one domain (its URLs are baked in). |
| `db` `redis` `search` `storage` | official images | Internal network only, persistent volumes, password-protected. |
| `backup` | `shubayr-backup` | `deploy/backup`: daily dump + picture mirror, 14-day retention, restore. |

Every service restarts automatically (`unless-stopped`), has a health check,
and keeps at most 5 × 10 MB of logs (`docker compose logs`). Mailpit and
Adminer are development tools and are not in this file.

### API and worker roles

The same backend image has three process roles. `api` starts the HTTP server
and queue producers but no BullMQ processors. `worker` starts an application
context with processors and schedulers but no HTTP listener. `all` does both
and is the default when `PROCESS_ROLE` is unset, preserving the local and CI
workflow. Production Compose pins the first two roles explicitly.

The worker inventory is:

| Queue | Work |
|---|---|
| `notifications` | transactional-outbox scan, notification fan-out/provider delivery, notification-stream publish |
| `catalog-imports` | workbook validation, resumable commit batches, interrupted-import recovery |
| `catalog-search` | individual product indexing and the pending-product catch-up scan |
| `order-maintenance` | pending-order acceptance and automatic-cancellation timeout scan |

Each scheduled scan uses one stable BullMQ scheduler id. Every worker upserts
that same id at startup, so scaling does not create duplicate schedules.
Individual jobs also remain safe if BullMQ redelivers them: notification
delivery/outbox records are claimed idempotently, import rows are keyed by
import plus row number and opening stock has one operation id, order timeouts
lock and recheck the order, and search writes are upserts.

`api` and `worker` receive the same PostgreSQL, Redis, object-storage,
Meilisearch, SMS and FCM settings. This is required because queued work may
touch any of those services. `WORKER_HEALTH_FILE` controls the jobs-only
readiness file; Compose checks it and the worker process instead of probing an
HTTP port.

Scale only the worker service, for example `dc up -d --scale worker=2`.
During a normal stop, Nest closes BullMQ workers gracefully and waits for the
active job; Compose allows two minutes. If the process is killed after that
grace period, BullMQ returns the stalled job to the queue and the idempotency
rules above prevent a second business effect.

## 1. Requirements

| | Minimum | Recommended at launch |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 100 GB SSD (database, pictures, two weeks of local dumps) |
| OS | Ubuntu 24.04 LTS or Debian 12, 64-bit | same |
| Docker | Docker Engine 27+ with the Compose plugin 2.24+ | same |
| Other | `git`, `openssl`, a fixed public IPv4 (IPv6 optional) | |

Use **Docker Engine on Linux**, not Docker Desktop: the proxy chain relies on
Docker keeping visitors' real addresses on published ports (the default with
iptables). A second location for backups — an S3 bucket at another provider
or another server reachable by SFTP — is required (step 4).

## 2. DNS records

Create these before the first start (Caddy asks Let's Encrypt for the
certificates as soon as it starts, and Let's Encrypt checks them). Use the
server's public address; TTL 300 during launch.

| Name | Type | Value | Serves |
|---|---|---|---|
| `shop.example.com` (= `SHUBAYR_DOMAIN`) | A | server IPv4 | the store |
| `www.shop.example.com` | A | server IPv4 | a permanent (301) redirect to `https://shop.example.com`, same path and query |
| `admin.shop.example.com` | A | server IPv4 | the Web Admin |
| `api.shop.example.com` | A | server IPv4 | the API (apps, store, pictures) |
| the same four | AAAA | server IPv6 | only if the server has IPv6 |
| `shop.example.com` | CAA (optional) | `0 issue "letsencrypt.org"` | restricts who may issue certificates |

Check with `dig +short admin.shop.example.com` from your own machine before
continuing. The `www.` record is needed because the Caddyfile serves
`www.{$SHUBAYR_DOMAIN}` (it gets its own certificate) and redirects it
permanently to `https://{$SHUBAYR_DOMAIN}{uri}`, so the store has one address.
Without the record, Caddy logs a failed certificate request for `www.` and the
other three names still work.

## 3. Prepare the server

```bash
# Docker Engine + Compose plugin (https://docs.docker.com/engine/install/ubuntu/)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out and back in

# Firewall: SSH (restrict it to your addresses if you can), HTTP, HTTPS (+HTTP/3)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable

# The kit, at the release you are deploying
git clone https://github.com/haideraljiryawe/Shubayr.git /srv/shubayr
cd /srv/shubayr
git checkout v1.0.0
```

The checkout can live in any directory owned by the account that runs the
scripts (which must be in the `docker` group); this guide uses `/srv/shubayr`.
The scripts work from wherever they are, and Docker Compose names the stack
after the directory, so keep the same path for every later deploy.

Docker's published ports bypass `ufw`; that is fine here because only Caddy
publishes any (80 and 443). PostgreSQL, Redis, Meilisearch and the object
storage have no published ports at all.

## 4. Configure

```bash
deploy/scripts/generate-env.sh shop.example.com ops@example.com
```

This writes `.env.production` (mode 600, git-ignored) from
`.env.production.example`, with fresh random secrets for the database, Redis,
Meilisearch, object storage, both JWT keys and the store preview token. Then
edit it and fill in:

- `SHUBAYR_TAG` — the release to run (e.g. `v1.0.0`);
- `SMS_GATEWAY_URL`, `SMS_GATEWAY_TOKEN` — the SMS provider for customer
  sign-in codes (the API POSTs `{"phone","code"}` with a Bearer token). Until
  one is chosen, leave `SMS_GATEWAY_URL=disabled` and the token empty. Disabled
  mode makes no outbound request and returns `SMS_NOT_CONFIGURED` (503);
- read every comment once: `.env.production.example` documents each variable.

An OTP is persisted only after the gateway confirms delivery. A disabled,
timed-out, unreachable, or non-2xx gateway creates no OTP record, consumes no
OTP verification attempt, and leaves any previously delivered unexpired code
unchanged. The HTTP endpoint remains abuse-throttled even when delivery fails.
Gateway tokens and OTP values are never written to application logs.

**The off-server backup target.** Create `deploy/secrets/rclone.conf`
(git-ignored, `chmod 600`) with a remote named `offsite`, and point
`BACKUP_TARGET` at a path on it. An S3-compatible bucket at another provider:

```ini
[offsite]
type = s3
provider = Other            # or AWS, Wasabi, Backblaze (B2 S3 API), Cloudflare, …
endpoint = https://s3.example-provider.com
region = us-east-1
access_key_id = …
secret_access_key = …
```

with `BACKUP_TARGET=offsite:shubayr-backups` (the bucket).

`BACKUP_RCLONE_CONF` may also be an **absolute path outside the checkout**,
which keeps the backup credentials away from the deploy account entirely:

```bash
# as root, once
install -d -m 711 -o root -g root /etc/shubayr
install -m 600 -o root -g root rclone.conf /etc/shubayr/rclone.conf
# in .env.production
BACKUP_RCLONE_CONF=/etc/shubayr/rclone.conf
```

The scripts only check that the file exists (`test -f`, which the `711`
directory allows) and never read it; the `backup` container runs as root and
reads it through a read-only bind mount. `deploy/scripts/test-restore.sh` uses
the same file.

For Cloudflare R2, use its S3 endpoint and keep the credentials in the
git-ignored rclone file:

```ini
[offsite]
type = s3
provider = Cloudflare
endpoint = https://<account_id>.r2.cloudflarestorage.com
region = auto
acl = private
no_check_bucket = true
access_key_id = …
secret_access_key = …
```

Set `BACKUP_TARGET=offsite:<bucket-name>`. `no_check_bucket = true` is needed
for bucket-scoped tokens that can read and write objects but cannot list all
account buckets. Keep `acl = private`; backups must never be public.

R2/S3 lifecycle expiration rules may cover only `db/` and `media/deleted/`
(using retention periods appropriate for the store). Never apply an expiry
rule to `media/current/`: that prefix is the live restorable picture mirror.

Alternatively, use another server over SFTP:

```ini
[offsite]
type = sftp
host = backup.example.com
user = shubayr
key_file = /config/rclone/id_ed25519   # mount it next to rclone.conf, or use key_pem
```

with `BACKUP_TARGET=offsite:/srv/backups/shubayr`. Any
[rclone backend](https://rclone.org/overview/) works. Give that account
write access to its own bucket or folder only.

**Push notifications** stay `NOTIFICATION_PROVIDER=disabled` until the
Firebase key holder sets `NOTIFICATION_PROVIDER=fcm`, `FCM_PROJECT_ID` and
`FCM_SERVICE_ACCOUNT_JSON_BASE64` **directly in `.env.production` on the
server** — never in git, chat or e-mail — and restarts `api worker`
([push-notifications.md](push-notifications.md)).

## 5. First run (bootstrap)

```bash
deploy/scripts/bootstrap.sh
```

It refuses to run while any `CHANGE_ME` placeholder, empty secret, short JWT
key or missing backup target is left. Then it:

1. pulls the images for `SHUBAYR_TAG` (or builds them with `--build`);
2. starts PostgreSQL, Redis, Meilisearch and the object storage and waits for them;
3. runs `prisma migrate deploy`;
4. loads **reference data only** (`dist/src/cli/bootstrap-reference.js`): it
   checks that the migrations created the 19 governorates, the chart of
   accounts and the currencies (IQD as base), and brings the app roles, the
   permission list and the built-in permission presets in line with the code.
   **No demo products, users, orders or delivery zones are created**;
5. starts the API, worker, admin, store, Caddy and the backup job, and waits
   until each is healthy.

Then create the owner's Web Admin account:

```bash
deploy/scripts/create-owner.sh --username owner --name "Store owner" --email owner@example.com
```

It prints a one-time password **once** (or uses `OWNER_PASSWORD` if you set
it in the shell). The account has every permission (`super_admin`) and must
change the password at the first sign-in at `https://admin.<domain>`. An
existing username is refused. The owner then follows the
[owner guide](../owner-guide/en.md): delivery zones, a warehouse and its
locations, categories, products, opening stock.

## 6. Releasing and updating

**Publish a release.** In GitHub, set the repository variable
`SHUBAYR_DOMAIN` once (Settings → Secrets and variables → Actions →
Variables), then tag a commit of `main` that passed CI:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

`.github/workflows/release.yml` builds and pushes
`ghcr.io/haideraljiryawe/shubayr-{api,api-migrate,admin,web,backup}:v1.0.1`.
The store image is built for `SHUBAYR_DOMAIN`. If the packages are private,
run `docker login ghcr.io` on the server once with a token that has
`read:packages`.

**Deploy it.**

```bash
cd /srv/shubayr && git fetch --tags && git checkout v1.0.1   # the scripts and compose file of that release
deploy/scripts/deploy.sh v1.0.1
```

`deploy.sh` keeps the data safe:

1. pulls the new images (nothing changes yet; a failed pull stops here);
2. takes a **pre-deploy backup** (database + pictures) to the off-server target;
3. records the running tag as the rollback target and sets `SHUBAYR_TAG`;
4. runs the migrations (forward only) and the reference-data step;
5. restarts the API and waits until it is healthy, then the worker, admin,
   store and backup job, then Caddy.

Volumes are never removed or recreated. Requests are briefly interrupted
while the single API container restarts (a few seconds); nothing written is
lost. `deploy.sh <tag> --build` builds the images on the server instead of
pulling them.

## 7. Rollback

```bash
deploy/scripts/rollback.sh            # to the tag before the last deploy
deploy/scripts/rollback.sh v1.0.0     # or a given tag
```

Migrations only go forward. `rollback.sh` compares the migrations recorded in
the database with the ones the older release knows:

- **No newer migrations** (most releases): it switches the images back and
  restarts. No data is touched.
- **The database has migrations the older release doesn't know:** it
  refuses, because the old code may misread the new schema. Prefer a fixed
  release (fix forward). If you must go back, run
  `deploy/scripts/rollback.sh v1.0.0 --restore-db`: it restores the
  pre-deploy backup taken by `deploy.sh`, so **every order, stock movement
  and other change made since that deploy is lost** (pictures uploaded since
  are kept). Tell the owner before doing this.

## 8. Backups and restore

The `backup` service runs every day at `BACKUP_SCHEDULE` (default 03:30
Baghdad time):

1. `pg_dump` of the whole database (custom format), checked readable, with a
   sha256 file;
2. copies the dump to `BACKUP_TARGET/db/`;
3. mirrors the picture bucket to `BACKUP_TARGET/media/current/`; pictures
   deleted or replaced since the last run are kept in
   `BACKUP_TARGET/media/deleted/<date>/`;
4. deletes dumps and deleted-picture sets older than `BACKUP_RETENTION_DAYS`
   (14), both locally and on the target.

After every successful run it measures the complete `BACKUP_TARGET` (`db/`
plus `media/`), writes the exact byte count to `/backups/target-bytes`, and
logs it. When the size exceeds `BACKUP_TARGET_WARN_GB` (8 decimal GB by
default), the run logs a clear `WARNING:` line but still succeeds and does not
change the health rule. Increase storage or adjust retention after reviewing
the target; do not silence the warning without checking growth.

For independent monitoring, set `BACKUP_HEARTBEAT_URL` to the secret HTTPS
ping URL from Healthchecks.io, Better Stack or a similar service. A ping is
sent only after the database dump, media sync, retention and target-size
record all succeed. Set the monitor to expect one ping per day with a two-hour
grace period. Heartbeat timeouts and provider failures are logged only as
`backup heartbeat sent` or `backup heartbeat failed`; they never fail an
otherwise valid backup and the secret URL is never logged. Providers with a
failure endpoint can set `BACKUP_HEARTBEAT_FAIL_SUFFIX=/fail` (the
Healthchecks.io convention); without a suffix, a failed backup does not send a
potentially misleading success ping.

Its health check turns unhealthy when the last successful backup is older
than 26 hours: `docker compose -f docker-compose.prod.yml --env-file
.env.production ps backup` (watch it, or wire it to your monitoring).

```bash
deploy/scripts/backup-now.sh before-price-update    # a backup now, with a label
deploy/scripts/backup-now.sh --list                 # the dumps on the target
deploy/scripts/restore.sh latest                    # or a dump name from --list
```

Both `backup-now.sh --list` and the backup container's `list` entrypoint print
the target's current total byte size after the dump listing.

`restore.sh` asks you to type `RESTORE`, stops the API, worker, admin and
store, replaces the database from the dump (after checking its sha256), makes
the picture bucket match the backup (`--skip-media` keeps the current
pictures), applies any newer migrations of the running release, and starts
everything again.

**Prove it works** — after the first day, then monthly:

```bash
deploy/scripts/test-restore.sh
```

It takes a fresh backup of the running stack, starts a second, empty stack
beside it (`shubayr-restoretest`: own volumes and network, no published
ports), restores the backup into it **from the off-server target**, starts its
API, and compares the row counts of the main tables, the picture bucket's file
count and size, and the bytes of a product picture served by each API. It
prints `RESTORE TEST PASSED` and removes the test stack (`--keep` leaves it
for inspection), or fails with both snapshots.

## 9. Security baseline

- **Only 80 and 443 are public.** Caddy is the only service with published
  ports; HTTP redirects to HTTPS; HSTS is two years. PostgreSQL, Redis,
  Meilisearch and SeaweedFS are on an internal Docker network with no
  published ports and no route out, and each requires its own password/key.
- **Rate limits are always on** in the API (`RATE_LIMIT_*`), per visitor:
  Caddy and the API believe forwarded addresses only from the private edge
  network, so a browser cannot pick its own rate-limit bucket.
- **Admin is not indexed or framed:** `X-Robots-Tag: noindex, nofollow` and
  `X-Frame-Options: DENY` from Caddy, plus the admin's own headers.
- **Secure cookies:** the admin's session cookies are `httpOnly`,
  `SameSite=Strict` and `Secure` (`ADMIN_COOKIE_SECURE` is fixed to `true`).
- **Session rotation:** keep `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` and
  `ADMIN_REFRESH_ROTATION_GRACE_SECONDS` consistent on every API instance.
  Deploy restarts do not end sessions while both JWT secrets stay unchanged;
  see the [session policy](../security/session-policy.md).
- **No secrets in git:** `.env.production` and `deploy/secrets/` are
  git-ignored; images contain no secrets; the Firebase key is set on the
  server only.
- The application containers run as an unprivileged user; the API runs with
  `APP_ENV=production` (real SMS codes, no development OTP, no dev push
  provider).
- Keep the host patched (`unattended-upgrades`) and SSH key-only.

## 10. Day-to-day

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'
dc ps                         # state and health of everything
dc logs -f --tail 100 api     # follow a service's logs
dc up -d --scale worker=2     # more background-job capacity
dc restart web                # after changing STORE_PUBLIC / STORE_PREVIEW_TOKEN
dc up -d api worker           # after changing an API setting in .env.production
```

Disk: `docker system df`; old images can go with `docker image prune` after a
successful deploy. The database and pictures live in the volumes
`<project>_db_data` and `<project>_storage_data` — never `docker compose down -v`
on a server.

## 11. Go-live checklist

Before opening day, check each item on the running server.

**Domains and TLS**
- [ ] The four DNS records (`<domain>`, `www`, `admin`, `api`) resolve to the server (`dig +short`).
- [ ] `https://www.<domain>/any/path?x=1` answers `301` with `Location: https://<domain>/any/path?x=1`.
- [ ] `https://<domain>`, `https://admin.<domain>`, `https://api.<domain>/api/v1/health` open with a valid certificate; `http://` redirects to `https://`.
- [ ] `CADDY_TLS` is empty (real certificates), `ACME_EMAIL` is a monitored mailbox.

**Secrets and access**
- [ ] `.env.production` is mode 600 and has no `CHANGE_ME`; every secret was generated for this server.
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are different and 32+ characters.
- [ ] Only 80/443 (and SSH) answer from outside: `nmap -Pn <server>` from another machine.
- [ ] The owner signed in, changed the one-time password, and created staff accounts with only the presets they need.

**Proxy chain**
- [ ] `EDGE_SUBNET` does not collide with another network on the server; `TRUSTED_PROXIES` (API) and `TRUSTED_FRONT_PROXIES` (store and admin) are unset (they default to `EDGE_SUBNET`) or equal to it — never a public range.
- [ ] `dc logs caddy` shows visitors' real public addresses (not `172.…`), and the admin's audit log records them.

**Launch settings**
- [ ] `STORE_PUBLIC=false` until opening: `https://<domain>` shows the "opening soon" page, `robots.txt` disallows everything.
- [ ] The owner filled in **Settings → Store info** in the Web Admin (legal name, address, contacts, hours, return and refund days, policy date) and the owner approved the policy drafts ([../launch/legal-pages.md](../launch/legal-pages.md)); `https://<domain>/privacy`, `/terms`, `/support` and `/account/delete` open even while closed ([../launch/store-urls.md](../launch/store-urls.md)).
- [ ] `STORE_PREVIEW_TOKEN` was generated with `openssl rand -hex 24`; `https://<domain>/preview?t=<token>` shows the real store to the owner.
- [ ] `ADMIN_MODULES=catalog,stock,orders,settings,users,purchasing,finance,deliveryParties,cashReceipts,returns,expenses,reports,audit` — the launch menu:
  restocking through purchasing, the store's own delivery parties and their cash
  receipts, returns, expenses and the audit log. External-driver `trips` and
  `custody` exceptions stay off until they are needed.
- [ ] Opening day: set `STORE_PUBLIC=true` (or remove it), `dc up -d web`, and check the home page and `robots.txt`.

**Customer sign-in and notifications**
- [ ] SMS is deliberately configured: either `SMS_GATEWAY_URL=disabled` while
  no provider is available, or the URL/token are the provider's production
  values and a real phone receives a sign-in code. Provider requests abort
  after `SMS_GATEWAY_TIMEOUT_MS` (10 seconds by default). A failed delivery
  returns `OTP_DELIVERY_UNAVAILABLE` (503).
- [ ] `NOTIFICATION_PROVIDER`: `disabled` until the Firebase key is installed; then `fcm` with `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON_BASE64` set on the server by the key holder; `npm run push:diagnose` passes ([push-notifications.md](push-notifications.md)).

**Store setup (owner)**
- [ ] Delivery zones cover the governorates served, with fees; automatic discounts as decided.
- [ ] A warehouse with its locations; opening stock posted for the launch catalog.
- [ ] Products are visible in the preview with pictures, prices and stock.

**Backups**
- [ ] The rclone file named by `BACKUP_RCLONE_CONF` (`deploy/secrets/rclone.conf`, or an absolute path such as `/etc/shubayr/rclone.conf`) points at a location on another provider/server; `BACKUP_TARGET` is set.
- [ ] `deploy/scripts/backup-now.sh go-live` succeeded and `--list` shows the dump on the target.
- [ ] `deploy/scripts/test-restore.sh` printed `RESTORE TEST PASSED`.
- [ ] Someone watches the `backup` health status (unhealthy after 26 hours without a backup).

**Release**
- [ ] The running `SHUBAYR_TAG` is a release tag built by the release workflow from a green `main`; the previous tag is noted for rollback.

## Testing the kit on a workstation

`deploy/docker-compose.local-test.yml` runs this same stack on a developer
machine at `https://shubayr.localhost` (Caddy's own certificate authority,
a local folder as the off-server target). Its header lists the differences.
CI runs exactly this on every pull request (the `Production stack` job):

```bash
export SHUBAYR_ENV_FILE=/tmp/shubayr-test.env          # a filled-in copy with SHUBAYR_DOMAIN=shubayr.localhost,
export SHUBAYR_COMPOSE_EXTRA=deploy/docker-compose.local-test.yml   # CADDY_TLS="tls internal", OFFSITE_TEST_DIR=…
deploy/scripts/bootstrap.sh --build
OWNER_PASSWORD='Owner-Test-Pass-1!' deploy/scripts/create-owner.sh --username owner --name "Store owner"
(cd admin && npm ci && node ../deploy/test/smoke.cjs "$PWD/node_modules/playwright" shubayr.localhost owner \
   'Owner-Test-Pass-1!' 'Owner-New-Pass-2!' "<STORE_PREVIEW_TOKEN>" /tmp/shots)
deploy/scripts/test-restore.sh
docker compose -f docker-compose.prod.yml -f deploy/docker-compose.local-test.yml --env-file "$SHUBAYR_ENV_FILE" down -v
```

On Docker Desktop, Caddy sees every visitor as the Docker gateway
(`172.30.10.1`); a Linux server with Docker Engine sees real addresses.

## Troubleshooting

| Symptom | Look at |
|---|---|
| Certificates not issued | DNS not pointing here yet, or port 80/443 blocked: `dc logs caddy` |
| `api` unhealthy at start | `dc logs api` — usually an env value the API's validation rejects (it names it) |
| Store pages error, admin fine | `dc logs web` — the store calls `https://api.<domain>` from the server: DNS must resolve from the server too |
| Everyone shares one rate limit | proxy chain: visitors' addresses must reach Caddy (Docker Engine on Linux, no extra NAT) |
| `backup` unhealthy | `dc logs backup` — target credentials or space; run `backup-now.sh` to retry |

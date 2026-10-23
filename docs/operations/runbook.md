# Production operations runbook

This is the short operational checklist. The authoritative configuration,
security details and command explanations remain in
[production deployment](../deploy/production.md). Run commands from the tagged
checkout in `/srv/shubayr`; never paste secrets into a ticket or terminal log.

## Daily check

1. Confirm the deployed `SHUBAYR_TAG` is the intended tagged build and its
   GitHub **Release images** workflow, including **Tagged acceptance evidence**,
   is green.
2. Review service health:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production ps
   ```

3. Confirm the backup service is healthy, the last run logged its target byte
   count, and the external heartbeat arrived. A backup older than 26 hours is
   unhealthy.
4. List off-site dumps and current target size:

   ```bash
   deploy/scripts/backup-now.sh --list
   ```

5. Review `WARNING:` target-size messages, failed jobs, storage capacity and
   TLS expiry/renewal warnings. A size warning does not invalidate a completed
   backup, but it must be investigated.

Record date/time, deployed tag, latest dump, target bytes, heartbeat and the
reviewer's initials in the operations log.

## Before a risky operation or deploy

```bash
deploy/scripts/backup-now.sh before-change
deploy/scripts/backup-now.sh --list
```

Do not continue until the labelled dump and size appear on the off-site
target. Deploy only an immutable tag whose `main` and release workflows are
green:

```bash
deploy/scripts/deploy.sh vX.Y.Z
```

The deploy script takes another pre-deploy backup, records the rollback tag,
runs forward migrations and starts API, worker, Admin, store, backup and proxy
in dependency order.

## Restore verification

Run after initial setup and monthly:

```bash
deploy/scripts/test-restore.sh
```

Success ends with `RESTORE TEST PASSED`. It uses an isolated stack and compares
database row counts plus media count/size/content. Investigate any mismatch;
do not accept a dump merely because `pg_restore` exited successfully.

## Real restore

Choose a dump shown by `--list`, notify the owner that the store will stop, and
run:

```bash
deploy/scripts/restore.sh <dump-name-or-latest>
```

Read the displayed target twice before typing `RESTORE`. The script stops API,
worker, Admin and store, verifies the checksum, replaces the database, restores
media unless `--skip-media` was explicitly chosen, migrates forward and starts
the stack. Afterward verify owner login, a product image, order counts, ledger
balance, service health and the backup heartbeat.

## Rollback

```bash
deploy/scripts/rollback.sh
deploy/scripts/rollback.sh vX.Y.Z
```

Prefer fix-forward. A normal image rollback is allowed only when the older tag
knows every migration already in the database. If the script reports newer
migrations, it refuses. `--restore-db` discards every order, stock movement and
other database change since the chosen pre-deploy backup; use it only after the
owner explicitly accepts that loss and the backup has been verified.

## Unhealthy service response

First preserve evidence and inspect only the affected service:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 <service>
```

| Service | First checks | Safe response |
|---|---|---|
| `api` | Environment validation, PostgreSQL/Redis/S3/search reachability, migration job | Correct configuration/dependency, then restart only API; do not run ad-hoc SQL. |
| `worker` | Same dependencies as API, queue connection, graceful-shutdown/retry log | Restore dependency and restart worker; idempotent jobs retry. Do not run a second `all` role in production. |
| `admin` / `web` | API readiness, public URL/DNS, container log | Restore API/DNS first; roll back the image tag only if schema-compatible. |
| `postgres` | Disk, memory, container log, host storage | Stop writes if integrity is uncertain; escalate and restore only from a verified dump. |
| `redis` | Disk/memory/network and persistence | Restore Redis; durable business state remains in PostgreSQL, queued jobs must be allowed to retry. |
| object storage | Capacity, credentials, network, media endpoint | Restore access before uploads; never replace `media/current` manually. |
| `backup` | Target credentials/space, failed `rclone lsf`, target-size warning | Fix target, run `backup-now.sh recovery`, confirm `--list` and heartbeat. Do not mark healthy manually. |
| `caddy` | DNS, ports 80/443, certificate log | Correct DNS/firewall; never expose app/database container ports as a workaround. |

If customer totals, stock, cash, custody, supplier AP or the ledger disagree,
stop the affected financial workflow, retain logs/document IDs and escalate.
Never “fix” posted rows in SQL: use the application correction/reversal path.

## Incident record

Record: Baghdad start/end time, reporter, deployed tag/commit, affected service,
customer impact, relevant document/operation IDs (no secrets), commands run,
recovery action, data reconciliation, and owner approval when loss or restore
was involved.

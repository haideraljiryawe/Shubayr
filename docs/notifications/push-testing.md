# Backend push testing

This procedure sends only to approved development customer accounts. It uses the
same PostgreSQL outbox, BullMQ worker, eligibility checks, and FCM HTTP v1 sender
as operational notifications. A provider acceptance ID proves that FCM accepted
the request; it does not prove that APNs/Android delivered it to a phone.

Test events are marked `is_test`, excluded from customer inbox history and unread
counts, and recorded in the audit log as `push_test.enqueue`. Output and stored
errors contain device row IDs, message IDs, and sanitized error codes, never full
FCM tokens, service-account JSON, OAuth tokens, or message payloads.

## One-time macOS setup

1. Keep the approved service-account key outside this repository, for example at
   `$HOME/.config/shubayr/fcm-service-account.json`. Do not copy or symlink it
   into the checkout. The principal needs the Firebase Cloud Messaging API Admin
   role (`roles/firebasecloudmessaging.admin`) in project `shubayr-38835`; it
   does not need Owner or Editor.
2. Confirm the FCM HTTP v1 API is enabled. In Firebase, confirm the iOS and
   Android `com.shubayr.app` applications and the existing APNs development and
   production credentials. Do not rotate credentials merely to run this test.
3. Add these values to `backend/.env`. Generate the base64 value in the shell;
   never paste the decoded JSON into logs or documentation.

   ```sh
   NOTIFICATION_PROVIDER=fcm
   FCM_PROJECT_ID=shubayr-38835
   FCM_SERVICE_ACCOUNT_JSON_BASE64=$(base64 -i "$HOME/.config/shubayr/fcm-service-account.json" | tr -d '\n')
   PUSH_TEST_ACCOUNTS=+9647700000006,+9647700000066
   PUSH_TEST_OPERATORS=admin
   PUSH_DEVICE_MAX_AGE_DAYS=45
   ```

   An `.env` file does not evaluate `$()` expressions. Run the command and write
   its output as the value, or export it before starting Compose:

   ```sh
   export FCM_SERVICE_ACCOUNT_JSON_BASE64="$(base64 -i "$HOME/.config/shubayr/fcm-service-account.json" | tr -d '\n')"
   ```

4. Start the local stack from the repository root. The API container is also the
   BullMQ notification worker and receives `backend/.env` through Compose.

   ```sh
   chmod +x run-website.sh
   ./run-website.sh
   ```

5. Authenticate the configured credential without sending a message:

   ```sh
   docker compose exec api npm run push:diagnose
   ```

   Success prints only the configured project ID. Missing/malformed credentials,
   a project mismatch, a rejected key, or an unavailable OAuth service exits
   nonzero with a sanitized code. When `NOTIFICATION_PROVIDER=fcm` is selected,
   startup never falls back to the development logger.

The standard development seed creates `+9647700000066` only when
`APP_ENV=development`. It is never added by a production seed. The existing
`+9647700000006` development customer remains unchanged.

## CLI commands

Run commands inside the API container so they use the exact API/worker database,
Redis, provider, and secret environment. `--operator` must be an active staff
username in `PUSH_TEST_OPERATORS`; `--account` must be an active CUSTOMER in
`PUSH_TEST_ACCOUNTS`.

List eligible devices (session active, refresh unexpired, registration active,
and seen within the configured retirement window):

```sh
docker compose exec api npm run push:test -- --account +9647700000006 --operator admin --list
```

Preview without writing an event:

```sh
docker compose exec api npm run push:test -- --account +9647700000006 --operator admin --platform all --title "Shubayr push test" --body "Preview only" --preview
```

Send to every eligible iPhone registration:

```sh
docker compose exec api npm run push:test -- --account +9647700000006 --operator admin --platform ios --title "iPhone test" --body "Backend to FCM to APNs" --confirm SEND
```

Send to every eligible Android registration:

```sh
docker compose exec api npm run push:test -- --account +9647700000006 --operator admin --platform android --title "Android test" --body "Backend to FCM to Android" --confirm SEND
```

Send to all eligible devices:

```sh
docker compose exec api npm run push:test -- --account +9647700000006 --operator admin --platform all --title "Multi-device test" --body "One normal-pipeline test event" --confirm SEND
```

To select exactly one row, copy its registration UUID from `--list` and add
`--device UUID`. Reuse `--operation-id UUID` when retrying an uncertain CLI
submission; the event key makes the request idempotent. Production refuses all
sends unless the account/operator remain allow-listed and both
`--allow-production` and `--confirm SEND` are present.

Each result includes registration ID, `accepted` plus the FCM message ID, or a
sanitized failure code and attempt count. `FCM_UNREGISTERED` retires only the
same token/owner binding. `FCM_INVALID_ARGUMENT` does not retire a token.
`FCM_RATE_LIMITED`, `FCM_UNAVAILABLE`, and network failures use bounded BullMQ
retries; already-sent device rows are not resent.

## Physical-device checks

For both iOS and Android, record the backend revision, app build, OS version,
registration UUID, CLI operation ID, FCM message ID, foreground/background/
terminated state, observed receipt, and tap result. Never record a full token.

Verify foreground inbox/badge refresh, background and system-terminated display,
safe inbox navigation after tapping, one-device and all-device targeting, logout
of only one device, A-to-B account switching, token rotation, OS permission
changes, and account deletion. Then trigger one approved real order lifecycle
notification. A notification already accepted by FCM cannot be recalled, and a
process crash immediately after acceptance can still create ambiguous delivery;
the server prevents concurrent duplicate attempts but cannot promise exactly-once
phone receipt.


# Mobile contract changes: v15.1.0 to v15.1.1

This is a backward-compatible patch release. No request or success-response
shape changed, and Mobile does not need a code change.

- `POST /auth/logout` now documents its existing rotating-credential boundary as
  one refresh-session family. It also deactivates only push registrations bound
  to that session; other signed-in devices remain active.
- `POST /devices/token` now declares `403` when the authenticated account/session
  is no longer eligible by the time registration obtains its transaction lock.
  The request remains `{token, platform, locale}` and success remains the
  existing `DeviceToken` response.
- Access/refresh tokens carry an internal server-owned session-lineage claim.
  Clients must treat tokens as opaque. Refresh rotation preserves the lineage.
- Pre-v15.1.1 registrations have no provable session binding and are excluded
  from push fan-out until the existing authenticated registration sync runs with
  tokens issued by v15.1.1.

See [`push-backend-p1.md`](push-backend-p1.md) and
[`../notifications/push-testing.md`](../notifications/push-testing.md) for the
eligibility, stale-retirement, CLI, and physical-device details.

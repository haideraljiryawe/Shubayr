# Session policy

This is the production policy for customer/app tokens and staff Web Admin
sessions. Authentication remains enforced by the API on every request; the
Admin BFF only keeps tokens out of browser JavaScript and renews them safely.

## Lifetimes and renewal

- Access tokens live for `JWT_ACCESS_TTL` (15 minutes by default). The Admin
  starts renewal 60 seconds early so ordinary clock skew does not interrupt a
  request at the boundary.
- Refresh tokens live for `JWT_REFRESH_TTL` (30 days by default) and rotate on
  every successful use. The lifetime is a sliding inactivity limit: an active
  session can continue to renew, while a session unused for 30 days ends.
- There is currently no separate absolute session lifetime. Consequently the
  Admin has no absolute-expiry countdown to warn about. If an absolute limit is
  introduced, the Admin must expose and warn about it before enforcement.
- Cookies expire with the JWT inside them. They are `httpOnly`, `Secure`,
  `SameSite=Strict`, and never contain a lifetime longer than the token.

## Concurrent requests and rotation

An Admin navigation can fan out into a page request, prefetches and the session
poll at the same access-token boundary.

1. The BFF performs one refresh per old token in each process and remembers a
   successful result for 60 seconds, so local concurrent requests receive the
   same new pair.
2. Requests can still cross BFF or API processes, especially during a rolling
   deploy. The API therefore permits only Admin-surface replays of a token that
   was just rotated, has a live successor in the same session family, and is
   within `ADMIN_REFRESH_ROTATION_GRACE_SECONDS` (30 seconds by default). Each
   caller receives its own valid successor.
3. App/mobile refresh tokens do not get this grace. An Admin replay outside
   the grace window is treated as token reuse and revokes only that session
   family. Other devices and sessions remain signed in.

The grace is deliberately short and does not make an expired, logged-out,
password-revoked, inactive-user or wrong-surface token valid.

## Expected session endings

- Explicit logout revokes that refresh-token family and its bound push-device
  registrations.
- A staff password change increments the account session version and revokes
  every older session. The password-change request itself receives a new pair,
  so the person changing their password remains signed in; other browsers must
  sign in again. This is intentional.
- Deactivation and security-sensitive access changes revoke affected sessions
  through the same session-version rules.
- An expired or revoked refresh token sends the Admin to
  `/login?expired=1`, which shows the localized “session ended” explanation and
  retains the safe same-site return path.

## Deploys and failures

API/Admin restarts do not invalidate database-backed refresh sessions. Keep
`JWT_SECRET` and `JWT_REFRESH_SECRET` stable across every instance and deploy;
rotating either secret intentionally signs out tokens signed by the old key.

A timeout, DNS error, connection refusal or an API restart during refresh is
not evidence that the token is invalid. The BFF answers `503 API_UNAVAILABLE`
without clearing either cookie. Retrying after the service returns renews the
same session. This distinction prevents transient deploy failures from looking
like an intentional sign-out.

## Verification

- `admin/tests/unit/session.test.ts` proves in-process single-flight renewal
  and distinguishes a refused token from a transient transport failure.
- `admin/tests/unit/security.test.ts` proves an unavailable refresh returns 503
  without setting the signed-out state.
- `backend/test/access-model.acceptance.mjs` sends two simultaneous refreshes
  with one Admin token against the real API and proves both successors work.

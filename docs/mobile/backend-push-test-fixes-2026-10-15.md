# Backend push-test fixes — 15 October 2026

This is a mobile-impact note for the Backend-only integration of PR #141. It
does not change the API contract, request/response models, or Mobile source.

## User-visible behavior

- Visible notifications sent through FCM HTTP v1 now request the default APNs
  sound on iOS. Android payload behavior is unchanged.
- Internal developer test pushes remain hidden from the customer notification
  inbox, unread counter, mark-all-read operation, and notification event stream.
- A test push can target only currently eligible device registrations belonging
  to the explicitly allowlisted test account. Revoked, expired, stale, inactive,
  unbound, wrong-session-version, and other-account registrations are excluded.

## Client action

No client regeneration or Mobile code change is required. Existing notification
permission, foreground/background handling, and tap routing continue to apply.
The physical-device verification record remains on the separate `mobile` branch
at `mobile/docs/session-push-verification-2026-10-14.md`.

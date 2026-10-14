# Mobile impact: backend push hardening P1

OpenAPI remains at **15.1.0**. `POST /devices/token`, `DELETE /devices/token`,
notification preferences, and inbox/read response shapes are unchanged, so no
generated Web/Admin type change or Mobile request-model change is required.

The backend now binds a registration to the authenticated refresh-family ID
carried internally in access tokens. Refresh rotation preserves that ID. Logout
retires only registrations for that family; other device sessions remain active.
Registrations created by access tokens issued before deployment have no safe
family binding and are ineligible until the app obtains a post-deployment token
pair and performs its existing registration sync. The current Mobile lifecycle
already registers after authentication, resume, locale/token rotation, so no new
endpoint or request field is needed.

Registrations become ineligible after `PUSH_DEVICE_MAX_AGE_DAYS` without a fresh
authenticated registration (default 45 days). A new token registered in the same
session/platform retires the prior token. Confirmed FCM `UNREGISTERED` responses
retire the exact current owner/token row; payload `INVALID_ARGUMENT` does not.

Test pushes are internal outbox events, do not appear in `/me/notifications`,
and use generic notification navigation. Physical-device verification remains
required on both platforms as described in
[`docs/notifications/push-testing.md`](../notifications/push-testing.md).

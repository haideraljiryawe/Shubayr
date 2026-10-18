# Release 1 push notifications

**Status: approved product requirements; permission/settings UX is implemented
in Mobile. Backend safeguards and integrated physical-device
and production verification remain outstanding.** See the current
[integration audit, Backend handoff and test plan](backend-push-integration.md).

Reviewed on 13 October 2026 against Mobile commit `29533c2` plus local changes
and freshly fetched `origin/main` commit `67e08a8`, API **15.0.0**. The authoritative
contract retains the device-token operations. Its `docs/mobile/contract-changes-v14.2-to-v15.0.md`
migration note was read directly from that remote revision; it is not yet in
this checkout. Address/checkout migration is separate work. “Source-verified”
means inspected in code, not proven in the production deployment.

## Approved user experience

Operational push is enabled by application policy, **subject to OS permission,
authenticated ownership and Backend delivery eligibility**. There is no separate
Mobile enable/disable preference. This replaces earlier Release 1 proposals for
a custom Switch or per-installation notification preferences.

- After successful customer login, when the main interface is ready, check the
  real OS permission. On iOS and Android 13+, use the official system dialog when
  permission is undetermined and prompting is appropriate. Avoid unnecessary
  explanation screens. Older Android versions retain their platform behavior.
- If already authorized, register automatically. Verified session restoration
  also synchronizes registration; stored auth tokens alone do not authorize it.
- Denial must not block normal app use. Do not automatically prompt again after
  denial, on every login or on every resume. Respect dismissal and platform
  request limits; do not create a prompt loop when returning from Settings.
- On resume, read permission again and synchronize registration as appropriate.
  Never infer permission from a saved boolean, an FCM token or opening Settings.
  Permission does not guarantee delivery: APNs, network, Android channels and OS
  presentation controls still apply. Provisional iOS permission does not prove
  banners or sound are enabled.

The flow is **Account → Notification Settings → Shubayr's OS notification
settings**. Use the existing localized, RTL/LTR-aware Account row and theme, with
a navigation indicator and no Switch. Opening Settings changes nothing itself;
read the actual state on resume. If both destinations fail, show localized
failure feedback without reporting success.

| Platform | Official destination and fallback |
| --- | --- |
| iOS | Availability-gated `UIApplication.openNotificationSettingsURLString`, opened through UIApplication; fall back to `UIApplication.openSettingsURLString`. No private settings URL schemes. |
| Android | `Settings.ACTION_APP_NOTIFICATION_SETTINGS` with `Settings.EXTRA_APP_PACKAGE` where supported; fall back to `Settings.ACTION_APPLICATION_DETAILS_SETTINGS` with `package:<applicationId>`. Handle unavailable activities. |

The **Notifications inbox stays separate**, with unread badge, authenticated
access and saved history available regardless of push permission. Keep its
existing navigation. No new preferences screen, tables, endpoints,
device-management UI or unnecessary persisted notification state is required.

References: [Apple notification settings](https://developer.apple.com/documentation/uikit/uiapplication/opennotificationsettingsurlstring),
[Apple fallback](https://developer.apple.com/documentation/uikit/uiapplication/opensettingsurlstring),
[Android settings intents](https://developer.android.com/reference/android/provider/Settings#ACTION_APP_NOTIFICATION_SETTINGS)
and [Android notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission).

## Operational scope and store policy

Include order confirmations, order status, delivery progress and relevant
transactional/account notifications. This does not assert that every example
already has a Backend event producer. Promotional campaigns, advertising,
marketing offers and promotional discount announcements are **out of scope**.
Do not add marketing preferences or consent management in Release 1.

Future promotional push requires a separate design with explicit consent and
opt-out where required. Apple specifically requires in-app opt-in and opt-out;
OS authorization is not marketing consent. Push must remain optional and avoid
sensitive personal or confidential content. See [Apple Guideline 4.5.4](https://developer.apple.com/app-store/review/guidelines/#push-notifications).
Retain accurate privacy disclosures and store declarations for Firebase/token
processing. Omitting unnecessary permission screens does not waive applicable
[Google Play disclosure requirements](https://support.google.com/googleplay/android-developer/answer/10144311).

The existing `/me/notification-preferences` API is **account-wide** and affects
Backend dispatch. Mobile must not use it as a device toggle or overwrite existing
choices. The contract defaults transactional push on and promotional push off,
but existing overrides can differ. Backend/operations must verify operational
event coverage and exclude promotional sends for Release 1, including accounts
with overrides. No preference-system or contract redesign is approved here.

## Existing Firebase setup and lifecycle

**Source-verified:** [Firebase client](../lib/features/notifications/data/firebase_push_client.dart),
[serialized lifecycle](../lib/features/notifications/domain/push_lifecycle.dart),
[session/resume providers](../lib/features/notifications/presentation/push_providers.dart)
and [device API adapter](../lib/features/notifications/data/device_registration.dart).

- Android/iOS use `firebase_core` and `firebase_messaging`. Supply real per-platform
  client configuration through an external `--dart-define-from-file` file:
  `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID` and
  `FIREBASE_PROJECT_ID`. Match `com.shubayr.app` and the Backend project; Android
  and iOS use different Firebase app IDs. These are not server credentials.
- Initialization uses explicit `FirebaseOptions`; do not fabricate production
  values, `firebase_options.dart`, Google services JSON or plist files. Missing
  configuration leaves push unavailable without blocking independent features.
  Production `API_URL` safeguards and a published, verified `PRIVACY_POLICY_URL`
  remain required.
- Android declares `POST_NOTIFICATIONS`. FCM auto-init starts disabled; token
  acquisition enables it only after permission and verified customer ownership.
  Default-on application policy does not remove these safeguards.
- Apple declares background remote notifications and APNs entitlements: Debug
  uses development, Profile/Release production. Enable Push Notifications on the
  Apple App ID, use matching provisioning profiles, connect the APNs key or
  certificate in Firebase, and retain method swizzling. Auto-init starts APNs
  registration before checking APNs availability; missing APNs stays pending,
  never replaced with a synthetic token.
- APNs credentials, signing keys and service-account JSON belong in secure
  administration/signing environments, never Dart defines, Git or app bundles.
  Backend owns `NOTIFICATION_PROVIDER=fcm`, `FCM_PROJECT_ID` and secret
  `FCM_SERVICE_ACCOUNT_JSON_BASE64`; see [deployment guidance](../../docs/deploy/push-notifications.md).
- Authenticated `POST /devices/token` sends `{token, platform, locale}`;
  `DELETE /devices/token` sends `{token}` in the body, keeping it out of URLs.
  Re-registration refreshes/reactivates the same token record. Rotation unregisters
  the previous token known to the lifecycle before registering the new token.
  Login, verified restoration, resume, locale changes and token refresh share one
  serialized lifecycle and existing session-revision checks.
- Resume re-registers authorized devices because Backend can deactivate invalid
  tokens independently. Synchronization must not override OS denial. Registration
  failures retain redacted diagnostics and can retry on subsequent lifecycle
  events; neither permission nor an attempted request proves delivery.
- Existing cleanup unregisters the known Backend token, disables auto-init and
  deletes the local FCM token. Preserve this behavior unless separately reviewed;
  no initialization or cleanup redesign is required by this policy. `_registered`
  is memory-only: after restart, denied permission can leave an older server
  registration uncleaned. OS denial still blocks presentation; server cleanup
  after restart/offline failure needs verification and team follow-up.

**Current Mobile behavior:** [PushPermissionTile](../lib/features/notifications/presentation/push_permission_tile.dart)
opens app-specific native notification settings, with an app-settings fallback.
The bridge requests initial permission after verified customer authentication,
startup readiness and a foreground frame; the lifecycle checks the OS state and
allows one automatic request attempt per app lifetime. Resume silently rechecks
permission and registration. Denial does not block normal application use.
The domain mapping combines authorized/provisional and denied/permanently-denied;
APNs pending also returns `notDetermined`. Decide whether to prompt from actual
OS permission, not that combined sync result. The existing implementation does
this before APNs/FCM token retrieval or Backend registration.

References: [Firebase Flutter setup/APNs](https://firebase.google.com/docs/cloud-messaging/flutter/get-started)
and [message handling](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages).

## Multi-device behavior and Backend security

An iPhone, Android phone and iPad may each register a different FCM token for the
same customer. Each has independent OS permission. All eligible authenticated
devices should be targeted; registering or signing out one must not disable the
others. Multiple FCM records alone do not prove session independence.

Evidence: Backend [token model](../../backend/prisma/schema.prisma),
[registration/dispatch](../../backend/src/modules/notifications/notifications.service.ts),
[auth](../../backend/src/modules/auth/auth.service.ts) and
[account deletion](../../backend/src/modules/auth/me.service.ts); Mobile
[auth providers](../lib/features/auth/presentation/providers/auth_providers.dart) and
[session credentials](../lib/core/storage/session_credentials.dart).

| Scenario | Source-verified behavior | Remaining requirement / verification |
| --- | --- | --- |
| Multiple devices | Many unique tokens can belong to one user. Dispatch selects their active records, subject to channel preferences. New registration leaves other tokens intact. OTP login issues a separate refresh record. | Test concurrent logins/refresh, independent permissions and Backend delivery to all eligible devices. `DeviceToken` has no installation/session association; session-aware targeting is not established. |
| Single-device logout | Mobile attempts unregister before clearing credentials, then resets FCM. DELETE deactivates only the owned token. Auth logout revokes the supplied refresh token. Network cleanup failure does not prevent local logout. | Offline server removal is not guaranteed. Auth logout alone neither removes FCM registrations nor immediately revokes its access JWT. Verify unaffected devices, retirement after reconnect and restart-before-logout; never report failed remote cleanup as complete. |
| Account A → B | Upsert assigns one current token owner; A cannot DELETE B's token. Mobile serializes transitions and prevents stale requests from acquiring newer credentials. | Preserve ownership/revision guards. Test delayed requests, failed cleanup, rotation and queued sends. Mobile cannot cancel already accepted server work; dispatch must avoid stale recipient ownership. |
| Account deletion | Successful `DELETE /me/account` transaction removes all that user's device/refresh records, deactivates/anonymizes the user and increments session version. Mobile clears local state and resets FCM without DELETE using revoked credentials. | Verify other users are unaffected and deletion blockers preserve the session. Pending dispatch/concurrent registration must not target or recreate eligibility for the deleted account; local cleanup alone is insufficient. |
| Session invalidation | API authentication validates account/session version. Device records lack a session link; dispatch does not recheck current account activity, session validity or token ownership immediately before sending. | **Backend-dependent gap:** revoked sessions must not remain eligible merely because an FCM token exists. Agree enforcement for supported security revocations. Customer logout-all is absent; password invalidation concerns staff auth, not customer OTP. These are not completed Mobile features. No new auth endpoint/architecture is specified here. |

Backend must coordinate registration, revocation/deletion and delivery eligibility,
including queued work and recipient snapshots. Invalid-token deactivation is not
session authorization. Closing these security gaps needs Backend work; the
Settings link cannot solve them. Any separately needed contract change requires
team review. Messages already accepted by FCM/APNs or displayed by the OS cannot
be promised to disappear on logout, account switch or deletion.

## Presentation and account isolation

The [push bridge](../lib/app/push_notification_bridge.dart) refreshes inbox/badge
and shows generic localized foreground feedback. The OS presents background
notification payloads; the background handler initializes Firebase without
navigation or account-state mutation. Background/terminated-app taps wait for
verified customer ownership and startup readiness, then open the authenticated
inbox. Push entry uses `/home/notifications` with Back to Home; normal Home/Account
entry retains `/notifications` and its return behavior.

Backend sends `notification: {title, body}` without recipient/navigation data.
Mobile never interprets arbitrary payload strings as URLs or order routes; API
inbox items retain server-backed, role-checked destinations. Old taps must not
expose A's private content after B signs in. Current routing fetches the current
customer's inbox but cannot identify a message's original recipient. These guards
do not guarantee that queued OS notifications cannot appear after switching.
Verify both paths; keep previews free of sensitive content. Inbox polling/history
remain independent of OS permission, with no SSE added.

## Implementation and release verification

**Existing recorded evidence:** [ROADMAP](../ROADMAP.md) records account-holder
confirmation on 12 October of development-signed iPhone Firebase/APNs/FCM setup,
registration HTTP 201, Firebase Console delivery, sound and taps, plus automated
navigation checks. These are historical results, not tests run in this update.
They do not establish Backend delivery, Android, full lifecycle or distribution
readiness.

On 13 October, the standard iPhone Device profile was also confirmed on a physical
iPhone. Read-only API/database inspection verified registration HTTP 201, logout
deactivation HTTP 204 and a subsequent active iOS registration. See the
[runtime evidence and its limits](backend-push-integration.md#recorded-iphone-runtime-verification).
This confirms registration, not Backend-originated delivery.

- **Mobile:** preserve implemented prompt timing/eligibility and Settings/fallback,
  and focused tests for denial/no repeat, resume changes, launch failure, pending
  APNs and stale owners; preserve lifecycle/navigation coverage in
  `test/features/notifications/` and existing security/cleanup behavior.
- **Backend:** verify fan-out, preference effects and operational-only sends;
  address the security gaps above. Check network failures/retries and duplicate
  delivery: upserts/delivery keys exist but do not guarantee exactly-once receipt.
  Rerun/extend relevant coverage in `backend/test/notifications.acceptance.mjs`
  and `backend/test/mobile-audit-m1.acceptance.mjs`.
- **Physical devices:** test allow/deny/dismiss/revoke/re-enable, no repeated prompts,
  older Android and Android 13+, Settings/fallback/channels, APNs pending/recovery,
  rotation/locale/reactivation, foreground/background/terminated delivery and
  cold-start taps. Cover concurrent devices, refresh/restoration, offline logout
  and reconnect, rapid A→B switching, revocation/deletion with delayed API/worker
  operations, independent inbox/badge and no cross-account content or privileged
  navigation. Check Arabic/English, RTL/LTR and light/dark Settings UI.
- **Release gate:** verify Backend FCM credentials/worker, production API/privacy
  configuration, Android distribution signing and iOS production APNs through
  distribution provisioning/TestFlight. Record build/configuration and results
  without secrets. Unsigned builds, unit tests and Console success alone do not
  establish production delivery.

This optional, operational-only OS-permission design is suitable in principle
for App Store and Google Play submission. It is not approval or production
readiness: integration verification, Backend security gaps, device matrix, privacy/store
disclosures and final release configuration remain gates.

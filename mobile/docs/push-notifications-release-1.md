# Release 1 push integration

Status: integration code prepared; **pending production configuration and real-device verification**.

The app uses `firebase_core` and `firebase_messaging` on Android/iOS. Supply genuine
client configuration through an external, per-platform `--dart-define-from-file`
build file. Required keys are `FIREBASE_API_KEY`, `FIREBASE_APP_ID`,
`FIREBASE_MESSAGING_SENDER_ID`, and `FIREBASE_PROJECT_ID`. The Firebase app must
match `com.shubayr.app`; Android and iOS have different Firebase app IDs. These
are client identifiers, not service-account credentials. No sample production
IDs are committed. Missing values leave push unavailable without blocking
independent app features. The separate production `API_URL` safeguard remains
mandatory; `PRIVACY_POLICY_URL` must also be published and verified before launch.

## Native and external setup

- Register Android and Apple apps in the real Firebase project. Verify sender
  and project identifiers match the deployed backend's FCM configuration.
- Android declares `POST_NOTIFICATIONS`; request permission using the Account
  screen's enable action. FCM automatic initialization starts disabled and is
  enabled only after permission and a verified customer session.
- Apple declares background remote notifications and the APNs entitlement.
  Debug uses the development APNs environment; Profile/Release use production.
  Enable Push Notifications on the Apple App ID and regenerate provisioning
  profiles with that capability. Upload the APNs authentication key/certificate
  to Firebase using its console. Keep Firebase method swizzling enabled.
- APNs credentials, signing keys and backend service-account JSON must never be
  included in Dart defines, source control or the app bundle. The backend owns
  `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON_BASE64` in its secret manager.
- Firebase initializes from the supplied `FirebaseOptions`; this implementation
  does not require a fabricated `firebase_options.dart`, Google services JSON,
  or plist. Confirm the actual options and native app identifiers in device tests.

## Lifecycle and contract

`POST /devices/token` registers `{token, platform, locale}`; `DELETE /devices/token`
sends `{token}` in the body, keeping it out of URLs. Requests carry the session
revision through the existing auth interceptor, so delayed registration/cleanup
cannot acquire a newer account's bearer token. A single serialized lifecycle
handles login/resume, locale changes, token rotation, logout and account switching.
Backend deactivation can occur independently, so resume re-registers the current
token. Android/iOS permissions are requested only by the explicit enable action.
An absent APNs token is pending, not replaced with a synthetic token.

Cleanup runs before local credentials are removed; it unregisters the backend
token and disables FCM automatic initialization/deletes its token. Local sign-out
still completes on network failure. As with any offline device, server-side
unregistration cannot be proven while offline; verify token retirement, rotation
and account reassignment with the real deployment before release.

Foreground messages refresh the inbox/badge and show a generic localized notice
with an inbox action. Background notification payloads are presented by the OS;
the top-level background handler initializes Firebase without touching account
state or navigating. Notification taps, including cold starts, wait for verified
customer ownership and startup readiness, then open the authenticated inbox.
The deployed backend currently sends title/body without navigation data; arbitrary
payload strings are never interpreted as URLs or order routes. Existing inbox
items retain their server-backed, role-checked destinations. No SSE or notification
preferences have been added.

## Required physical-device verification

Use real Android and iOS devices with the configured backend and signed app:
permission allow/deny/revoke; APNs pending then available; registration and locale;
FCM rotation; foreground/background/terminated notification and tap; offline
sign-out then reconnect; rapid account switching; account deletion; rejected token
reactivation; no old-account content or privileged route access. Confirm Android
13+ permission behavior and iOS production APNs with distribution provisioning.
Automated lifecycle tests and an unsigned native build do not verify delivery.

References: [Firebase Flutter setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started)
and [message handling](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages).

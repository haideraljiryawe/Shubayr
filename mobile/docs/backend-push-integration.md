# Release 1 Backend-driven push integration

> **Historical audit (13 October 2026).** For the subsequent Backend fixes,
> physical iPhone/Android results, multi-device/account-deletion verification and
> remaining limits, read [the 14 October handoff](session-push-verification-2026-10-14.md).
> Outstanding-work and runtime statements below describe the older baseline.

Audit date: 13 October 2026. Mobile audit baseline: `mobile`, HEAD `29533c2`, plus
the reviewed notification UX changes published with this document. Authoritative contract fetched from
`origin/main` at `67e08a8933b28bf5a2f3860bccaf58360e57c0c1`: **15.0.0**.
Read `docs/mobile/contract-changes-v14.2-to-v15.0.md` from that revision. Main adds
delivery zones/tier discounts and launch/security work; it was not merged.
The device/inbox contracts remain compatible. Address/checkout v15 migration is
separate work and must be considered before testing order creation against v15.

**Result:** existing architecture is suitable to extend; no Firebase or auth
redesign is needed for Mobile. Standard device profiles are configured and
automatically checked. Backend FCM runtime configuration, sender security fixes,
the internal test CLI and physical end-to-end verification remain outstanding.
The account holder has confirmed successful physical iPhone launch using the
standard profile. Subsequent read-only inspection verified registration HTTP 201
and an active iOS Backend record; details below. Prior Firebase Console delivery
does not establish Backend-originated sending.

## Architecture and evidence

`Verified customer → Mobile POST /devices/token → Backend operational event /
durable inbox + outbox → BullMQ worker → FCM HTTP v1 → APNs / Android → device`.

Firebase transports notifications. Backend chooses recipients and sends. Flutter
owns OS permission, client token lifecycle and authenticated presentation. Inbox
history remains available when OS push is denied. No Mobile Switch, preferences
system, marketing feature, new API or dependency is introduced.

Paths below are relative to this repository. Backend findings were checked
against the fetched revision; local files can lag it. “Verified” denotes source
or automated evidence as specified, never implied physical delivery.

| Audit area | Classification | Evidence / boundary |
| --- | --- | --- |
| Firebase initialization | Implemented; indirect iPhone runtime evidence | `mobile/lib/features/notifications/data/firebase_push_client.dart`: explicit four-key `FirebaseOptions`, Android/iOS only; absent config returns null. Successful iPhone registration follows initialization/APNs/FCM acquisition in this path; Firebase memory state was not directly inspected. Android remains unverified on hardware. |
| iOS native setup | Implemented; external configuration-dependent | `mobile/ios/Runner/{Info.plist,Info-Debug.plist,Runner.entitlements}`, `ios/Runner.xcodeproj/project.pbxproj`: auto-init off, background remote notifications, development/production APNs entitlement selection. Physical development delivery previously reported; distribution provisioning/APNs unverified. |
| Android setup | Implemented; physical verification pending | `mobile/android/app/src/main/AndroidManifest.xml`, `app/build.gradle.kts`: notification permission, auto-init off, `com.shubayr.app`. External Android client config matches downloaded Firebase application's package, project and app ID. |
| Standard launches | Corrected; iPhone physical launch confirmed | Both launch files lacked Firebase in standard iPhone profiles; root Android lacked it and Mobile workspace lacked Android Device. Standard profiles now reuse existing external files and shared API file. Configuration tests pass; Android physical launch remains pending. Special iPhone profile is retained for compatibility, not required for normal development. |
| External client defines | Already configured; local validation passed | `$HOME/Documents/firebase/shubayr-{ios,android}.json`: four non-empty client keys, distinct platform IDs, shared project `shubayr-38835`. No server credentials copied. iOS Console app/bundle association still owner-verified externally. |
| API/runtime sender | API reachable; sender misconfigured | Shared `mobile/.vscode/iphone.json` still points to `http://192.168.3.50:8000/api/v1`; health succeeds from Mac. Running `shubayr_api` environment has development APP_ENV and no NOTIFICATION_PROVIDER, FCM_PROJECT_ID or FCM service-account variable. Source defaults to DevPushProvider, which logs and does not send. Runtime deployed source SHA is not established. |
| Registration/rotation | Already implemented; automated lifecycle coverage | `data/device_registration.dart`, `domain/push_lifecycle.dart`: authenticated register/delete, revision-bound calls, serialized token rotation, repeated sync coalescing. Backend unique token upsert supports multiple records/customer and reassignment. |
| Session ownership | Mobile guards verified automatically; Backend partially implemented | `presentation/push_providers.dart`, auth providers and `core/network/api_client.dart`: only verified CUSTOMER ownership, stale revision rejection. Backend has independent refresh records/rotation, but device registrations have no session/installation binding. |
| Permission/settings | Implemented; automated coverage, native verification pending | `app/push_notification_bridge.dart` schedules after startup/foreground frame. Lifecycle requests only real OS notDetermined, once per app lifetime; denied never auto-prompts. Native settings bridges use public per-app settings with fallback. Resume rechecks and retries sync. |
| Permission detail | Platform-dependent | Firebase authorized/provisional map to authorized; denied/permanently-denied map to denied. Provisional is quiet permission, not proof of banners/sound. Android below 13 has no Android 13 runtime prompt. No separate ephemeral enum in the installed plugin mapping; this is not an App Clip. APNs pending must not be mistaken for undetermined OS permission. |
| Reception/taps/inbox | Implemented; automated navigation coverage | Foreground generic localized snackbar plus inbox/badge refresh. Background OS notification payload; handler never navigates or mutates account state. Opened/initial message routes to current authenticated inbox after readiness. No arbitrary payload route interpretation; no recipient identifier in current push payload. |
| Existing tests | Already implemented and executed | Notification SDK adapter, lifecycle, settings, routing, auth refresh/ownership, account deletion and shell tests; actual results below. No native receipt inferred from mocks. |
| API contracts | Source-verified | v15 `POST/DELETE /devices/token`, `/me/notifications` and read operations; existing `/me/notification-preferences` is account-wide, not a device preference. No wire changes made. |
| Backend delivery | Partially implemented / Backend-dependent | `backend/src/modules/notifications/{notification-provider.ts,notifications.service.ts,notifications.processor.ts,notifications.module.ts}`: service-account OAuth, HTTP v1, outbox, fan-out, invalid token handling. Security/retry gaps below remain. |

## Standard development workflow

1. Open the repository or `mobile/` in VS Code. Keep the existing local Backend
   running and current development OTP workflow unchanged.
2. Provision the two client-only JSON files once as described in
   [README](../README.md#vs-code-simulators-and-physical-devices). Existing local
   files already validate. No Firebase values need entering per launch.
3. Home/work IP selection is automatic through the shared Mobile preflight;
   see the README. Confirm the active Mac `/health` endpoint from the phone
   browser on the same network; Mac preflight alone cannot prove it.
4. Select **iPhone Device** (existing Ahmed iPhone UDID) or **Android Device**
   (existing Samsung serial). Trust/authorize the Mac, enable Developer Mode or
   USB debugging, and update deviceId only if the actual device changes.
5. Press F5. The standard profile validates its exact external Firebase file
   and API reachability, then launches Flutter Debug with breakpoints/hot reload.
   Do not bypass a failed preflight. Invalid/missing config must be corrected,
   not replaced with fake credentials. Stop/relaunch after defines change.
6. Sign in as CUSTOMER using the existing development authentication. A verified
   session and OS permission precede APNs/FCM retrieval and API registration.
   Denial permits normal app use. Settings/resume synchronize permission.
7. After Backend delivers the internal test command below, use its documented
   authorized customer/registration selection. No runnable send command exists
   today; do not substitute direct client-side sending or credentials.

The former duplicate Firebase launch was removed on 2026-10-15. All five Mobile
profiles now include their platform's existing Firebase client file; simulator
support remains platform-dependent. The audit table above records the earlier
snapshot, not the current Docker sender state. Current local runtime and source
provenance are documented in [local development](local-real-data.md).

Profile/Release must separately receive approved per-platform Firebase client
defines, production HTTPS API_URL, privacy configuration and distribution signing.
Never package development server credentials. Existing AppConfig release guards
remain in force; Debug LAN configuration is not a release configuration.

## Copy-ready request to Backend team

**Subject: Complete Release 1 operational push through the existing FCM HTTP v1
path; secure session eligibility and add an internal developer sender.**

Please implement the following Backend-owned work in your normal reviewed
workflow. This Mobile task has not modified Backend, schemas, infrastructure,
Firebase Console, IAM or authentication. Base review on `origin/main` `67e08a8`,
OpenAPI 15.0.0; verify deployed version separately. Preserve current development
OTP and real session validation. Production OTP is a separate release dependency.

1. **Reuse verified functionality.** `NotificationsService.record` writes durable
   inbox/outbox records transactionally with event deduplication; BullMQ processes
   fan-out. `FcmPushProvider` already authenticates a service account, caches OAuth
   access tokens and sends FCM HTTP v1. Token upsert/reassignment, owner-checked
   deactivation, multi-token fan-out and account-deletion cleanup exist. Do not
   add a duplicate sender, Admin SDK integration or registration API.

2. **Close observed gaps.** Dispatch selects active device rows but does not
   recheck current account activity/session validity or ownership just before
   sending. DeviceToken has no session link; auth logout only revokes the supplied
   refresh record. Transient send failures are logged/swallowed and the event is
   marked processed, defeating ordinary BullMQ retry. All FCM INVALID_ARGUMENT
   details are currently treated as invalid recipient, although a malformed
   payload can also cause that error. Raw provider error strings enter logs and
   stored errors. Concurrent sends can both observe an unsent delivery row;
   delivery-key uniqueness alone does not guarantee one send.

3. **Preserve contracts.** Keep authenticated `POST /devices/token`
   `{token, platform, locale}` → 201 and `DELETE /devices/token` body `{token}` →
   204 (owned token; 403/404 semantics). Keep `/me/notifications` inbox/read
   contracts and successful `/me/account` deletion. Preserve existing account-wide
   notification preference semantics; do not repurpose them as per-device toggles
   or add marketing preferences to Mobile. No installation ID is currently sent.

4. **Resolve the exact session contract gap separately.** An FCM token/user ID
   cannot establish whether the registering session is still valid. Review a
   stable server-side session/refresh-family identity carried through refresh
   rotation, bound to registrations from the authenticated principal. Prefer
   preserving the existing device request body if this can be derived securely
   on the server. Today access claims/principal and device rows do not provide
   that binding; do not assume it exists or use “any user session is valid”.
   Document migration/legacy-token behavior and revocation semantics, including
   access-token expiry versus a still-valid refresh session. If wire changes are
   genuinely necessary, submit an explicit versioned contract/migration proposal
   and Mobile follow-up before rollout. No invented endpoint is requested here.

5. **Activate existing FCM configuration.** Use `NOTIFICATION_PROVIDER=fcm`,
   `FCM_PROJECT_ID` and secret `FCM_SERVICE_ACCOUNT_JSON_BASE64` from
   `backend/src/config/env.validation.ts`. This is the existing HTTP v1
   implementation, so Firebase Admin SDK initialization is unnecessary. Source
   requires credential project_id to equal FCM_PROJECT_ID. Current inspected
   local API container has none of these values; development defaults only log.
   Have the environment owner supply existing approved credentials securely and
   confirm actual deployed provider/worker configuration without logging secrets.
   Keep APP_ENV/auth OTP behavior unchanged. Update deployment guidance to allow
   this controlled real-FCM development path while CI remains isolated.

6. **Credentials/IAM.** Target project for the current Mobile development files
   is `shubayr-38835`; verify environment ownership before enabling sends. Use an
   approved server principal with `cloudmessaging.messages.create` (the documented
   Firebase Cloud Messaging API Admin role is `roles/firebasecloudmessaging.admin`)
   and the enabled FCM HTTP v1 API. Do not request project Owner/Editor or export
   a new key by default. Reuse approved credentials; if none exist, obtain owner
   approval for provisioning. Never distribute private keys, OAuth/access tokens
   or full FCM tokens to Mobile/logs/CLI output. Current sender expects base64
   service-account JSON; base64 is not encryption. ADC/workload identity would be
   a separately reviewed improvement, not an unsupported environment substitution.

7. **Token lifecycle/errors.** Keep one row per unique token and authenticated
   reassignment, platform/locale/last_seen refresh and owner-only DELETE. Recheck
   row ownership/activity at send time and include expected owner in invalidation
   predicates so a stale failure cannot deactivate a new owner's registration.
   Deactivate confirmed UNREGISTERED recipients. Only treat INVALID_ARGUMENT as
   token invalidity when evidence excludes payload errors. Classify transient
   429/5xx/network failures, respect Retry-After and bounded backoff, and retry
   failed deliveries without resending completed ones. Add an atomic claim or
   equivalent concurrency protection. Document unavoidable ambiguity after FCM
   acceptance followed by a process crash; never promise exactly-once receipt.

8. **Multi-device requirements.** Independent valid sessions and distinct tokens
   for the same customer must coexist. One selected registration or all eligible
   registrations may be targeted; signing out/revoking one must preserve the
   others. OS permission is per device. Refresh rotation must retain appropriate
   session eligibility; registration retries must not create duplicate rows.

9. **Security and cleanup.** Coordinate registration with logout/revocation,
   account deactivation/deletion and queued dispatch. Revalidate account/session
   and recipient ownership immediately before send; prevent concurrent stale
   registration from restoring a deleted/revoked account's eligibility. Cover
   session-version revocation and refresh expiry as agreed in item 4. Preserve
   existing deletion transaction removing all device/refresh rows and invalidating
   account sessions. Mobile cleanup/reset is best effort offline; `_registered`
   is memory-only, so restart-before-logout/denial can miss an old registration.
   Establish bounded server retirement/eligibility for stale records. Instant
   server knowledge of offline logout and recall of already dispatched OS
   notifications are impossible guarantees. Keep previews generic/non-sensitive.

10. **Deliver a secure internal CLI.** No existing notification-send CLI was
    found in Backend package scripts/scripts directory; there is no runnable
    command to document yet. Add one following Backend conventions and publish
    its exact syntax only after implementation. Require an explicitly authorized
    operator, approved test environment and allowlisted test CUSTOMER. Accept
    customer ID, either a registration ID or an explicit all-eligible selection,
    and bounded custom title/body. Default must not target all customers; reject
    unrelated owners, inactive/deleted customers, revoked/ineligible sessions and
    mismatched registration IDs. Support iOS/Android; optionally filter platform.
    Select through the same eligibility service and use the same delivery/error
    pipeline as business events, not a separate raw FCM call or public API.
    Include preview/dry-run selection, explicit send authorization and a request
    identifier for audited retries. Output registration ID/platform, accepted,
    rejected or skipped with sanitized error codes and FCM message ID where
    available. Current provider returns void and drops that ID: add an internal
    structured result without changing public APIs. Acceptance means FCM accepted
    the message, not device delivery. Record operator, environment, target IDs,
    timestamp, correlation ID and outcome; no complete tokens/credentials or
    unrestricted payload logging. Test sends must not fabricate business orders,
    new public notification types or silently pollute production inbox history.
    State the chosen test-event/audit/inbox policy in the CLI documentation.

11. **Operational triggers.** Reuse existing order_placed,
    order_confirmed/rejected/status changes/out_for_delivery in
    `orders/orders.service.ts`, delivery outcomes/assignment in
    `fulfilment/deliveries.service.ts`, and return_update in
    `returns/returns.service.ts`. Distinguish delivery-agent/staff recipients from
    CUSTOMER. Prove required customer flows end-to-end; do not recreate events.
    Main v15 overrides confirmed-order inbox text with adjusted total, while
    dispatch still renders generic templates; generic push is suitable for R1,
    but document this difference and keep order detail authoritative. No marketing
    sends or preference UI in this release. Existing preference overrides can
    disable transactional pairs; test eligibility instead of silently resetting
    user-wide preferences. Any missing business transition must be demonstrated
    with a specific existing workflow, not a fabricated event/type.

12. **Required tests.** Extend existing provider specs,
    `backend/test/notifications.acceptance.mjs` and
    `backend/test/mobile-audit-m1.acceptance.mjs`: two devices, one-device logout,
    refresh rotation/revocation/expiry, A→B reassignment, stale registration/delete/
    dispatch races, deletion and deactivation, offline stale rows, transient
    retries, permanent token errors versus payload errors, duplicate concurrent
    jobs, and strict response schemas. CLI tests must reject unauthorized
    operators/environments/targets and verify masked output/audit plus the shared
    dispatch path. Use unique disposable verification databases per AGENTS; do
    not send live pushes to ordinary test fixtures or real customers in CI.

13. **Acceptance.** Standard F5 Mobile → existing OTP login → authenticated
    registration → authorized CLI send through existing worker/provider → FCM
    acceptance → independently observed physical receipt → safe inbox tap.
    Repeat on iOS/Android and all scenarios below. Also prove at least one real
    operational Backend event, multi-device isolation and security cleanup. Treat
    race/error fixes and native delivery as independent gates; mock tests or a
    dev-provider “sent” log do not satisfy this acceptance.

14. **Deliverables.** Return reviewed implementation/tests, precise CLI invocation
    and setup guide, environment/secret provisioning checklist, sanitized example
    result and audit entry, deployed commit/contract version, session-binding/
    migration decision, failure/retry policy and remaining limitations. Supply
    test results and physical acceptance evidence by build/platform. Include any
    necessary Mobile contract follow-up; do not claim it already exists. No new
    public sender endpoint, Web Admin UI or Firebase project is requested.

15. **Firebase/Apple owner actions.** In Firebase project settings confirm iOS
    `com.shubayr.app` and Android `com.shubayr.app` App IDs/sender project match
    the external client files. In Cloud Messaging confirm existing APNs key or
    certificate, Apple team/key association and FCM API status; do not rotate.
    In Google Cloud APIs/IAM confirm FCM API enabled and the approved Backend
    principal's send permission on that project. Provision existing Backend
    credentials via secure environment management. In Apple Developer/Xcode
    confirm Push capability, provisioning and production APNs for distribution.
    These external actions have not been performed or independently verified by
    this task. Report readiness without sharing key material.

**Mobile ownership:** preserve existing lifecycle/permission/settings/tap logic,
standard profiles and tests; execute physical matrix with Backend once available.
**Backend ownership:** sender activation coordination, eligibility/error/idempotency
fixes, CLI and business-path tests. **Account/environment owners:** Firebase/IAM,
APNs and secret provisioning. This message is for manual delivery; it has not
been sent to another person or service.

Official references: [FCM HTTP v1 authentication and acceptance response](https://firebase.google.com/docs/cloud-messaging/send/v1-api),
[FCM IAM permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging),
[Flutter/APNs setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started),
[foreground/background behavior](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages).

## Recorded iPhone runtime verification

On 13 October 2026 (Asia/Baghdad), API logs and a read-only database inspection
showed `POST /devices/token` → 201 at 21:06:56, `DELETE /devices/token` → 204 at
21:07:07, and a new POST → 201 at 21:10:13. The account holder confirmed logout
at the DELETE time. At 21:11:08 the new iOS registration was active, the previous
one inactive, and the owning account active with CUSTOMER role. No token values,
credentials or customer identifiers are recorded here.

The running Flutter process targeted the known physical iPhone and supplied the
external iOS Firebase file. Generated build defines were present and the built
app carried the development APNs entitlement. Registration is indirect runtime
evidence of Firebase initialization and token acquisition through the current
Mobile path, not a direct read of Firebase memory. The device contract does not
store a hardware UDID; attribution uses the launch/timing correlation. Reuse of
the previous record across days was observed, but a controlled restart without
logout remains to be checked. No Backend-originated push was sent in this audit.

## Remaining physical verification plan

Use authorized test accounts only and the Backend team's implemented CLI when
available. Record build, deployed Backend revision, OS version, platform,
registration ID, correlation/message ID and observed outcome; never full tokens.
Standard iPhone F5 and registration are recorded above. Verify Android launch/
registration, breakpoint, Hot Reload/Restart and Settings navigation coverage,
then the delivery matrix below. The prior
iPhone permission is already granted: do not expect a fresh prompt or erase it.
Use an approved fresh test installation for initial allow/deny/dismiss cases.

| # | Scenario and expected evidence |
| --- | --- |
| 1 | iPhone foreground: targeted Backend send; generic localized snackbar and refreshed inbox/badge. Do not require a foreground system banner. |
| 2 | iPhone background: OS notification with appropriate configured presentation; compare FCM acceptance and observed receipt. |
| 3 | iPhone system-terminated: notification/launch/tap after system termination. Test user force-quit separately; do not equate it with system termination. |
| 4 | Android foreground: snackbar/inbox refresh through the same path; no new local-notification package expected. |
| 5 | Android background: OS notification; inspect app/channel permission and device power constraints. |
| 6 | Android system-terminated: receive/open after system termination; test force-stop separately and document OS restrictions. |
| 7 | Taps: background and cold start wait for verified CUSTOMER and startup readiness, open current inbox with expected Back behavior. Old A notification after B login must not reveal A content or privileged routes. |
| 8 | OS permission: fresh initial request only when undetermined; allow/deny/dismiss; no denial loops after login/resume. Settings opens per-app notifications (fallback if unavailable); revoke/re-enable then resume. Provisional iOS/Android channels and Android below 13 versus 13+ require appropriate device coverage. Inbox remains usable. |
| 9 | Same customer on iOS/Android: independent logins/refresh and two eligible registrations; all-device send reaches both, single-registration send only selected one. Denying permission on one preserves the other. |
| 10 | Online logout on one: its registration ineligible for future sends; other device remains signed in and receives. Verify server state, not just absence of an OS banner. |
| 11 | A→B on one device: delayed API/worker operations cannot register or deactivate the wrong owner. Send separately to A/B; inspect current inbox and OS previews. Include token rotation and delayed APNs availability/recovery. |
| 12 | Offline logout/reconnect: local logout succeeds, no A registration under B credentials; audit delayed server cleanup. Repeat after app restart before logout. Record remaining server limitations rather than treating cleanup failure as success. |
| 13 | Invalid/rotated token: use controlled stale test registration; verify permanent invalidation, bounded transient retries and no deactivation for payload-only errors. Repeated resume/register must not duplicate records or deliveries. |
| 14 | Account deletion: successful deletion retires all account devices/refresh sessions, leaves other users intact, handles queued dispatch/concurrent registration. Failed deletion preserves authenticated state. Already dispatched notifications cannot be recalled. |
| 15 | Real business trigger: use approved test order flow after checking v15 compatibility; verify durable inbox/outbox, eligible selection, real FCM acceptance and physical receipt. Include order placement/confirmation and delivery status, not just CLI messages. |

## Automated evidence and release gates

Publication verification on 13 October 2026: `flutter analyze --no-pub` passed;
the full `flutter test --no-pub --reporter expanded` suite passed **2107 tests**
with **5 skipped** integration tests. Configuration validation passed **7 tests**,
both device preflights passed, and Dart formatting / `git diff --check` passed.
No Backend suite, simulator or device launch was run during publication review.

Earlier focused integration checks:

- `node --test mobile/tool/firebase_debug_config.test.mjs`: **7 passed**.
- Device preflight for both existing external client files: **passed**; shared API
  health reachable from Mac. No mobile or server credentials printed.
- `flutter analyze --no-pub`: **no issues**.
- `flutter test --no-pub test/features/notifications test/features/auth
  test/core/network/auth_refresh_test.dart test/core/storage/session_credentials_test.dart
  test/app/auth_shell_lifecycle_test.dart test/features/efficiency/notification_lifetime_test.dart
  --reporter expanded` from `mobile/`: **201 passed**, no skips/failures.
- `flutter test --no-pub test/startup/release_config_test.dart --reporter expanded`:
  **27 passed**, preserving production configuration guards.
- `git diff --check`: **passed**. Baseline comparison confirms unrelated launch
  profiles, legacy prelaunch tasks and the special Firebase profile are unchanged;
  ROADMAP's content hash matches the start of this task.

These cover initial/authorized/denied permission, APNs pending, token rotation,
registration, stale ownership, logout/switch/deletion, resume and tap navigation.
They use fakes for platform/Backend boundaries. No Backend suite, native device
launch, live send or simulator was run as part of this task.

Release remains blocked on: Backend FCM configuration and security/reliability
fixes; the internal CLI for routine development acceptance; independent iOS and
Android physical evidence; production OTP provider; production API/contract
compatibility; privacy/store requirements and Android/iOS distribution signing /
production APNs. Defer optional session-management UI, installation preference
systems, marketing, delivery analytics, rich notifications and deep-link payload
expansion. Do not postpone the demonstrated delivery-eligibility security gaps.

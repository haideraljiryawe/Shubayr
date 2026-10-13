# Shubayr Authentication, Sessions, Devices, Account Deletion, and Notifications Plan

**Review date:** 13 October 2026, Asia/Baghdad.

**Mode:** analysis and planning only; implementation requires explicit approval.

**Backend owner:** Haider. **Flutter Mobile owner:** Ahmed.

**Scope:** customer Release 1 authentication, multi-device sessions, deletion, installation identity, push preferences, and delivery reliability. Preserve other clients and existing business behavior.

## 1. Executive Summary

**Confirmed from source code:** Shubayr supports concurrent customer logins and multiple FCM tokens for one user. These are separate capabilities. Each OTP login creates a distinct refresh-token record; ordinary customer login does not revoke other devices. Push dispatch selects every active token for the recipient and applies account-wide type/channel preferences.

**Confirmed from source code:** account deletion already has a substantial security implementation. A serializable transaction removes direct identity, addresses, refresh tokens, and device tokens, marks the retained user inactive, and increments session and permission versions. Subsequent JWT validation checks the database and rejects the deleted identity without waiting for access-token expiry. This working behavior must be retained, not rebuilt as though absent.

**Confirmed gaps:** refresh-token records are not stable sessions across rotations; ordinary logout cannot immediately revoke an access token; refresh response loss has no recovery protocol; installations have no independent identity or stored push preference; automatic registration reactivates a disabled token. Mobile has strong asynchronous ownership guards but lacks a dedicated authentication reconciliation gate on resume. Notification dispatch has incomplete transient-error retries and cannot prove exactly-once delivery or eliminate messages already handed to FCM.

**Proposed architecture:** retain NestJS/Prisma/PostgreSQL, the transactional outbox/BullMQ pipeline, Flutter/Riverpod, and the existing credential owner. Add stable sessions, installation records independent of FCM tokens, explicit per-installation preference, precise revocation, and an authenticated reconciliation workflow. Strengthen deletion concurrency rather than weakening existing account-status checks. Deliver the Switch only after its server state and lifecycle rules exist.

**Mandatory Release 1 gates:** multi-device deletion, immediate rejection of old credentials on new authorization checks, safe handling of in-flight operations, session-specific revocation, durable logout cleanup, explicit installation opt-in, no silent reactivation, bounded and secure refresh recovery, recipient isolation, reliable retry accounting, and physical-device acceptance on both platforms.

This plan contains **14 Backend tasks, 13 Mobile tasks, and 12 shared integration dependencies**. All tasks in sections 14–15 are Release 1 work; optional enhancements are explicitly separated in section 21. The plan does not authorize changes to source, schemas, contracts, or deployment.

## 2. Repository Baseline

### 2.1 Verified repository state

| Item | Verified value / limitation |
| --- | --- |
| Checkout | `/Users/ahmeda.alwan/Documents/GitHub/Shubayr` |
| Active branch | `mobile`, tracking `origin/mobile`; no branch switch |
| Mobile HEAD | `0b6270ce6e1c4e3f9a8b86a86b373df540fc0b10` |
| Latest fetched `origin/main` | `b09aa6199148d702f10bb532663ff03b2a6fcf92` |
| Authoritative API | `origin/main:api/openapi.yaml`, **14.2.0** |
| Fetch | `git fetch origin main` succeeded during this review |
| Team changes | `git log mobile..origin/main` returned no commits |
| Working tree before writing | Clean; no merge, rebase, or cherry-pick in progress |
| Only authorized output | This Markdown document; its root `docs/` location follows the explicit request and reflects shared ownership |
| Verification performed | Source, contract, migration, test, and documentation inspection; document consistency checks |
| Not performed | Application tests, database execution, deployments, Firebase-console checks, simulator/emulator or physical-device runs, commits, pushes, PRs |

Backend and API conclusions use the fetched `origin/main`, not an assumed historical contract. Relevant checked-out Backend/auth/notification/model/API files matched that ref. Mobile conclusions use the current `mobile` checkout. Line numbers may change; the file/function references below identify the reviewed behavior.

### 2.2 Instructions, migrations, and roadmap reconciliation

Read [root instructions](../AGENTS.md), [Mobile instructions](../mobile/AGENTS.md), [Backend README](../backend/README.md), [architecture rules](ARCHITECTURE.md), and [historical Backend guidance](../prompts/BACKEND_CODEX.md). No separate Backend `AGENTS.md` was found. Historical scaffold vocabulary and table counts do not override current OpenAPI, migrations, or the explicit analysis-only instruction.

Reviewed migration history relevant to this scope:

- `backend/prisma/migrations/20260918000400_auth_refresh_tokens/migration.sql`: refresh-token digest storage and one-use rotation foundation.
- `backend/prisma/migrations/20260920000500_notifications/migration.sql`: globally unique FCM token, activation state, preferences, outbox, and delivery logs.
- `backend/prisma/migrations/20260927000100_access_model_v2/migration.sql`: auth surfaces, session versions, and refresh ownership.
- `backend/prisma/migrations/20260927000200_notification_inbox_monitoring/migration.sql`: durable bilingual inbox, recipient-specific event uniqueness, and streams.
- `backend/prisma/migrations/20261012120000_mobile_audit_m1/migration.sql`: anonymized user stub and deletion-compatible identity constraint.

Listed `origin/main:docs/mobile/` and reviewed the notification/auth-relevant portions of migration notes through [14.2](mobile/contract-changes-v14.1-to-v14.2.md), including the [12-to-13](mobile/contract-changes-v12-to-v13.md) preference additions and [10-to-11](mobile/contract-changes-v10-to-v11.md) customer notification additions. Existing device API shapes remain unchanged in 14.2; invalid FCM registrations can be deactivated by the server.

[Mobile ROADMAP](../mobile/ROADMAP.md) and [Release 1 readiness](../mobile/docs/release-1-readiness.md) record deletion as implemented and native push as partial. The roadmap records prior physical-iPhone Console delivery and prior automated results. Those are **historical reported evidence**, not tests rerun here, and do not establish Backend-originated delivery, Android readiness, or the expanded cross-device deletion requirements. The older [push integration guide](../mobile/docs/push-notifications-release-1.md) has a broader pending-verification label. Preserve both records; this plan specifies additional gates rather than changing their historical results or reopening unrelated completed features.

### 2.3 Evidence index

| ID | Repository evidence and relevant responsibility |
| --- | --- |
| E01 | [api/openapi.yaml](../api/openapi.yaml): `/auth/*`, `/me`, `/me/account`, `/devices/token`, `/me/notification-preferences`, and inbox schemas |
| E02 | [auth.service.ts](../backend/src/modules/auth/auth.service.ts): `requestOtp`, `verifyOtp`, `issueTokenPair`, `refresh`, `logout`, `changePassword` |
| E03 | [jwt.strategy.ts](../backend/src/modules/auth/jwt.strategy.ts): active-user, surface, role, expiry, and `session_version` validation |
| E04 | [schema.prisma](../backend/prisma/schema.prisma): `User`, `RefreshToken`, `DeviceToken`, preferences, events, and logs |
| E05 | [me.service.ts](../backend/src/modules/auth/me.service.ts) and [me.controller.ts](../backend/src/modules/auth/me.controller.ts): deletion transaction and customer-only policy |
| E06 | [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md): current retention and released-phone policy |
| E07 | [notifications.service.ts](../backend/src/modules/notifications/notifications.service.ts): registration, preferences, event creation, enqueueing, fan-out, and failure handling |
| E08 | [notification-provider.ts](../backend/src/modules/notifications/notification-provider.ts), [processor](../backend/src/modules/notifications/notifications.processor.ts), [module](../backend/src/modules/notifications/notifications.module.ts): FCM request, worker, provider selection |
| E09 | [notification-stream.service.ts](../backend/src/modules/notifications/notification-stream.service.ts): ticket validation and long-lived stream |
| E10 | [auth_providers.dart](../mobile/lib/features/auth/presentation/providers/auth_providers.dart): restoration, OTP replacement, deletion, sign-out |
| E11 | [session_credentials.dart](../mobile/lib/core/storage/session_credentials.dart), [token_store.dart](../mobile/lib/core/storage/token_store.dart): revision ownership and secure storage |
| E12 | [api_client.dart](../mobile/lib/core/network/api_client.dart), [auth_interceptor.dart](../mobile/lib/core/network/interceptors/auth_interceptor.dart): shared refresh, one retry, terminal versus transient failure |
| E13 | [push_lifecycle.dart](../mobile/lib/features/notifications/domain/push_lifecycle.dart), [push_client.dart](../mobile/lib/features/notifications/domain/push_client.dart): serialized FCM lifecycle and ownership |
| E14 | [push_providers.dart](../mobile/lib/features/notifications/presentation/push_providers.dart), [device_registration.dart](../mobile/lib/features/notifications/data/device_registration.dart): lifecycle triggers and device HTTP |
| E15 | [firebase_push_client.dart](../mobile/lib/features/notifications/data/firebase_push_client.dart): Firebase initialization, permission mapping, APNs readiness, refresh streams, token reset |
| E16 | [push_notification_bridge.dart](../mobile/lib/app/push_notification_bridge.dart), [notification_providers.dart](../mobile/lib/features/notifications/presentation/notification_providers.dart): notification events, polling, inbox state |
| E17 | [account_view.dart](../mobile/lib/features/settings/presentation/screens/account_view.dart), [push_permission_tile.dart](../mobile/lib/features/notifications/presentation/push_permission_tile.dart), [notification_button.dart](../mobile/lib/features/notifications/presentation/notification_button.dart): Account controls |
| E18 | [app_router.dart](../mobile/lib/app/router/app_router.dart), [role_guard.dart](../mobile/lib/app/router/role_guard.dart), [app.dart](../mobile/lib/app/app.dart): route and lifecycle composition |
| E19 | [Backend auth tests](../backend/src/modules/auth/auth.service.spec.ts), [deletion tests](../backend/src/modules/auth/me.service.spec.ts), [M1 acceptance](../backend/test/mobile-audit-m1.acceptance.mjs), [access acceptance](../backend/test/access-model.acceptance.mjs) |
| E20 | [notification acceptance](../backend/test/notifications.acceptance.mjs), [dispatch tests](../backend/src/modules/notifications/notifications.service.spec.ts), [provider tests](../backend/src/modules/notifications/notification-provider.spec.ts) |
| E21 | [Mobile deletion tests](../mobile/test/features/auth/account_deletion_test.dart), [refresh ownership tests](../mobile/test/features/auth/session_refresh_ownership_test.dart), [session commit tests](../mobile/test/features/auth/session_commit_test.dart), [restore HTTP tests](../mobile/test/features/auth/session_restore_http_test.dart) |
| E22 | [push lifecycle tests](../mobile/test/features/notifications/push_lifecycle_test.dart), [Firebase tests](../mobile/test/features/notifications/firebase_push_client_test.dart), [push navigation tests](../mobile/test/features/notifications/push_navigation_test.dart) |
| E23 | [API error filter](../backend/src/common/http/api-exception.filter.ts), [error codes](../backend/src/common/http/api-error.ts), [Mobile diagnostics](../mobile/lib/core/diagnostics/diagnostics.dart), [HTTP logging](../mobile/lib/core/network/interceptors/logging_interceptor.dart) |
| E24 | [access-management.service.ts](../backend/src/modules/rbac/access-management.service.ts): staff security revocation; not a customer logout-all API |

## 3. Current Architecture

**Confirmed from source code; E01–E18.**

OTP requests consume earlier unused codes for the same phone and create a new expiring keyed hash. Verification consumes one matching unexpired code conditionally, resolves the customer identity, then issues a token pair. Normal existing-customer login retains other refresh tokens. OTP requests are phone-scoped, not installation-scoped; genuinely simultaneous issuance ordering needs concurrency tests rather than assuming a strict single outstanding challenge.

Refresh JWTs contain unique `jti`, user, surface, client, and account version; the database stores a hash. Rotation revokes one row and creates another in a transaction. Access JWTs contain user/surface/client/version but no stable session identifier or unique token `jti`. Defaults are 15 minutes for access and 30 days for refresh, configurable in deployment. Every rotation resets refresh expiry; no separate absolute session lifetime was found.

Flutter stores access/refresh values through `SecureTokenStore`. `SessionCredentials` serializes writes and uses revision ownership to prevent stale work overwriting a new login. The interceptor coalesces refresh within a revision and retries a failed protected request once. Transient restoration failures preserve credentials but do not authorize private screens. Local logout clears credentials even when server cleanup fails.

Firebase is optional until build configuration is supplied. Auto-init is initially disabled; a verified customer and allowed OS permission lead to token acquisition and Backend registration. iOS waits for APNs readiness. Registration runs on login/resume, locale change, and token refresh. Foreground messages refresh inbox/badge and show generic localized feedback; OS notification payloads are displayed in the background; taps open the current authenticated inbox. No arbitrary payload route is trusted.

The inbox and read state are account-scoped and intentionally shared across devices. Push preferences are currently account-wide by type/channel; token `is_active` is a transport registration state. These are not installation preferences. A 30-second foreground badge poll and push synchronization can indirectly discover a revoked account through HTTP 401, including on resume. Neither is a dedicated, ordered session-verification gate before displaying cached authenticated UI.

## 4. Confirmed Capabilities

Status definitions: **Supported** means a source/contract capability, not a fresh end-to-end pass. **Partially Supported** means a working foundation with material limits. **Not Supported** means no implementation found. **Not Verified** requires runtime evidence.

| Capability | Status | Evidence / qualification |
| --- | --- | --- |
| Same phone on several devices | Supported | E02/E04: separate refresh rows; no per-user uniqueness or normal login-wide revocation |
| Independent refresh rotation | Supported | E02: conditional revocation affects one refresh record |
| Stable device-session identity across rotations | Not Supported | E02/E04: no session family or installation relation |
| Logout does not revoke unrelated devices | Supported | E01/E02: one supplied refresh token is revoked |
| Immediate single-session access revocation | Not Supported | E03 checks user/version, not an individual session |
| Global account revocation foundation | Supported | E03/E05/E24: account status/version gates and refresh revocation |
| Customer-selected session and logout-all management | Not Supported | No such customer routes in E01 |
| Deletion rejects subsequent old access/refresh authorization | Supported | E03/E05; M1 acceptance checks old `/me` access after deletion |
| Deletion detection on another device before stale UI appears | Partially Supported | E10/E16/E18: startup verification and indirect 401 handling, no explicit resume gate |
| Multiple FCM tokens and fan-out | Supported | E04/E07: globally unique token, many per user, active-target selection |
| Server-side single-token deactivation/reactivation | Supported | Existing `DELETE/POST /devices/token` preserves token record on deactivation |
| Persistent independent installation opt-out | Not Supported | No installation preference; POST unconditionally reactivates |
| OS permission read and resume recheck | Supported | E14/E15, with lossy permission mapping |
| Complete permission and APNs state representation | Partially Supported | Provisional/authorized and denied/permanent-denied merged; APNs pending reused as not-determined |
| Local response/session ownership isolation | Supported | E10–E14/E21/E22; does not authenticate the recipient of a late FCM message |
| No cross-account OS notification under all races | Not Verified | Cleanup and FCM/OS behavior do not provide that guarantee |
| Event/token uniqueness and ordinary duplicate suppression | Supported | E04/E07: unique event/recipient and delivery keys; no exactly-once guarantee |
| End-to-end retry reliability and physical-device matrix | Not Verified | E07/E08 have confirmed retry gaps; historical iPhone evidence is narrower |

## 5. Confirmed Gaps

| Gap | Source-confirmed observation | Required disposition |
| --- | --- | --- |
| G01 | Access tokens have no session identity; identical claims issued in one second can produce identical token text. | BE-002; uniqueness alone is not the fix—stable revocable ownership is. |
| G02 | Spent refresh tokens are rejected, but there is no family revocation or exact-response recovery. | BE-004 / MB-003. |
| G03 | Logout revokes one refresh row; its access token remains valid, and a successor minted during a race may remain live. | BE-005; retain Mobile ownership guards. |
| G04 | Offline logout cleanup is best effort and not durably retried; direct OTP credential replacement does not revoke the old refresh token. | BE-005 / MB-005. |
| G05 | No dedicated startup/resume/reconnect verification workflow before resuming private state. | MB-004; preserve existing `/me` and indirect 401 recovery. |
| G06 | Device deletion/registration and token issuance are not all coordinated through one account lifecycle locking rule. | BE-003/006/008; concurrency evidence required. |
| G07 | No stable installation identity, readable device preference, or preference version; `is_active` conflates transport state with disabling. | BE-007/008 / MB-001/007. |
| G08 | Automatic POST reactivates registrations; disabled intent is not persisted independently. | BE-008 / MB-007/008. |
| G09 | FCM payload has no recipient/binding metadata; event ownership is assigned at receive time. | BE-009 / MB-011; OS display remains a separate limitation. |
| G10 | Worker catches gateway errors, records failed, then can mark the event processed without triggering BullMQ retry. | BE-010. |
| G11 | Permission states are collapsed; no first-appropriate-experience offer or settings-opening action exists. | MB-009. |
| G12 | Account tile is an enable action with chevron, not an observable preference; inbox row lacks its navigation chevron. | MB-010 after state integration. |
| G13 | Delivery logging stores raw error strings; retry/duplicate/session-revocation observability is incomplete. | BE-012; retain Mobile redaction. |
| G14 | Stream access is checked on ticket consumption; the open SSE path has no subsequent account/session revalidation. | BE-006/009; Mobile need not adopt SSE to solve reconciliation. |

## 6. Risks and Security Findings

**Confirmed from source code** refers to the vulnerable or incomplete code path. It does not assert that a production exploit or data leak occurred.

| ID / priority | Finding and impact | Evidence / response |
| --- | --- | --- |
| R01 / P0 | A stolen access token remains usable after ordinary logout until expiry or global invalidation. | E02/E03; session-backed validation, BE-002/005. |
| R02 / P0 | A lost refresh response leaves Mobile with a spent token. Reuse is rejected but an attacker's already-issued successor is not revoked as a family. | E02/E12; exact recovery and family replay policy, BE-004. |
| R03 / P0 | Deletion correctly blocks later guard checks, but preauthorized in-flight operations need a defined commit boundary. Registration can reach its transaction after the guard; OTP token issuance is outside its user transaction. | E02/E05/E07; no claim of resurrection demonstrated. Coordinate mutations and deletion; BE-003/006/008. |
| R04 / P0 | Other devices can briefly display cached account UI on resume until an incidental request detects invalidity. | E10/E16/E18; explicit unresolved state and `/me` reconciliation, MB-004. |
| R05 / P0 | Offline logout or failed Firebase reset cannot prove server detachment. `_registered` is memory-only; late cleanup is not durably recoverable. | E10/E13/E15; revocation-only cleanup capability and installation binding, BE-005/007, MB-005. |
| R06 / P0 | A late Account A FCM event may be attributed to current Account B; the OS can display an already-accepted payload before Flutter validates anything. | E08/E13/E16; generic payload, binding metadata, dispatch-time validation, BE-009/MB-011. |
| R07 / P0 | Resume/token rotation can override a user's server token deactivation. | E07/E13/E14; explicit preference separated from token health. |
| R08 / P1 | Transient delivery errors can be terminal in practice despite configured queue retries. A crash after FCM acceptance can also duplicate delivery. | E07/E08; per-target attempts, leases, bounded retries, BE-010. |
| R09 / P1 | `INVALID_ARGUMENT` is treated as token invalidity without a comprehensive payload-versus-token classification. | E08; classify structured errors and validate payload before retirement. |
| R10 / P1 | Repeated deletion is not response-idempotent: after success normal authorization returns 401; a concurrent preauthorized request can encounter service 404, not declared on this route. | E01/E05/E23; stable terminal semantics, BE-006/014. |
| R11 / P1 | A globally unique FCM token is reassigned on POST without installation continuity proof; UUID/FCM possession must not become authentication. | E07; bind authenticated session plus separate installation credential. |
| R12 / P1 | Raw gateway error text enters logs and `notification_logs.error`; it could contain provider-supplied sensitive text. | E07/E08; sanitized codes/attempt IDs, BE-012. Actual leakage not verified. |
| R13 / P1 | Existing SSE streams can outlive revocation because periodic writes do not recheck access. | E09; terminate/revalidate existing consumers, no new Mobile streaming dependency. |

Protect refresh tokens, installation continuity secrets, revocation capabilities, and recovery results as credentials. Do not log headers, OTPs, FCM tokens, request bodies, cached token pairs, or phone numbers. Existing development-only OTP logging is not evidence of production logging; keep production safeguards. Audit identifiers should be internal IDs with controlled retention. Server-owned `surface`, role, subject, and session binding cannot be overridden by client fields.

## 7. Target Architecture

**Proposed architecture; requires team agreement before implementation.**

| Concept | Meaning | Lifetime / authority |
| --- | --- | --- |
| User ID | Account identity, not the phone number | Server-generated; deletion leaves inactive historical identity; recreation gets a different ID |
| Installation ID | One application installation within one environment | Random client-generated identifier; persists through login/logout and FCM rotation; not an authentication credential |
| Session ID | One authenticated login lineage | Server-generated; stable across refresh rotations; revoked independently |
| FCM registration token | Provider routing address | May rotate independently; neither account identity nor proof of installation ownership |

Use a small extension of existing services, not a replacement authentication framework. Introduce an `AuthSession` model and an `Installation` model, extend existing refresh/device relations, and retain the existing outbox. Model one current customer session/binding per installation for Release 1; several installations can share a user. A new login on the same installation replaces only that installation's previous session. Other installations remain untouched.

Separate server `push_enabled`, account-binding consent, reported OS permission, token health, registration/binding revision, and session activity. Keep the user preference when transport fails or FCM rotates. A client observation of OS permission is advisory to the server, not an authorization credential.

Do not couple access authorization to notification permission or require an FCM token to log in. Guests can browse without creating account-owned push registrations. No topic-based substitute is proposed.

## 8. Authentication and Session Design

### 8.1 Stable sessions and authorization

**Proposed:** `AuthSession` contains server ID, user ID, surface/client, optional installation relation, created/authenticated timestamps, last activity, idle/absolute expiry, revocation time/reason, and a hash of a revocation-only capability. Each refresh row references the stable session and its predecessor/generation. Access JWTs reference `sid` and retain account `ver`, `typ`, surface, and subject. A unique access `jti` may aid diagnostics but is not a revocation mechanism.

Validate account active/version and session active/expiry/subject/surface on each protected authorization decision. Reuse the existing database user lookup with an indexed session join. For Release 1, do not cache positive authorization across requests: correctness is more important than saving an unmeasured query. Benchmark before adding complexity. If caching is later introduced, invalidation across every API/worker node must meet the deletion guarantee; TTL alone creates a revocation window. Fail closed when authoritative authorization state cannot be read.

Normal OTP login never increments the account-wide version. Consume OTP and create/bind the session under the account lifecycle transaction rule. Installation replacement revokes only the prior session on that installation. OTP issuance remains latest-code-oriented for Release 1, with an explicit per-phone serialization strategy, rate limits, and deterministic collision handling. Separate challenge IDs are optional later; concurrent requests must not mint duplicate accounts or claim both old and new codes remain valid.

### 8.2 Refresh reliability without broad replay grace

**Proposed; security design approval required in Phase 1.** Keep refresh rotation single-use. Add a client-persisted random `operation_id` and require separate installation continuity proof for the new Mobile protocol. Before sending, Mobile stores the operation and old credential generation through `SessionCredentials` in secure storage. It retries only the identical operation after uncertainty.

In one server transaction: lock the account/session in the approved order, revalidate account/version/session/installation proof, conditionally consume the old refresh row, create one successor, and record an operation fingerprint plus the exact encrypted response. Bind the record to old-token hash, session, installation, operation ID, and canonical request. An exact authenticated retry within a short recovery window returns that same response; it does not rotate again or extend expiry. Revalidate account/session revocation before returning cached credentials. Different operation/payload, missing proof, or mismatched ownership must never recover a token pair.

Recommend a **two-minute recovery window**, subject to load/security review, followed by ciphertext deletion. Store refresh digests normally; the short-lived recoverable response is an explicit exception requiring envelope encryption, restricted access, key rotation, expiry, no logs, and deletion on revocation. An operation ID alone is not authorization. The separate installation secret is a credential with a narrowly defined purpose, not a claim that the physical device is trusted. Full request/device compromise remains outside bearer-token replay protection.

Detect reuse of a consumed refresh token outside the exact accepted operation and revoke its session family, not all devices. Invalid random tokens must not be sufficient to revoke someone else's session. After the recovery window, the safe result is reauthentication, not accepting the old token again. Concurrent identical operations coalesce; conflicting rotations fail deterministically. A storage failure after server success remains an explicit recovery/reauthentication state.

If the team declines encrypted response recovery, retain strict rotation and require explicit OTP recovery after a lost response. That is a documented availability compromise requiring approval, not silent completion of the reliability requirement. Do not implement an unrestricted grace period. The security principle follows [RFC 9700 refresh protection](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14); the exact recovery protocol above is a Shubayr proposal, not an RFC-defined endpoint.

### 8.3 Logout, selected-session revocation, and logout-all

| Operation | Proposed effect |
| --- | --- |
| Logout current installation | Revoke its session family and detach its active account push binding atomically; clear local identity immediately |
| Revoke selected session | Authenticated owner targets a session ID; server revokes that lineage and its binding without affecting unrelated sessions |
| Revoke all sessions | Account-wide version increment plus all session revocations and binding detachment; includes caller |
| Delete account | Apply retention/anonymization policy, revoke all sessions, remove account-owned registrations, cancel pending sends, and prevent old identity restoration |

For offline logout, do not retain an ordinary refresh token in a background retry queue. Issue a separate revocation-only opaque capability with each session; store only its hash on the server. Before deleting authentication credentials, persist a minimal cleanup envelope containing API environment, session ID, capability, and expiry in secure storage. It can only revoke that session and its binding. Retry with backoff on startup/connectivity/foreground; never use the new account's bearer token. Invalid/expired capability ends cleanup without restoring authentication. A valid repeat remains an idempotent acknowledgement through its bounded tombstone lifetime.

Local logout cannot prove remote revocation while offline. The UI must not promise otherwise. A local sign-out tombstone prevents restoration if secure deletion fails; treat unavailable/corrupt security storage as unresolved, not as successful durable logout. The tombstone is not a second credential cache. Retain current revision checks so late replies cannot republish identity. Server session revocation wins against any concurrent refresh through shared locking and post-lock validation.

## 9. Cross-Device Account Deletion

### 9.1 Current behavior that must be preserved

**Confirmed, E03/E05/E06/E19:** deletion requires a customer app session. Open orders, pending returns, or unsettled financial records return `409 ACCOUNT_DELETION_BLOCKED` with existing blocker codes. Success returns 204 after a serializable transaction with a user-row lock. It removes addresses, device tokens, refresh tokens, and OTP records for the old phone; clears direct identity; increments versions; and preserves the inactive user stub.

Order/contact snapshots, financial/inventory history, reviews, loyalty records, notifications, and audit history remain associated with the old internal ID under the documented retention policy. Retained snapshots may still contain personal information; this is not complete erasure of every historic personal value. Do not rewrite posted records. Haider and the project owner must confirm the approved retention schedule, access controls, backup retention, and privacy wording; this document does not invent legal retention periods.

A new OTP login with the released phone creates a new user ID. Local/server caches, journals, sessions, bindings, and inbox authorization must use that ID, never the phone, to distinguish identities.

### 9.2 Mandatory A/B/C scenario

**Proposed mandatory Release 1 acceptance:**

1. Device A sends the existing deletion request while A/B/C own distinct sessions.
2. The server serializes deletion with account-mutating writes, session creation/rotation, and installation binding. It rechecks blockers inside the transaction.
3. Commit atomically marks the account inactive/anonymized, bumps versions, revokes every session/refresh family, removes or detaches registrations and account consent, and marks unsent deliveries ineligible. Keep immutable history and audit.
4. Any authorization check after that commit rejects all old access and refresh credentials. Session ID is not a substitute for the existing user/version check.
5. A clears its credential envelope, private providers, account journals, pending authenticated work, and notification binding; it routes to the unauthenticated sign-in/welcome experience. A 409 leaves it signed in with actionable blockers.
6. B on resume and C on cold launch enter an unresolved authentication state before displaying private UI. Online `/me` verification receives a definitive invalid-account/session result; both clear local account state and navigate to sign-in/welcome without auto-login.
7. A device that is offline cannot know deletion happened. It must label authentication unverified and hide/gate private account presentation rather than claim the account still exists. Preserve credentials for retry on transport failure; reconcile on connectivity return or the next explicit online action.
8. A later same-phone account has a new ID and cannot inherit old history, session cleanup, consent, or pending writes.

For a device already active in the foreground, every protected request still receives authoritative enforcement. Add a coalesced authentication heartbeat using the existing foreground scheduling pattern, with a proposed maximum interval of 30 seconds, and immediate checks on reconnect or explicit private action. Do not make this depend on whether a notification badge is mounted. This bounds routine online discovery; it is not instantaneous remote control of the UI. Network latency and disconnection remain explicit limits. Stop timers in the background and discard late verification responses by ownership/generation.

A delayed successful login response can have been issued before deletion. Store its credentials only as an unresolved candidate and verify `/me` before publishing an authenticated identity or registering push. A late refresh response must likewise not be treated as account-liveness proof on its own. Server authorization after deletion rejects either candidate; the app must not display the old user merely because an old token response contained that user object. No system can promise that deletion will not occur immediately after a successful verification; ongoing request checks and bounded reconciliation close that observation gap.

### 9.3 Transaction and external boundaries

Use a consistent lock order across services: account rows in stable ID order, then installation, then session/refresh rows. Revalidate under lock; an earlier HTTP guard pass is insufficient for credential creation, binding, and protected business mutations. A mutation that committed before deletion can legitimately make deletion blocked. A mutation ordered after deletion must fail without committing. Serializable conflicts get bounded server-side retry only when the entire database operation is safe; otherwise return a declared retryable error. No external FCM call occurs inside the deletion transaction.

For requests already in flight, specify the boundary honestly: completed/preauthorized reads cannot be unsent. Recheck account/session status before emitting sensitive long-lived results, and terminate/revalidate SSE connections. Mobile drops stale results by revision and reconciliation ownership. Do not claim a guard can retroactively cancel an already-authorized response.

Worker selection and send eligibility must exclude deleted users, revoked sessions, detached bindings, and cancelled delivery attempts. A worker that already handed a message to FCM, or passed its last send check immediately before deletion, may still produce a notification. Database deletion cannot atomically retract external provider work. Keep payloads generic, minimize TTL, validate taps, and record the in-flight boundary. Any stronger strict no-display requirement would need a different platform delivery design and still cannot recall delivered notifications.

### 9.4 Repeats, uncertain outcomes, and error semantics

Preserve `DELETE /me/account` with no invented request body. First confirmed success returns 204. Repeated requests with now-invalid credentials may return a documented terminal 401; this is effect-idempotent, not guaranteed repeated-204 behavior. Normalize concurrent preauthorized deletion of an already deleted identity to the same terminal contract rather than an undeclared 404.

If the 204 is lost, Mobile verifies account availability. A terminal unavailable/revoked result clears authentication, but must not display a deletion-success claim unless deletion was confirmed. Say the account is no longer available and sign out; audit/support can resolve the original operation. A timeout/5xx is not proof of deletion and must not erase credentials or resubmit blindly. No new public deletion-status lookup by phone is proposed.

## 10. Installation Identity Design

**Proposed:** generate a cryptographically random UUID and a separate random 256-bit continuity secret. The UUID is an identifier, never proof. The server stores a digest of the secret and requires authenticated account ownership plus proof for binding changes. Do not derive identity from phone, advertising ID, hardware serial, or FCM token.

Create the installation record during successful OTP session establishment for upgraded Mobile clients. A first proof creates an unbound/default-disabled record within that authenticated transaction. Reusing an existing ID requires matching proof; a mismatch returns a generic conflict and does not expose its owner. Correct proof with a newly OTP-authenticated account permits an atomic binding transfer, revokes the prior session on that installation, increments binding revision, and detaches old-account push. Possession of the continuity secret alone cannot log in or read account data.

Keep the public ID and fresh-install marker in app-private storage excluded from backup/device transfer; keep the secret in device-local secure storage with no cloud synchronization or migration. Use existing storage abstractions where their guarantees fit. On iOS, combine a fresh app-container marker with secure storage so surviving keychain data cannot silently restore a prior installation after reinstall. Verify actual plugin and OS behavior on physical devices; do not assume uninstall always removes credentials. Android backup defaults require explicit exclusions for installation/session material; see [Android backup guidance](https://developer.android.com/identity/data/autobackup).

| Event | Proposed identity / preference behavior |
| --- | --- |
| Restart, update, background/resume | Same installation; retain confirmed choice and pending intent |
| FCM token rotation | Same installation and preference; replace routing token conditionally |
| Logout and same-user login | New session, same installation; retain explicit preference and same-user consent |
| Different account | Same physical installation preference; new binding needs explicit account consent before enabling, even if OS permission already exists |
| Account deletion | Remove old account binding/consent and pending sends; keep only minimal unbound installation data if approved by retention policy |
| Reinstall, app-data reset, migration to another device | New installation and explicit opt-in; do not silently import credentials or activation |
| Restored/duplicated ID without matching secret | Refuse binding; create a fresh installation after local recovery and authentication |
| Cloned ID plus secret | Cannot prove distinct physical devices with identifiers alone; detect conflicts/rotating token oscillation and require reauthentication; do not claim attestation |
| Deregistration | Detach account/token binding; do not delete FCM token merely because push is disabled |

The selected policy is a device-level preference with account-specific consent. A different policy—preferences per `(user_id, installation_id)`—is a team decision, not interchangeable behavior. Explicitly disabled remains disabled across every transition. New installation consent defaults off; upgrading an existing token must not infer explicit app preference solely from OS authorization.

## 11. Push Notification Preference Design

### 11.1 State and synchronization

**Proposed:** server preference is authoritative; local state records confirmed server revision, current OS observation, and pending user intent. Cache is not proof of success. Effective readiness requires an active account/session/binding, explicit installation preference and account consent, usable permission, and acknowledged current registration. Type/channel account preferences remain an additional send filter; the device Switch does not overwrite them or imply all notification categories are enabled.

| Observable state | Switch / bell | Action / explanation |
| --- | --- | --- |
| Checking / unknown | Disabled interaction; neutral/loading treatment, not a false confirmed off state | Fetch server state and read OS settings |
| Enabled | On; `Icons.notifications_outlined` | Last checked state permits push; no promise of guaranteed delivery |
| Disabled by Shubayr | Off; `Icons.notifications_off_outlined` | Explicit app preference off |
| Permission required / denied | Off; muted bell | Explain OS block; request only when permitted or offer Settings |
| Provisional iOS | On only if app/server consent is on; normal bell with quiet-delivery subtitle | Do not promise sound/banner; offer an intentional upgrade path |
| APNs / registration pending | Not confirmed on; loading/pending explanation | Retry after readiness/resume with ownership checks |
| Mutation in flight | Hold last confirmed state and disable repeated action | Serialize controller operations, not only widget callbacks |
| Failed or uncertain write | No success indication; last confirmed value marked stale/unknown | Read back authoritative revision; retry only the same identified intent when contract permits |

Enable: capture session/binding revision, persist intent, read permission, offer/request if possible, wait for APNs/FCM readiness, send explicit preference/registration update, and publish success only on confirmed current-owner response. Disable: send `push_enabled=false`, confirm the server revision, and retain FCM token. Keep history, unread count, and stored notifications. While offline, a pending disable can suppress foreground presentation locally but cannot promise server delivery has stopped. Reconcile before declaring success.

Background auto-sync and token updates must omit preference changes. A token event while disabled may update the routing token with the disabled preference preserved; it may not activate delivery. OS revocation suppresses effective state without rewriting explicit user choice. Returning from Settings may restore effective readiness only if prior explicit app consent remains enabled. Never prompt from resume/refresh listeners.

### 11.2 First appropriate permission experience

Offer a short bilingual pre-permission explanation after the first verified customer login, once the main experience is ready, or at an intentional order-tracking moment. Guests do not need an OS prompt or account registration. Record whether the offer was shown/dismissed; do not repeat automatically after denial. The Account Switch remains the deliberate retry entry point. On account change, request account consent without unnecessarily repeating the OS dialog.

Read native permission before deciding. Preserve not-determined, requestable denial, permanent/system-settings denial, authorized, and provisional distinctions. The installed `firebase_messaging` 16.7.0 implementation exposes `deniedPermanently` on Android; Apple denial is represented differently. Do not add another permission tracker merely because generic documentation describes an older ambiguity. Review platform-specific channels/alert settings before labeling the experience fully enabled. Ordinary apps cannot silently revoke OS permission. [Firebase reception guidance](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages) describes platform handling; the locked SDK source governs exact enum mapping.

### 11.3 Account presentation

Keep inbox navigation unchanged, preserve badge count and directional placement, and add the same `Icons.chevron_right` used by Favorites/Addresses. The installed Flutter icon has `matchTextDirection`; avoid double mirroring. Keep any badge extraction focused so Home toolbar behavior is unchanged.

Replace the enable-action chevron with a Material Switch within existing `AppCard`/`ListTile` and theme. English label is **Push Notifications**. The exact Arabic label, expressed as a JSON Unicode escape to keep this planning document English-only, is `"\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u0627\u0644\u0641\u0648\u0631\u064a\u0629"`. Use ARB localization and generation, not literal feature strings. One Riverpod state drives both Switch and icon. Use existing snackbar, spacing, colors, semantics, and loading/error conventions; verify Arabic/English, RTL/LTR, light/dark, narrow widths, and large text.

## 12. Firebase and Notification Reliability

**Confirmed:** current outbox event and token uniqueness protect ordinary duplicate inserts. They do not prove exactly-once external delivery. Current fan-out snapshots active tokens, `dispatchOne` catches send errors, and the outer event can then be marked processed. `UNREGISTERED`/`INVALID_ARGUMENT` are currently grouped as token invalidity. See E07/E08.

**Proposed pipeline:** retain the transactional event, persist one delivery target per `(event_id, installation_id, binding_revision, channel)`, and track attempts separately or through explicit attempt fields. Use a lease/conditional claim to prevent concurrent workers owning one target. Before every attempt, recheck active user/session/binding, explicit preference, account type/channel filter, current token revision, cancellation, and TTL. Do not hold database locks during network calls.

Classify transport/timeouts, provider 429/500/503 as retryable under bounded exponential backoff/jitter and `Retry-After`; distinguish permanent token failures from malformed payload/configuration failures. Invalidate only the exact rejected token revision so a late failure cannot disable its replacement. Do not retry disabled/deleted/detached recipients. Preserve visible terminal failure and alerting after exhaustion. Mark an event settled only when its targets are delivered, skipped/cancelled, or terminally failed; enqueue failure and send failure are different states. Existing shipped status names must not be silently renamed; new fields/statuses require reviewed migration/contract impact.

FCM acceptance is not proof of display. If a worker dies after acceptance but before storing success, a retry may duplicate the message. Use stable event/delivery IDs for client-side deduplication and safe taps; generic OS notifications may still duplicate. Promise durable bounded attempts with recorded outcomes, not exactly-once or guaranteed display. [FCM error guidance](https://firebase.google.com/docs/cloud-messaging/error-codes) supports error-specific backoff. [FCM token guidance](https://firebase.google.com/docs/cloud-messaging/manage-tokens) cautions that `INVALID_ARGUMENT` can also indicate invalid payload.

For managed clients, include minimal opaque `notification_id`, `recipient_user_id`, `installation_id`, `binding_revision`, and payload schema version as FCM string data. Do not include phone, address, amounts, credentials, or arbitrary navigation URLs. Use generic localized display text; fetch protected details from the inbox API after session verification. Validate recipient and binding before foreground handling, tap navigation, or private refresh. Drop old-account payloads; a legacy payload without ownership metadata cannot authorize private navigation and may only trigger a current-session inbox check after reconciliation. The background isolate must not restore credentials or mutate authenticated state.

Clear app-owned delivered notifications locally on logout/deletion where platform APIs permit, but never claim this recalls a provider-queued message. Short, business-appropriate TTL limits stale display. Backend checks immediately before dispatch and detached-binding cancellation reduce leakage; they cannot undo a send already in progress. Existing SSE consumers also need revocation-aware closure. Flutter can continue polling and explicit `/me` reconciliation; no new real-time infrastructure is required.

## 13. Proposed API Contracts

### 13.1 EXISTING CONTRACT — verified API 14.2.0

Routes below are relative to the existing `/api/v1` prefix. Existing behavior is not an authorization to invent additional wire fields in Mobile.

| Method / route | Authentication and existing input | Existing response / behavior |
| --- | --- | --- |
| `POST /auth/request-otp` | Public, rate limited; `phone` | 200 `otp_sent`; development-only `dev_otp`; 422/429 |
| `POST /auth/verify-otp` | Public OTP proof; `phone`, `code`, optional `client` | 200 `AuthTokens` with user; 401/422 |
| `POST /auth/refresh` | Refresh JWT in `refresh_token`; no access bearer required | 200 new access/refresh pair; 401/422 |
| `POST /auth/logout` | Refresh JWT in `refresh_token` | 201 on revocation of that refresh row; 401/422 |
| `GET /me` | Bearer | 200 `User`, 401; available for startup verification |
| `DELETE /me/account` | Customer app bearer; no body | 204; 401/403/409; existing blocker codes retained |
| `POST /devices/token` | Bearer; `token`, `platform`, optional `locale` | 201 `DeviceToken`; register/reactivate/reassign; 422 declared |
| `DELETE /devices/token` | Bearer; `token` in body or query | 204; owned token deactivated, 403/404; Mobile uses body |
| `GET/PATCH /me/notification-preferences` | Bearer; PATCH has `preferences[{type,channel,enabled}]` | Account-wide effective matrix; not installation-scoped |
| `GET /me/notifications`, unread/read operations | Bearer, existing paging/read inputs | Shared durable inbox and unread/read state; preserve |

Some implementation errors are not exhaustively declared on affected routes. BE-014 must reconcile these during the authorized contract change; this document does not silently correct OpenAPI.

### 13.2 PROPOSED CONTRACT — not implemented

All proposed fields, codes, routes, and semantics below require Haider's contract review. Use existing endpoints where suitable. Do not create another current-user endpoint or separate token/preference APIs when one installation resource suffices.

**Shared rules:**

- IDs are UUID strings; timestamps are UTC RFC 3339 instants. `version` and `binding_revision` are positive integers. No user-supplied `user_id` or role chooses ownership.
- Keep the existing `{status, code, message, errors}` error envelope and strict response schemas. Human-readable server text is not UI copy.
- New installation operations require an active customer session with matching installation and an `Installation-Proof` header containing the continuity secret over TLS. Redact the header everywhere. Hash comparison is constant-time. This is additional continuity proof, never a replacement for authentication.
- Mutating installation requests carry `operation_id` and `expected_version`; omitted PATCH fields are unchanged, explicit `fcm_token:null` removes the routing association, and `push_enabled:null` is invalid. Exact operation replay returns the recorded result before stale-version checks, but only after current ownership/revocation checks. Changed payload with the same operation ID returns 409.
- New codes proposed here: `ACCOUNT_UNAVAILABLE`, `SESSION_REVOKED`, `ACCESS_TOKEN_EXPIRED`, `REFRESH_REUSED`, `REFRESH_RECOVERY_EXPIRED`, `REAUTH_REQUIRED`, `INSTALLATION_PROOF_INVALID`, `INSTALLATION_CONFLICT`, `BINDING_CHANGED`, `STALE_INSTALLATION_VERSION`, `DEVICE_BINDING_CONFLICT`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `OPERATION_IN_PROGRESS`, `TEMPORARILY_UNAVAILABLE`. None is claimed to exist today. Continue generic `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, and `RATE_LIMITED` where appropriate.
- For protected routes, authentication failures remain HTTP 401. A verified deleted/inactive subject may receive `ACCOUNT_UNAVAILABLE`; revoked session receives `SESSION_REVOKED`; expired access receives `ACCESS_TOKEN_EXPIRED`. Public OTP responses must not disclose whether a phone belonged to a deleted account. Rate limits and validation errors do not trigger logout. A generic 403 never means invalid credentials.
- No endpoint returns an FCM token or continuity secret in installation representations. HTTP 503 denotes retryable infrastructure unavailability; it never certifies a mutation failed to commit.

**Common proposed `InstallationState` response:** `installation_id`, `platform`, `locale`, `version`, `binding_revision`, `push_enabled`, `consented_for_current_account`, `os_permission`, `registration_state`, `effective_push_enabled`, and `updated_at`. `os_permission` is one of `unknown`, `not_determined`, `authorized`, `provisional`, `denied`, `denied_permanently`; `registration_state` is one of `pending`, `registered`, `invalid`, `detached`. These are new schema values, not renames of shipped enums. Effective state combines server conditions and last reported permission; Mobile additionally uses its current native observation. It is not a delivery receipt or a statement that every account-wide notification category is on.

| ID | Proposed operation | Input and response | Auth, ownership, errors | Idempotency, concurrency, compatibility, Mobile behavior |
| --- | --- | --- | --- | --- |
| P01 | Extend `POST /auth/verify-otp` | Existing fields plus optional all-or-none `installation_id`, `installation_secret`, `operation_id`. Managed response retains tokens/user and adds `session_id`, `session_expires_at`, `revocation_token`, `revocation_expires_at`. | Valid OTP plus continuity proof for an existing installation. 401 `UNAUTHORIZED`; 409 `INSTALLATION_CONFLICT`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `OPERATION_IN_PROGRESS`; 422/429/503. | Consume OTP, bind installation, replace its prior session, and issue credentials under one lifecycle transaction. Exact accepted operation can recover its encrypted response within the agreed short window with matching proof; no different OTP replay. Legacy request/response shapes preserved when managed fields absent. Ahmed commits the complete owned response atomically. |
| P02 | Extend `POST /auth/refresh` | Existing `refresh_token`; managed clients also send `operation_id` and `Installation-Proof`. 200 access/refresh pair plus stable `session_id` and `session_expires_at` for managed requests. | Refresh hash/JWT, account/session state, installation proof. 401 `UNAUTHORIZED`, `ACCOUNT_UNAVAILABLE`, `SESSION_REVOKED`, `REFRESH_REUSED`, `REFRESH_RECOVERY_EXPIRED`; 403 `INSTALLATION_PROOF_INVALID`; 409 mismatch/in-progress; 422/429/503. | Section 8 exact-response recovery; one successor per generation, no broad grace. Return metadata only under the published managed variant. Legacy callers keep strict one-use rotation during migration. Mobile persists operation before sending and never launches a new rotation while unresolved. Revocation capability from login remains valid only to its fixed session horizon. |
| P03 | Extend `POST /auth/logout` | Preserve legacy `{refresh_token}`; add exclusive managed `{session_id, revocation_token}`. Legacy success 201; managed success 204, no body. | Valid legacy refresh or purpose-limited capability; no active access bearer required. 401 invalid/expired capability, 422 malformed, 429/503. No capability allows reading or logging in. | Revoke stable family and detach its binding atomically; repeated valid managed request returns 204 through bounded tombstone retention. Concurrent refresh cannot escape revocation. Never affect a different current installation binding. Mobile queues only capability-based cleanup and stops on terminal results. |
| P04 | Preserve `GET /me`; clarify auth failures | No new request/response fields; 200 existing `User`. | Active bearer with subject/version/session checks. Declare 401 `ACCESS_TOKEN_EXPIRED`, `ACCOUNT_UNAVAILABLE`, `SESSION_REVOKED`, `UNAUTHORIZED`; 503 transient. | Read-only. No cache may mask revocation. Existing clients retain generic 401 handling; upgraded Mobile refreshes only eligible failures and clears terminal invalidation. Reuse for startup/resume/reconnect. |
| P05 | New `DELETE /me/sessions/{session_id}` | UUID path, no body; 204. | Authenticated same user and compatible surface; ownership verified server-side. 401 auth codes, 403 `FORBIDDEN`, 404 `NOT_FOUND` for inaccessible/unknown target, 503. | Idempotent for an already revoked owned target while caller remains authenticated. Lock session; revoke family and binding. Self-revocation subsequently invalidates caller. Session listing/UI is optional; callers/tests can use known session IDs. Other clients unaffected. |
| P06 | New `POST /me/sessions/revoke-all` | No body; 204; includes current session. | Same-account active customer bearer with recent verified authentication. 401 auth codes; 403 `REAUTH_REQUIRED`; 503. | Atomic version bump, revoke every session and detach every account binding. Repeated call after success may return terminal 401; never silently treat it as fresh authorization. Mobile clears local auth and reconciles uncertainty. Define recent-auth window in Phase 1. No new OTP verification bypass. |
| P07 | New `PUT /me/installations/{installation_id}` | `operation_id`, `expected_version`, `platform`, `locale`, `os_permission`, optional `fcm_token`; **no implicit preference activation**. 200 `InstallationState`. | Matching active session/installation and proof; record exists from P01. Common auth codes; 403 proof failure; 404 unknown; 409 binding/version/device-token conflict, mismatch/in-progress; 422/429/503. | Register/update current routing association and observations. Preserve preference and consent. One active routing association per installation and globally unique token; no cross-owner token stealing. Managed opt-in is P09. Old device endpoints retained for legacy-only records. |
| P08 | New `GET /me/installations/{installation_id}` | No body; 200 `InstallationState`. | Matching session/installation, bearer, proof. Common auth codes; 403 proof failure; 404 unknown/inaccessible; 409 `BINDING_CHANGED`; 503. | Read-only reconciliation; no registration or reactivation side effect. Mobile reads before rendering a confirmed state and after an uncertain write. |
| P09 | New `PATCH /me/installations/{installation_id}` | `operation_id`, `expected_version`; at least one of `push_enabled`, `fcm_token`, `os_permission`, `locale`. 200 `InstallationState`. | Matching active session/binding and proof. Common auth codes; 403 proof failure; 404 unknown; 409 version/binding/token conflict, mismatch/in-progress; 422/429/503. | Explicit `push_enabled:true` grants consent to the current account; false blocks future eligible attempts. Token-only updates never alter consent/preference. Versioned mutation and stored exact replay avoid toggle inversion. Read after 409; do not blindly replay against a new version. |
| P10 | New `DELETE /me/installations/{installation_id}` | Body `operation_id`, `expected_version`; 204. | Matching active session and proof. Common auth codes; 403 proof failure; 404 inaccessible; 409 stale version/binding/mismatch/in-progress; 422/503. | Detach routing/account binding, retain device preference and current session's ability to reattach explicitly. Does not revoke OS permission or delete the Firebase token. Repeated same operation is 204 under unchanged ownership. Logout normally uses P03 rather than depending on this bearer-only route. |
| P11 | Preserve `DELETE /me/account`; harden semantics | No body; 204 on confirmed commit; existing 409 blockers unchanged. | Customer session. 401 auth codes including `ACCOUNT_UNAVAILABLE`; 403 forbidden; 409 existing blocker; 503 declared retryable contention/unavailability. | Atomic deletion rules in section 9. Repeated invalid-account request is terminal 401, not a public deletion receipt. Normalize racing service 404. Mobile reconciles lost response without automatic mutation retry or false success. |

P07/P09 share repository/controller logic; separate routes for every preference/token action are unnecessary. P10 is explicit binding management; it must not be used as a substitute for session logout. Deletion and session-revocation endpoints do not modify the inbox history of surviving accounts.

### 13.3 Compatibility and migration

**Proposed:** additive schema rollout first, then server support, then upgraded Mobile, then a documented legacy cutoff. Haider owns OpenAPI semver selection, response validation, all affected error declarations, Prisma migrations, `infra/db/schema.sql`, generated `web/` and `admin/` types, and Mobile migration notes. Any behavior change that cannot remain compatible requires a major version or an explicit protocol/version transition; do not label it non-breaking merely because fields are optional.

Backfill each active legacy refresh record as a distinct session; do not infer device identity from phone/token. New logins and rotations can issue `sid` internally even for old clients whose response shape stays unchanged. Legacy access tokens without `sid` have no single-session revocation mapping. Account deletion still uses active-user/version checks immediately, but full individual revocation cannot be claimed until those tokens expire or are explicitly retired. Verify configured maximum access lifetime before choosing the cutoff. No automatic global logout is authorized by this document.

Do not merge legacy device rows by guessed installation. Migrate only a proven current binding; otherwise establish a new managed installation with explicit consent. Once a token belongs to a managed installation, legacy `POST /devices/token` must not reactivate or reassign it around the new checks. Declare its conflict/upgrade behavior and test old web/admin/Mobile consumers. Legacy refresh recovery remains strict unless its client supports the new proof/operation protocol. Rollback must never re-enable deleted accounts, revoked sessions, or disabled installations.

## 14. Backend Implementation Plan — Haider

**BACKEND IMPLEMENTATION PLAN — HAIDER**

All entries are **proposed architecture/work**, not implemented changes. P0 means security/identity correctness and prerequisite; P1 means required Release 1 integration/reliability. Haider owns Backend code, contracts, database changes, generated web/admin types, and Backend tests. No Flutter implementation is assigned here.

### BE-001 — P0 — Agree the lifecycle and contract specification

- **Existing → required:** E01/E02/E05 provide separate mechanisms; agree stable session, installation, deletion boundary, recovery, consent, and compatibility rules from sections 7–13.
- **Components:** `api/openapi.yaml`, migration notes, retention and release documentation; decision record in the authorized implementation workflow.
- **Dependencies:** none; decisions O01–O09 in section 21.
- **Acceptance:** signed-off schemas, lock order, error/action table, ownership rules, rollout/cutoff, and security threat cases are unambiguous; no Mobile-only workaround is required.
- **Tests:** contract examples and negative cases reviewed before coding.
- **API impact:** P01–P11 specified; semver chosen explicitly. **Migration impact:** reviewed model/index/backfill plan, no migration execution at this step.

### BE-002 — P0 — Stable sessions and revocable access validation

- **Existing → required:** E02/E04 only track rotating refresh rows; add `AuthSession`, stable `sid`, expiry/revocation and indexed account/session validation.
- **Components:** auth service/DTOs, JWT strategy, guards, Prisma schema, SQL reference.
- **Dependencies:** BE-001.
- **Acceptance:** A/B/C have different sessions; all rotations retain their own `sid`; revoking A rejects its existing access token on the next authorization check without rejecting B/C; account/version checks remain mandatory.
- **Tests:** unit claims/validation, real-DB ownership/expiry, cross-surface misuse, and latency/query-plan benchmarks.
- **API impact:** managed metadata in P01/P02; auth errors on protected routes. **Migration impact:** session table, refresh relation/indexes, revocation capability hash and tombstones.

### BE-003 — P0 — Atomic OTP and installation-aware session creation

- **Existing → required:** phone-scoped challenge consumption and token issuance outside user transaction; serialize issuance/verification and bind a new session safely under lifecycle locks.
- **Components:** `AuthService.requestOtp/verifyOtp/issueTokenPair`, OTP DTOs, rate-limit integration.
- **Dependencies:** BE-002, BE-007.
- **Acceptance:** normal login leaves other installations active; same-installation account replacement revokes its old session and detaches push; simultaneous OTP/creation does not duplicate users or reuse a code; deleted identity cannot receive a new usable session through a stale request.
- **Tests:** parallel issuance/verification, same-phone first creation, expired/consumed OTP, transfer proof mismatch, deletion race, lost accepted-login response.
- **API impact:** P01. **Migration impact:** accepted-login operation record using the bounded encrypted-result mechanism, plus constraints from BE-002/007.

### BE-004 — P0 — Refresh family protection and bounded recovery

- **Existing → required:** strict row rotation loses responses and lacks family replay revocation; implement section 8.2 with one successor and exact authenticated recovery.
- **Components:** refresh service/DTOs, session repository, encryption/key configuration, operation expiry job.
- **Dependencies:** BE-002, BE-007; BE-001 security decision required.
- **Acceptance:** identical retry yields identical pair without extending expiry; changed operation cannot use a spent token; validated reuse revokes only that session family; deleted/revoked sessions cannot recover cached tokens.
- **Tests:** lost response, parallel same/different operations, stolen-token-only attempt, ciphertext expiry, restart, logout/deletion races, key unavailability, replay after TTL.
- **API impact:** P02 and recovery errors. **Migration impact:** predecessor/generation and operation fingerprint, encrypted response, expiry indexes; ordinary token storage remains hashed.

### BE-005 — P0 — Session-specific, all-session, and durable logout revocation

- **Existing → required:** one-refresh logout; revoke stable families and their installation bindings with a purpose-limited capability for offline cleanup.
- **Components:** auth/session controllers/services, audit, session and binding repositories.
- **Dependencies:** BE-002, BE-007.
- **Acceptance:** P03 valid replay remains safe; cleanup for A cannot detach B's newer binding; P05 affects only owned target; P06 revokes every account session including caller; a racing refresh cannot escape.
- **Tests:** expired access with capability, repeated logout, wrong capability/subject/surface, selected/all revocation, offline retry, tombstone expiry, refresh race.
- **API impact:** P03/P05/P06. **Migration impact:** capability hashes, bounded revocation tombstones, binding detachment metadata; no stored ordinary bearer for retries.

### BE-006 — P0 — Cross-device deletion and lifecycle transaction enforcement

- **Existing → required:** retain serializable anonymization and blockers; coordinate session creation/rotation, registration, protected writes, queued work, and long-lived connections with deletion.
- **Components:** `MeService`, auth/session services, notifications/stream services, account-sensitive mutation entry points, retention documentation.
- **Dependencies:** BE-002, BE-005, BE-007.
- **Acceptance:** section 9 A/B/C scenario; old access/refresh cannot authorize after commit; no post-delete binding/usable token creation; old phone creates a different account; repeat/concurrent error semantics match P11. Document in-flight response/FCM limits.
- **Tests:** real transactions with barriers for deletion versus refresh/OTP/register/order mutation; 409 blockers; 204 lost response; recreation; cancellation/stream closure; retained snapshots unchanged.
- **API impact:** P04/P11 terminal errors, preserve blocker vocabulary. **Migration impact:** cancellation/cleanup state as needed; no destructive history rewrite; any privacy cleanup beyond approved policy requires owner approval.

### BE-007 — P0 — Installation identity and continuity ownership

- **Existing → required:** token-only identity; add stable installation and proof digest independent of user/session/token.
- **Components:** Prisma/SQL models, focused installation service, auth binding interface.
- **Dependencies:** BE-001; can proceed alongside BE-002.
- **Acceptance:** same ID survives token rotation; ID alone cannot claim an existing installation; account transfer requires OTP-authenticated session and correct proof; duplicate/restored IDs fail safely; preference and binding revisions are independent.
- **Tests:** random-ID creation, wrong/missing proof, transfer, clone conflicts, global token uniqueness, deleted-account unlink, session-independent disable state.
- **API impact:** shared identity/proof definitions for P01/P07–P10. **Migration impact:** installation table, proof hash, binding revision, consent owner, preference, uniqueness/indexes and nullable legacy mapping.

### BE-008 — P0 — Readable per-installation preferences and token lifecycle

- **Existing → required:** POST always activates; implement versioned P07–P10 preserving explicit preference on automatic updates and token invalidation.
- **Components:** notifications controller/DTOs/service, installation repository, device registration migration adapter.
- **Dependencies:** BE-002, BE-007.
- **Acceptance:** disabling B leaves A/C untouched; GET has no activation effect; token-only updates preserve disabled; explicit re-enable affects one binding; wrong-owner/version requests fail; legacy routes cannot bypass managed opt-out.
- **Tests:** A/B/C matrix, same-operation replay, changed payload, token rotation while off, stale deletion cleanup, 404/409 ownership, missing/null/omitted fields, offline uncertainty readback.
- **API impact:** P07–P10 and explicit legacy conflicts. **Migration impact:** version/operation records and token relation; no automatic consent inferred from existing OS permission.

### BE-009 — P0 — Recipient isolation, deletion cancellation, and payload safety

- **Existing → required:** recipient inferred from token snapshot and payload lacks binding metadata; validate active account/session/binding at send boundary and carry minimal ownership metadata.
- **Components:** notification service/provider/types, stream service, cancellation hooks, audit.
- **Dependencies:** BE-005, BE-006, BE-008.
- **Acceptance:** unsent old-account targets are cancelled; no new eligible target after detachment; stale token errors do not deactivate a new binding; generic payload plus opaque recipient/version metadata; SSE closes on invalidation. Already accepted FCM messages are explicitly outside recall guarantees.
- **Tests:** delayed worker after switch/deletion, stale recipient snapshot, binding-version mismatch, missing legacy metadata, stream invalidation, sensitive-field exclusion.
- **API impact:** versioned FCM payload agreement, no arbitrary route strings. **Migration impact:** target binding/version and cancellation fields, scoped to existing outbox design.

### BE-010 — P1 — Durable per-target delivery attempts and retries

- **Existing → required:** failures swallowed before event completion; persist target attempts/leases and distinguish retryable, permanent, and configuration failures.
- **Components:** notification processor/service/provider, BullMQ scheduling, notification logs/outbox.
- **Dependencies:** BE-008; BE-009 required before integration acceptance.
- **Acceptance:** 429/5xx/timeouts retry with bounded backoff and Retry-After; permanent token failure retires exact revision; event is not prematurely settled; crash recovery and duplicate limitations are observable.
- **Tests:** gateway stubs, lease contention/expiry, worker crash before/after acceptance, invalid payload versus token, queue failure, multi-target partial success, exhausted retries, disable/delete while queued.
- **API impact:** preserve inbox API; reviewed internal delivery schema, FCM payload IDs. **Migration impact:** attempt counts, retry time, lease/cancellation/delivery identity; preserve shipped status values unless explicitly versioned.

### BE-011 — P0 — Migration, legacy compatibility, and safe rollout

- **Existing → required:** legacy refresh and device rows have no stable relation; expand/backfill without guessing devices or re-enabling opt-outs.
- **Components:** new Prisma migrations, `infra/db/schema.sql`, deployment procedures, compatibility adapters.
- **Dependencies:** BE-002, BE-007; final validation after BE-003–BE-010.
- **Acceptance:** migration is repeatably verified on representative upgrade data; active legacy refresh rows remain independently mapped; sid-less access cutoff is explicit; rollback cannot undo deletion/revocation; managed preferences cannot be bypassed by old clients.
- **Tests:** clean database and upgrade path, mixed versions, maximum-TTL cutoff, rollback constraints, index/locking performance, duplicated legacy data.
- **API impact:** compatibility/error matrix and Mobile migration note. **Migration impact:** additive then constrained rollout; never apply clean bootstrap SQL as an upgrade.

### BE-012 — P1 — Security observability and redaction

- **Existing → required:** partial audits and raw gateway error strings; structured sanitized session, cleanup, and delivery telemetry.
- **Components:** auth audit, notification provider/service, API logging, metrics and alert configuration.
- **Dependencies:** BE-001; instrument BE-004/005/006/009/010 as they land.
- **Acceptance:** trace operations by opaque IDs; measure replay rejection, cleanup lag, deletion rejection, retry exhaustion and duplicate-risk windows; no secrets/payload/customer identity in logs; operator alerts distinguish configuration failure from invalid token.
- **Tests:** injected sensitive provider errors, header/body redaction, production mode, retention/expiry jobs, telemetry failure isolation.
- **API impact:** none beyond already specified stable error codes. **Migration impact:** minimal sanitized audit/attempt fields and agreed retention, not indefinite raw payload storage.

### BE-013 — P0 — Backend security and concurrency verification

- **Existing → required:** E19/E20 cover core behavior; add the complete Backend matrix in section 18, especially real-DB races and multi-device deletion.
- **Components:** auth/me/notification unit suites, acceptance packs, fake FCM transport, transaction test harness.
- **Dependencies:** BE-003–BE-010; tests may be prepared from BE-001.
- **Acceptance:** deterministic A/B/C and attack scenarios pass on a unique throwaway `shubayr_*_verify` database; cleanup drops it and stops started containers; failures are not hidden by mocked transactions.
- **Tests:** BU/BI/CT rows in section 18, old/new consumers, no accidental cross-account data access.
- **API impact:** verifies all contract variants and errors. **Migration impact:** exercises BE-011; test fixtures never alter shared databases.

### BE-014 — P0 — Publish strict contracts and integration readiness

- **Existing → required:** 14.2.0 has no new primitives; publish reviewed schemas and migration guidance only after implementation matches.
- **Components:** OpenAPI, `web/` and `admin/` generated types, strict-schema checks, docs/mobile contract migration note, deployment handoff.
- **Dependencies:** BE-001, BE-011, BE-013; contract drafts precede implementation under BE-001.
- **Acceptance:** types and no-undeclared-property validation pass; each route declares its errors; semver/breaking behavior and compatibility window are explicit; Haider provides a test deployment and fixtures to Ahmed; breaking changes satisfy web/admin live-suite gates.
- **Tests:** CT matrix, CI drift, route coverage, mixed-client smoke tests; no claim that a schema publish proves device delivery.
- **API impact:** official P01–P11 baseline replaces proposals after approval. **Migration impact:** release notes pair deployed schema and migration revision; no Mobile code changes in Haider's work.

## 15. Flutter Mobile Implementation Plan — Ahmed

**FLUTTER MOBILE IMPLEMENTATION PLAN — AHMED**

All entries are **proposed work** within `mobile/`. Use screen → Riverpod controller/provider → repository → `ApiClient`; preserve revision ownership, secure credential ownership, role guards, and current public browsing. Ahmed does not implement Backend endpoints, migrations, or shared contract changes. New storage/security/dependency choices require the approved Phase 1 design.

### MB-001 — P0 — Installation identity and storage lifecycle

- **Existing → required:** no installation record; add random ID, separate continuity secret, fresh-install marker, and explicit backup/migration policy from section 10.
- **Components:** focused installation storage under `core/storage` or notification data as appropriate; native Android backup rules and iOS storage configuration; no credential duplication in preferences.
- **Backend dependencies:** BE-001/007 specification; no live Backend needed for storage implementation.
- **Acceptance:** restart/update preserve identity; logout and FCM rotation do not reset it; reinstall/restore ambiguity cannot restore prior auth or silently enable push; storage errors produce unresolved state, not a fabricated new owner.
- **Tests:** unit corruption/partial write/restart, platform storage adapters, physical reinstall/backup/device-transfer tests with explicit evidence.

### MB-002 — P0 — Session metadata and secure atomic credential commits

- **Existing → required:** access/refresh pair stored through one revision owner; add session/installation association and revocation metadata to the same owned secure commit model.
- **Components:** `TokenStore`, `SessionCredentials`, auth response decoding/repository, `SessionController`.
- **Backend dependencies:** BE-002/003 and P01/P02 schemas; preparation against explicit fixtures can start after BE-001.
- **Acceptance:** token pair and session metadata never belong to different owners; no controller reads a half-committed envelope; new-account/same-account-login revisions reject old replies; login candidates pass `/me` before publishing identity; legacy stored credentials migrate only under the agreed compatibility path.
- **Tests:** partial writes, process interruption, unavailable secure storage, same token text across accounts, logout during commit, delayed pre-deletion login response, legacy record restoration.

### MB-003 — P0 — Owned refresh coordination and uncertain-response recovery

- **Existing → required:** shared refresh and one retry exist; persist and reuse exact operation identity, handle stable session errors, and recover only through P02.
- **Components:** `api_client.dart`, `auth_interceptor.dart`, `SessionCredentials`, focused secure operation journal.
- **Backend dependencies:** BE-004/014; MB-001/002.
- **Acceptance:** one refresh per owner; retry after timeout/process restart uses the same operation; no old owner commits after logout/switch; 401 terminal codes clear only their owner; 5xx/network/malformed response retain unresolved recovery; expired recovery requires OTP without loops.
- **Tests:** concurrent requests, lost response, secure-journal failure, crash before/after commit, terminal versus transport errors, logout/deletion during recovery, exact replay response.

### MB-004 — P0 — Startup, resume, reconnect, and deleted-account reconciliation

- **Existing → required:** startup `/me` and incidental polling failures detect invalidity; add a single application-owned foreground authentication reconciliation gate.
- **Components:** session controller, `app/` lifecycle composition, router/role guard, account-private provider ownership, existing polling activation.
- **Backend dependencies:** existing `GET /me` supports independent implementation; BE-002/006/014 add target error semantics. Coordinate MB-002/003.
- **Acceptance:** private UI is unresolved before resume verification; deleted/revoked account clears local state and routes to sign-in/welcome; transient failure preserves credentials, hides/gates private UI, and offers retry/public browsing; reconnect reconciles without relying only on token expiry or FCM. Coalesce duplicate lifecycle signals and the proposed 30-second foreground authentication heartbeat independently of badge visibility.
- **Tests:** A/B/C fixtures, offline resume/reconnect, background while checking, old response after switch, repeated 401, non-auth 403, startup failure, no stale profile flash, no duplicate polling/refresh loops.

### MB-005 — P0 — Durable logout and safe account replacement

- **Existing → required:** cleanup is best effort and direct OTP replacement does not revoke old refresh; journal purpose-limited revocation and separate immediate local sign-out from eventual remote confirmation.
- **Components:** session controller/exit tasks, secure cleanup journal, push lifecycle, diagnostics; keep controllers free of navigation contexts.
- **Backend dependencies:** BE-003/005, P01/P03; MB-001/002.
- **Acceptance:** old session cannot restore after logout even if storage deletion is interrupted; offline cleanup retries use only old session capability; new bearer is never borrowed; switching accounts detaches old binding; failure does not falsely claim remote revocation. Disable-in-app does not call this destructive FCM cleanup path.
- **Tests:** offline logout, retry after restart, capability expiry, secure-store failure/tombstone, direct OTP replacement, overlap with refresh and registration, late A cleanup while B is active.

### MB-006 — P0 — Account-deletion initiation and uncertain outcome

- **Existing → required:** successful 204 cleanup and bilingual blockers already exist; extend to lost-response reconciliation and the new invalidation/navigation requirements.
- **Components:** account action UI, session controller, `PendingRequestStore`, auth repository/failure localization, session exit tasks.
- **Backend dependencies:** existing deletion route for independent preparation; BE-006/014 for final P11 behavior; MB-004/005.
- **Acceptance:** 409 preserves identity and displays all blockers; 204 clears only deleted account state/journals and signs out; timeout does not claim success or blindly resend; terminal account-unavailable after uncertainty clears auth without claiming a confirmed delete; a new same-phone user remains isolated.
- **Tests:** current deletion tests extended for lost 204, repeated/concurrent deletion, storage failure after commit, remote deletion, switch while pending, new-account recreation, pending private mutations.

### MB-007 — P0 — Riverpod installation preference state and reconciliation

- **Existing → required:** only busy state and permission result; add one state owner for intent, confirmed version, permission, binding, registration, and errors.
- **Components:** notification controller/providers and installation repository through `ApiClient`; focused persistence using MB-001 storage.
- **Backend dependencies:** BE-008/014 P07–P10; MB-001/002/004.
- **Acceptance:** state follows section 11; no local-only success; exact operation serialization and readback after uncertainty; no account-wide preference write; disabled intent survives restart/rotation/resume; local storage failure cannot silently reset to enabled.
- **Tests:** intent ordering, duplicate taps, pending disable offline, token update versus toggle, stale version readback, mixed account/revision responses, confirmed versus unknown rendering inputs.

### MB-008 — P0 — Firebase registration lifecycle respecting installation consent

- **Existing → required:** automatic register reactivates and permission loss may delete token; separate token/permission observation from explicit activation and session cleanup.
- **Components:** `PushLifecycle`, `PushClient`, device/installation repositories and push providers.
- **Backend dependencies:** BE-007/008/014; MB-001/002/007.
- **Acceptance:** startup/resume/token refresh/locale updates never change disabled preference; APNs pending is distinct; update current token while preserving opt-out; successful ordinary disable retains Firebase token; cleanup on sign-out/account deletion follows MB-005/006; registrations wait for verified session ownership.
- **Tests:** cold restart with old server registration, rotation while disabled, delayed token/APNs, network rejection, old-token invalidation, rapid resume and account changes, optional Firebase configuration unavailable.

### MB-009 — P1 — Permission states, first-use offer, and Settings return

- **Existing → required:** Account action requests permission and collapses statuses; preserve platform-specific details and implement deliberate first-appropriate-experience offer.
- **Components:** Firebase adapter/domain permission model, focused native/settings opener, first-use presentation/localized resources.
- **Backend dependencies:** none for native/UX preparation; BE-008 permission schema for reporting; MB-007/008 for final integration.
- **Acceptance:** no repeated automatic prompt after denial; no guest-owned registration; Android requestable/permanent denial differs; iOS provisional is described as quiet; Settings return rechecks; OS permission cannot silently override app opt-out. Dependency additions, if necessary, remain scoped and approved.
- **Tests:** adapter state matrix, first offer/dismiss persistence, settings-open failure, OS changes, APNs pending; physical Android/iOS permission checks.

### MB-010 — P1 — Account Switch, bell, and inbox navigation affordance

- **Existing → required:** action tile with chevron becomes a state-backed Switch; inbox keeps route and badge with a directional chevron.
- **Components:** `account_view.dart`, `push_permission_tile.dart`, notification badge widget only if focused reuse is justified, ARB/generated localization.
- **Backend dependencies:** no live dependency for fixture-based UI; BE-008/014 and MB-007/009 required before enabling production interaction.
- **Acceptance:** section 11.3 labels, matching bell/Switch state, existing design tokens, permission explanation/Settings action, accurate loading/error/unknown states, no false success, unchanged inbox/history and Home badge behavior.
- **Tests:** Arabic/English and RTL/LTR, light/dark, narrow/large-text layouts, screen-reader semantics, badge count, navigation, mutation failure, synchronized icon/Switch updates.

### MB-011 — P0 — Validate notification recipient and safe tap behavior

- **Existing → required:** generic event is assigned current owner; retain and validate minimal payload metadata against the verified account/installation/binding before action.
- **Components:** Firebase event model, push lifecycle/bridge, notification destination and navigation tests.
- **Backend dependencies:** BE-009/014 payload schema; MB-001/002/004/007.
- **Acceptance:** A payload while B is active cannot open A data, mark it read, or trigger A-account work; legacy/malformed payloads never authorize private routes; cold-start taps wait for reconciliation; event-ID dedup is owner-scoped; background handler never restores auth. Local tray cleanup is best effort with explicit OS limitations.
- **Tests:** delayed A payload, missing/wrong binding, duplicate event, expired session tap, cold-start deletion, foreground/background ownership; physical notification tray/tap acceptance.

### MB-012 — P0 — Mobile regression and integration automation

- **Existing → required:** E21/E22 cover foundations; extend unit/widget/API-boundary tests for the complete new lifecycle without replacing real-DB Backend tests.
- **Components:** auth/storage/network/notification tests, account widgets, test fixtures and fake plugin adapters.
- **Backend dependencies:** approved BE-001 schemas for fixtures; BE-014 staging contract for integration. Prepare while implementation proceeds.
- **Acceptance:** MU/MW/CT integration cases pass, analyzer and formatting checks pass, full suite runs once at final verification for this cross-feature change; failures and skips are explicit; generated localization/models are reproducible and unrelated outputs preserved.
- **Tests:** section 18, plus existing session, account deletion, inbox navigation, home badge, checkout/account isolation regressions.

### MB-013 — P1 — Physical-device and release integration evidence

- **Existing → required:** historical iPhone Console results are partial; verify Backend-originated scenarios on current signed iOS/Android builds and record exact build/API/migration versions.
- **Components:** Mobile release checklist and approved test configuration; no production secrets committed.
- **Backend dependencies:** BE-014 deployment/fixtures and BE-012 observability; MB-003–MB-012 complete.
- **Acceptance:** physical A/B/C deletion, different push preferences, offline reconnect, token/permission lifecycle, Backend-originated foreground/background/cold-start receipt and taps; verified APNs distribution configuration and Android signing; unresolved security failures block release.
- **Tests:** PD matrix below; Ahmed owns device execution, Haider provides server observability and fixture support, and shared outcomes are recorded jointly.

## 16. Shared Integration Requirements

**SHARED BACKEND–MOBILE INTEGRATION REQUIREMENTS**

These **12 integration dependencies** specify handoffs, not reassignment of code ownership. Haider implements the server side; Ahmed implements Flutter consumers. Contract drafting can be shared, but only Haider publishes Backend contracts. No messages or work assignments are sent by creating this plan.

| ID | Backend → Mobile tasks | Endpoint / payload and required behavior | Errors and sequencing | Compatibility and integration acceptance |
| --- | --- | --- | --- | --- |
| INT-01 | BE-001/002/003/007/014 → MB-001/002 | P01 managed login returns one stable session and revocation capability bound to installation proof; user role remains server-owned. | Installation conflict cannot fall back to claiming someone else's ID; OTP/session transaction completes before secure commit. | Legacy shape retained; A/B/C get independent sessions; same-installation replacement changes only that installation. |
| INT-02 | BE-004/014 → MB-003 | P02 accepts persisted operation and proof; exact repeat returns same pair/session. | Save operation before network, commit owned pair before clearing journal; terminal codes clear auth, transport errors retain uncertainty. | Old clients use strict rotation; lost-response recovery and malicious replay must have distinct tests. |
| INT-03 | BE-005/014 → MB-005 | P03 capability-only logout revokes stable family and binding; P05 selected-session revocation affects only owned target. | Persist minimal cleanup before local wipe; late retry cannot affect newer binding; 204 acknowledged, terminal invalid/expired cleanup ends queue. | Preserve legacy logout; offline local sign-out stays final even when server retry is pending. |
| INT-04 | BE-002/005/006/014 → MB-004 | P04 `/me` enforces live session/account; P06 revokes all. | Resume/startup enters unresolved state, verify before push/private work; expired access may rotate once, revoked/deleted is terminal. | Generic legacy 401 remains handled; deleted A causes online B/C to reach unauthenticated UI before private content resumes. |
| INT-05 | BE-006/014 → MB-004/006 | P11 retains 204 and blockers, and declares terminal/concurrent outcomes. | Lost 204 triggers verification, not automatic delete retry; 409 retains session; unavailable after uncertainty clears without false deletion claim. | Existing endpoint retained; recreation has new user ID and inherits no old private state. |
| INT-06 | BE-007/008/014 → MB-001/007 | P07/P08 installation identity, proof, version, binding revision and readable preference. | Authenticate/bind through P01 before registration; wrong proof/ownership never transfers; unknown read state is not enabled. | Managed identities coexist with unmapped legacy tokens; restored-ID conflict cannot merge devices. |
| INT-07 | BE-008/014 → MB-007/010 | P09 explicit toggle returns confirmed `InstallationState`. | One owned mutation at a time; 409 fetches current state; timeout readback; no optimistic success. | Account-wide preferences remain untouched; B off leaves A/C on; history/badge still work. |
| INT-08 | BE-008/014 → MB-008 | P07/P09 token-only updates preserve preference; P10 detach does not erase Firebase token. | Wait for APNs/readiness and verified owner; stale token revision cannot overwrite a newer one. | Legacy POST cannot bypass managed opt-out; disabled survives token refresh/restart/resume. |
| INT-09 | BE-008/014 → MB-009/007 | P07/P09 report OS permission separately from explicit consent. | No automatic permission request from sync; settings return reads native state, then reports it without changing preference. | Versioned permission enums mapped at adapter boundary; provisional remains quiet, permanent denial opens Settings intentionally. |
| INT-10 | BE-009/014 → MB-011 | Versioned FCM ownership/event metadata; protected inbox remains authoritative. | Reconcile session before tap; drop recipient/binding mismatch; no payload-authorized route. | Generic legacy payload allowed only safe reconciliation; A-to-B late messages cannot reveal A data through Flutter. |
| INT-11 | BE-009/010/012 → MB-008/011/013 | Delivery attempts, stable notification IDs, eligibility cancellation and sanitized diagnostics; existing inbox API preserved. | Retryable failures back off, invalid token retires exact revision, already accepted sends explicitly uncertain. | Test worker crash and duplicates; dedup never assumes exactly-once provider delivery. |
| INT-12 | BE-011/013/014 → MB-012/013 | Published schema/migration baseline, mixed-client fixtures, release candidate deployment. | Contract tests before client integration; verify legacy cutoff and rollback; all P0 failures block release. | No circular dependency: Backend acceptance uses synthetic clients, Mobile initially uses approved fixtures, final physical acceptance joins them. |

## 17. Task Dependency Matrix

| Work package | Required predecessors | Work that can proceed in parallel | Completion / unblock |
| --- | --- | --- | --- |
| Architecture and contract decisions | None | BE-001; Ahmed reviews consumer and UX implications without coding Backend | Approved P01–P11 draft, state/error model, retention and security decisions |
| Session and installation foundations | BE-001 | BE-002 and BE-007; MB-001/002 fixtures/storage preparation | Stable models, proof and metadata schemas |
| Login, refresh, revocation | BE-002/007 | BE-003, BE-004, BE-005; MB-003/005 mocks | Implemented protocol slices and deterministic tests |
| Deletion and lifecycle enforcement | BE-002/005/007 | BE-006; MB-004/006 using existing `/me` and deletion contracts | Account invalidation, race outcomes, resume gate |
| Installation preference API | BE-002/007 | BE-008; MB-007 fixtures; MB-009 platform preparation | Read/update semantics and conflict handling |
| Isolation and reliable dispatch | BE-006/008 plus BE-005 | BE-009 and BE-010 skeletons; BE-012 telemetry | Eligibility, ownership payload, target retries |
| Mobile Firebase and Account UI integration | Published BE-008 slice; MB-001/002/004/007 | MB-008, MB-009, fixture-based MB-010; MB-011 after BE-009 payload | Confirmed Switch and safe taps |
| Migration and automated integration | Foundation migrations, implemented slices | BE-011 rehearsals, BE-013, MB-012 | Real-DB races and mixed-client contracts pass |
| Contract/deployment readiness | BE-011/013, all implemented contract slices | BE-014 prepares artifacts incrementally; no need to wait for physical tests to publish staging schemas | Staging baseline unblocks MB-013 |
| Physical acceptance and release | BE-014, MB-003–MB-012, configured physical devices | MB-013 with Haider's server support | Section 20 gates met |

**Independent Mobile work after design approval:** native permission mapping/settings handling and first-use UX preparation (MB-009), Account chevron/Switch fixture widgets (MB-010), `/me` reconciliation and deletion-uncertainty logic against current contracts (MB-004/006), storage tests (MB-001/002), and test scaffolding (MB-012). Production preference mutations, managed refresh recovery, and recipient payload integration remain blocked by their published Backend contracts. A fixture implementation is not permission to ship a local-only Switch.

Backend schema drafts are produced in BE-001 before coding; BE-014 is the final publication/conformance gate, not a circular prerequisite that prevents earlier contract-based preparation. Cross-platform end-to-end evidence comes after both independently testable sides exist.

## 18. Test and Acceptance Matrix

All rows below are **planned, not executed in this review**. Existing E19–E22 tests are foundations, not evidence that new scenarios already pass. Use controlled time, explicit concurrency barriers, and injected transport/storage failures. Backend acceptance must use a unique throwaway `shubayr_*_verify` database, drop it afterward, and stop only containers started for that run. Never use shared production data or raw tokens in evidence.

### 18.1 Backend unit tests — Haider

| ID | Scenario | Required assertion | Tasks |
| --- | --- | --- | --- |
| BU-01 | Claims/session validation | Subject, surface, version, sid, expiry and revocation all enforced; no client-selected role | BE-002 |
| BU-02 | OTP consume/issue | One consumed challenge; normal login does not globally revoke; invalid proof cannot bind | BE-003 |
| BU-03 | Rotation/replay classifier | One successor; exact recovery versus hostile reuse; no response after revocation | BE-004 |
| BU-04 | Logout capability | Can revoke only its session; cannot read, refresh or detach a newer binding | BE-005 |
| BU-05 | Deletion blockers/retention | Existing codes and all blocker entries; approved historical records preserved | BE-006 |
| BU-06 | Installation and payload eligibility | Explicit off survives token/permission update; metadata bound to correct account | BE-008/009 |
| BU-07 | Provider error/observability | Retryable versus invalid-token versus malformed-payload errors; secrets redacted | BE-010/012 |

### 18.2 Backend integration and security tests — Haider

| ID | Scenario | Required assertion | Tasks |
| --- | --- | --- | --- |
| BI-01 | Same phone, three installations | Three independent sessions and tokens; normal new login preserves prior devices | BE-002/003 |
| BI-02 | Simultaneous OTP requests/first registration | Defined latest-code behavior, no duplicate user, bounded errors, no consumed-code reuse | BE-003 |
| BI-03 | Concurrent same-operation refresh | One committed successor and identical recovered response | BE-004 |
| BI-04 | Different-operation reuse / lost response | Reject unauthorized reuse; revoke correct family; exact retry recovers without extra rotation | BE-004 |
| BI-05 | Logout versus refresh / selected revoke | No valid successor after revocation; unrelated sessions remain authorized | BE-005 |
| BI-06 | Logout-all | All old access/refresh rejected on subsequent validation; all bindings detached | BE-005 |
| BI-07 | Delete A with B/C active | Old A/B/C access and refresh rejected immediately after commit; no expiry wait | BE-006 |
| BI-08 | Delete versus refresh and OTP issuance | Real-DB interleavings cannot create usable credentials for old identity | BE-003/004/006 |
| BI-09 | Delete versus device registration | No eligible old-account registration survives/appears after ordered deletion | BE-006/008 |
| BI-10 | Delete versus protected write/read/SSE | Write commit ordering enforced; preauthorized read boundary recorded; stream terminates/revalidates | BE-006/009 |
| BI-11 | Repeat delete / lost response / blocker | Effect applied once; stable 204/terminal 401/409; no undeclared racing 404 | BE-006/014 |
| BI-12 | Recreate same phone | New user ID; old history, consent, sessions and cleanup cannot attach | BE-003/006/007 |
| BI-13 | A/C on, B off then token rotates | Only eligible installations targeted; B remains off and A/C unchanged | BE-008/009 |
| BI-14 | Installation proof/ownership attacks | Guessed ID, another user's sid, stolen FCM token, wrong secret and clone conflicts cannot claim binding | BE-007/008 |
| BI-15 | Token moves/accounts switch during send | Old binding cancelled; stale failure cannot deactivate new token; external in-flight limit explicit | BE-009/010 |
| BI-16 | FCM 429/5xx, invalid token, bad payload | Correct retry/retirement behavior; partial targets independent; no premature event completion | BE-010 |
| BI-17 | Worker crash and queue/DB outage | Leases recover; accepted-but-unrecorded send may duplicate, with one logical delivery identity and observable attempts | BE-010/012 |
| BI-18 | Mixed clients and migration | Legacy sessions preserved by stated policy; sid-less cutoff verified; legacy POST cannot re-enable managed token | BE-011/014 |

### 18.3 Contract tests — Haider; Ahmed verifies Mobile decoding

| ID | Scenario | Required assertion | Tasks |
| --- | --- | --- | --- |
| CT-01 | Auth response variants | Managed and legacy shapes exactly match OpenAPI, including required/null/optional fields | BE-014, MB-002/003 |
| CT-02 | Terminal versus recoverable errors | Every affected route declares codes; 403/5xx are not interpreted as invalid auth | BE-014, MB-003/004 |
| CT-03 | Installation operations | Omission/null/version/operation semantics, 204 bodies and strict enums match | BE-008/014, MB-007/008 |
| CT-04 | Delete/revoke semantics | Blockers unchanged, repeat and contention behavior specified; ownership failures reveal no foreign identity | BE-005/006/014, MB-005/006 |
| CT-05 | FCM payload | Versioned strings/IDs only; forbidden sensitive fields absent; legacy handling deterministic | BE-009/014, MB-011 |
| CT-06 | Compatibility/code generation | web/admin generated types and drift checks pass; required live suites for breaking changes | BE-011/014, MB-012 |

### 18.4 Mobile unit and integration-boundary tests — Ahmed

| ID | Scenario | Required assertion | Tasks |
| --- | --- | --- | --- |
| MU-01 | Installation persistence/corruption | Stable across restart; missing proof cannot silently claim identity; no default-enabled fallback | MB-001 |
| MU-02 | Secure commit interruption | Token/session metadata remains one owned envelope or unresolved, never mixed | MB-002 |
| MU-03 | Refresh concurrency and lost response | One operation; persisted exact retry after restart; no stale commit | MB-003 |
| MU-04 | Terminal auth versus network failure | Revoked/deleted clears owner; temporary error retains credentials without verified private UI | MB-003/004 |
| MU-05 | B resume, C launch, or B already foreground after A deletion | Explicit verification before private presentation on launch/resume, bounded foreground discovery, then sign-in/welcome and cache cleanup; delayed login response cannot bypass verification | MB-002/004 |
| MU-06 | Offline device then reconnect | No claim of instantaneous remote logout; reconnect rejects old identity and does not restore it | MB-004 |
| MU-07 | Offline logout / storage deletion fails | Local sign-out tombstone and capability cleanup survive restart; no refresh token retained for retry | MB-005 |
| MU-08 | Switch accounts during old work | Old HTTP/refresh/cleanup/push responses cannot mutate B; old capability cannot detach B | MB-002/005/011 |
| MU-09 | Deletion 204/409/timeout/recreation | Correct cleanup/blockers/uncertainty; new same-phone ID isolated; journals cleared by owner | MB-006 |
| MU-10 | Toggle conflict/timeout/offline | No false success; versioned readback, ordered intent, no account-wide write | MB-007 |
| MU-11 | Rotation while disabled / APNs pending | No auto-reactivation or unnecessary token deletion; pending distinguished from permission | MB-008 |
| MU-12 | Permission and first-use flow | No repeated prompt; permanent denial/settings and provisional correctly represented | MB-009 |
| MU-13 | Delayed/duplicate/malformed FCM | Recipient/binding verified before action; cold tap waits for auth; no private background work | MB-011 |

### 18.5 Mobile widget tests — Ahmed

| ID | Scenario | Required assertion | Tasks |
| --- | --- | --- | --- |
| MW-01 | Enabled/disabled Switch | Same state drives correct bell and Switch; fixed localized title | MB-010 |
| MW-02 | Loading/error/unknown | No false confirmation; controls serialized/disabled appropriately; retry localized | MB-007/010 |
| MW-03 | OS blocked/provisional | Explanation and Settings action; quiet delivery wording; no unwanted dialog | MB-009/010 |
| MW-04 | Arabic/English, RTL/LTR | Chevron direction, switch placement, badge, semantics and text all correct | MB-010 |
| MW-05 | Light/dark, narrow/large text | Existing design tokens, readable contrast, no overflow at relevant breakpoints | MB-010 |
| MW-06 | Inbox navigation/history | Same route and unread badge; disabling push preserves history and read actions | MB-010 |
| MW-07 | Remote deletion/resume | No stale account/profile flash; correct welcome/sign-in route and back-stack behavior | MB-004/006 |

### 18.6 Physical-device acceptance — Ahmed with Haider's integration support

Use Device A iPhone, Device B Android, and Device C another iPhone where available. Record actual OS versions, signed build IDs, Firebase/APNs environment, Backend commit/API/migration baseline, sanitized attempt IDs, and observed result. Simulator/emulator execution is not required in this documentation phase.

| ID | Scenario | Required evidence |
| --- | --- | --- |
| PD-01 | Concurrent login, independent refresh/logout | A logs out; B/C remain signed in and usable |
| PD-02 | Delete on A, resume B, cold-launch C | Online B/C clear auth before private UI; all old credentials rejected server-side |
| PD-03 | B offline during deletion, then reconnect | Unverified offline state, no false instant logout claim, correct later invalidation |
| PD-04 | A/C enabled and B disabled, then re-enable B | Backend-originated receipt only on eligible devices; history remains on B |
| PD-05 | OS permissions and Settings | First offer, denial, permanent denial, provisional where available, settings return; app opt-out retained |
| PD-06 | Foreground/background/cold-start and late A notification after B login | Safe generic display, owned tap handling, no old-account private data; accepted-message limitation documented |
| PD-07 | Token/APNs readiness, logout offline, rapid account switch | Registration eventually reconciles, no silent opt-in, server cleanup status observable |
| PD-08 | Reinstall, backup restore and device migration | New installation policy holds; no cloned authentication or stale preference activation |
| PD-09 | Signed distribution and failure recovery | iOS production APNs/Android real delivery, network loss during refresh/toggle/delete, retry outcomes and UI state align |

## 19. Implementation Phases

All phases require implementation authorization; none has been started by this review.

| Phase | Scope and owners | Exit gate / blocked work |
| --- | --- | --- |
| 1. Architecture and API agreement | BE-001, with Ahmed reviewing Mobile state/storage UX; resolve section 21 decisions and define security fixtures | Approved session/installation/recovery/consent/deletion protocol, errors, compatibility and retention. Begin here. |
| 2. Backend identity foundations | Haider: BE-002/007, then BE-003/004/005; early BE-011 migrations and BE-012 instrumentation. Ahmed: independent MB-001/002/004/006/009/010/012 preparation. | Session isolation, revocation and refresh security tests pass. Production managed auth integration waits for published slices. |
| 3. Backend deletion and notification lifecycle | Haider: BE-006/008/009/010, migration rehearsals and security tests | Cross-device deletion, versioned preference, token isolation, payload and retry semantics available on test deployment. |
| 4. Mobile authentication and lifecycle integration | Ahmed: MB-002/003/004/005/006 against staged contracts | A/B/C identity and deletion flows, offline logout and exact refresh recovery pass automation; no stale private UI. |
| 5. Mobile notification preference and UI | Ahmed: MB-007/008/009/010/011 | Accurate Switch/icon, permission UX, no implicit reactivation, safe payload handling; both locale/theme variants pass. |
| 6. Cross-platform verification | Haider: BE-011/013/014; Ahmed: MB-012/013; shared INT-01–INT-12 | Real-DB races, strict schemas, mixed clients and physical-device matrix documented on one candidate baseline. |
| 7. Security and release decision | Haider confirms server enforcement/observability; Ahmed confirms device/UI/storage evidence; project owner accepts remaining documented limits | Section 20 complete; no critical issue deferred under an optional label. |

Phases describe dependency order, not a requirement to serialize independent work. BE-002 and BE-007 can run in parallel; Mobile native/fixture work can start after Phase 1; delivery retry work can use a fake gateway while payload integration is pending. Physical acceptance follows published Backend behavior, not just mock success.

## 20. Release Readiness Criteria

These gates are **mandatory for the expanded Release 1 scope** and are currently unverified or incomplete. Historical roadmap completion does not waive them.

- [ ] Haider and Ahmed approve the contract, error semantics, operation ordering, ownership, and compatibility decisions; project owner approves retention/privacy policy.
- [ ] Same account works on at least two platforms with independent stable sessions; new login does not globally revoke normal sessions.
- [ ] Current/selected/all-session revocation and deletion are distinct, tested operations; sid-less legacy limitations have ended or are explicitly blocked from the release guarantee.
- [ ] Existing access tokens fail new authorization checks immediately after account deletion or applicable session revocation, without waiting for JWT expiry.
- [ ] Account deletion A/B/C, deletion races, lost response, offline reconnect, and same-phone recreation pass; no old identity resurrection or stale authenticated UI.
- [ ] Refresh rotation and family replay protection pass; exact recovery is secure, bounded, revocation-aware, encrypted, and tested, or an explicitly approved stricter reauthentication fallback replaces the availability promise.
- [ ] Offline logout cannot restore locally; cleanup is purpose-limited, durable, bound to its original session, and cannot affect a new account.
- [ ] Installation IDs are not credentials; proof and backup/reinstall behavior are verified, with no guessed/duplicated-ID ownership bypass.
- [ ] A/C enabled and B disabled works across restarts, resume, FCM rotation, failed network requests and login transitions; no automatic reactivation.
- [ ] Switch/bell/permission/registration state is accurate; no false success, no repeated permission prompting, no account-wide toggle misuse, and history remains available.
- [ ] Unsent deleted/detached-account notifications are cancelled; recipient metadata and generic content protect Flutter handling; unavoidable in-flight/OS limits are documented and accepted, never described as zero leakage under all timing conditions.
- [ ] Gateway failures retry correctly, terminal failures are visible, token invalidation targets the exact revision, and duplicate-risk windows are tested without exactly-once claims.
- [ ] Sensitive tokens, proofs, OTPs, customer data and raw provider messages do not enter production diagnostics or test artifacts.
- [ ] New migrations and upgrade/rollback constraints pass on isolated databases; all required strict-schema/type-generation and relevant web/admin gates pass.
- [ ] Mobile unit/widget/integration checks and signed physical Android/iOS acceptance pass on recorded versions; current production-like configuration is verified without exposing secrets.
- [ ] Every P0/P1 task has completion evidence, or an explicitly approved scope change identifying the lost guarantee; account-deletion correctness cannot be deferred.

## 21. Open Decisions and Trade-offs

### 21.1 Decisions required before implementation

| ID | Decision / recommended baseline | Owner and trade-off |
| --- | --- | --- |
| O01 | Stable session validation on every protected request; no positive auth cache in Release 1 | Haider; immediate revocation versus measured DB latency. Add caching only with invalidation evidence. |
| O02 | Preserve configurable short access/refresh lifetimes; choose an absolute session horizon and aligned revocation-capability expiry | Haider + project owner; convenience versus stolen-credential exposure. Do not silently set a new lifetime during implementation. |
| O03 | Approve bounded encrypted exact-response recovery with separate installation proof; suggested two-minute window | Haider security design, Ahmed storage/retry feasibility; operational complexity versus avoidable OTP reauthentication. Broad old-token grace is rejected. |
| O04 | Approve installation continuity secret, backup exclusions, and fresh-install marker behavior | Haider protocol, Ahmed platform implementation; simpler than device attestation but cannot prove an uncloned physical device. |
| O05 | Device-wide preference retained across logout, with renewed consent for a different account | Shared product decision; alternative per-account-per-installation preferences require explicit model/API revision before coding. |
| O06 | Approve retained snapshots, logs, proof/tombstone lifetime, cleanup jobs and privacy wording | Haider + responsible project owner; preserve accounting integrity while minimizing personal-data exposure. Legal retention periods are not established by this review. |
| O07 | Accept the precise in-flight request and FCM boundary; use generic push content and bounded TTL | Shared security/product decision; strict recall of provider-accepted notifications is not achievable by a local Switch or database transaction. |
| O08 | Choose legacy protocol cutoff, semver, support window and rollback constraints | Haider, with web/admin owners and Ahmed; preserve consumers without allowing old routes to bypass new security. No silent forced global logout. |
| O09 | Confirm first-use offer timing, sign-in/welcome destination after remote invalidation, recent-auth window for revoke-all, and offline private-UI treatment | Ahmed UX + Haider auth constraints + project owner; account-deletion correctness remains mandatory regardless of wording. |

### 21.2 Optional enhancements that may follow Release 1

- Named-device/session list UI and self-service security dashboard; the server's selected-session revocation capability remains required now.
- Separate per-device notification categories, quiet hours, and channel-specific configuration UI; the basic installation master preference remains required now.
- Push-driven invalidation hints or adoption of SSE in Flutter to reduce latency; authoritative startup/resume/reconnect checks remain required now.
- Asymmetric device-bound proof/attestation or a standardized sender-constrained token protocol after threat/performance review; never treat a UUID as an adequate replacement in the meantime.
- Per-device OTP challenge IDs and richer login alerts; safe phone-scoped OTP concurrency and rate limiting remain required now.
- Advanced delivery analytics; basic attempt state, redaction, failure alerts and retry correctness remain required now.

### 21.3 Review limitations and next action

**Requires runtime verification:** production token TTLs, current deployed migration/schema, Redis/worker behavior under failure, physical storage backup semantics, actual iOS/Android delivery, signing/APNs environment, and configuration alignment. No live account or Firebase console was inspected. No automated application test was executed for this document.

**Recommended first action after approval:** complete Phase 1 with Haider and Ahmed using BE-001 and INT-01–INT-12, agree O01–O09, and publish the reviewed contract design before either owner implements dependent behavior. Preserve the existing working deletion, credential ownership, inbox, and navigation logic while closing the identified gaps.

This review creates only this planning document. It makes no application, schema, migration, API, deployment, commit, push, or pull-request change.

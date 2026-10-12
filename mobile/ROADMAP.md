# Shubayr Mobile — Customer Release 1 Roadmap

Reviewed **12 October 2026 (Asia/Baghdad)**; updated with the account holder's
physical-iPhone results and completed local navigation verification from that date.
**Not production-ready.** The prior contract/integration review baseline remains
`origin/main` at `179c0ca5f74c32fbe080c8ad9152dc10394eeba6` (API 14.2.0); remote
contract, PR and console status were not rechecked for this documentation update.
This replaces the old API 8/11 roadmap and preserves the original 21-item numbering
from the [readiness report](docs/release-1-readiness.md#exact-21-item-coverage).

## 1. Current project status

| Area | Verified position |
| --- | --- |
| Authoritative contract | **API 14.2.0**, read from `origin/main:api/openapi.yaml` after `git fetch origin main`. [Contract on main](https://github.com/haideraljiryawe/Shubayr/blob/main/api/openapi.yaml). |
| Product scope | Guest browsing and **customer-only Release 1**. Delivery-agent code is preserved but disabled in profile/release. Order-monitor development is frozen; non-customer sessions are excluded from profile/release. Web Admin remains separate. |
| Completed capabilities | Remote browsing/search/offers, customer OTP/session isolation, cart/addresses, wishlist/reviews, COD checkout and recovery, versioned order decisions, order snapshots/history, stock recovery, bilingual errors, server availability, two-level categories, unavailable-product state, historical return quantities, account deletion and customer-only access. |
| Integration | #109 and #115–#128 are present in fetched main's merge history. GitHub confirms [#128 merged](https://github.com/haideraljiryawe/Shubayr/pull/128) at `179c0ca`. No repeat integration or reimplementation is planned. |
| Automated evidence | Historical baseline: **2,061 Flutter tests passed; 5 existing skips; analyzer clean**, recorded in the readiness report and #128 handoff. On 12 October, **142 relevant notification/navigation/session tests passed; Flutter analysis clean; `git diff --check` passed** for the Firebase Back-navigation fix. These are separate runs, not additive totals. The implementation remains uncommitted on `mobile`; tests were **not rerun** for this documentation update. |
| GitHub evidence | Final #128 head `60dfaa0`: [CI](https://github.com/haideraljiryawe/Shubayr/actions/runs/38262204304) and [Secret scan](https://github.com/haideraljiryawe/Shubayr/actions/runs/38262204285) completed successfully, rechecked through GitHub. This is PR-head evidence, not a fresh release/deployment test. |
| Native evidence | Apple Development signing and physical-iPhone Firebase initialization, permission, APNs/FCM tokens, API registration (HTTP 201), Console push delivery, background/lock-screen notifications, sound, foreground Snackbar and notification taps succeeded. Previously recorded unsigned iOS release compilation passed; Android AAB packaging stopped at the production-signing guard. Development-device results do not verify distribution signing, Android delivery or Backend-originated push. |
| Remaining Release 1 scope | D1 integration (13–16), Backend-originated push and full Android/iOS lifecycle acceptance (17), official privacy/support destinations (19), distribution signing/store preparation (20), and deployed bilingual/device acceptance (21). |
| Developer accounts | Account holder confirms **Apple Developer account verification and iOS development signing**, plus **Google Play Console account and application registration**. Firebase project `shubayr-38835` and Android/iOS apps (`com.shubayr.app`) are registered; APNs Development and Production credentials are configured. Distribution signing, full console prerequisites, testing eligibility and store approval remain open. |

### Status meanings and counts

| Status | Meaning |
| --- | --- |
| DONE | Mobile implementation and recorded automated verification complete; live acceptance remains in item 21. |
| PARTIAL | Implementation exists; configuration or real-world verification remains. |
| BLOCKED | A named prerequisite prevents completion; independent preparation may still proceed. |
| NOT STARTED | Actionable work with no completion evidence yet. Unchecked preparation steps below use this baseline unless another status is stated. |
| POST-LAUNCH | Explicitly outside customer Release 1. |

**21-item totals: 13 DONE, 2 PARTIAL, 6 BLOCKED, 0 NOT STARTED, 0 POST-LAUNCH.**
Post-launch work is counted separately in section 9. These are readiness categories,
not a production completion percentage.

References: [Mobile guidance](AGENTS.md), [build/configuration guide](README.md),
[readiness evidence and tests](docs/release-1-readiness.md),
[push integration](docs/push-notifications-release-1.md), and
[migration notes](../docs/mobile/). Reviewed notes through 14.2 cover customer
order decisions, snapshots, specific errors, deletion and FCM. Historical “to do”
labels describe older Mobile snapshots and do not reopen completed work. Latest
notes: [14.0](../docs/mobile/contract-changes-v13.4-to-v14.md),
[14.1](../docs/mobile/contract-changes-v14-to-v14.1.md),
[14.2](../docs/mobile/contract-changes-v14.1-to-v14.2.md).

## 2. Release 1 requirements — authoritative 21-item checklist

M = Mobile developer; B = Backend team; L = project lead/client; P = platform/store.
Checked requirements mean implementation complete, not release approval. Detailed
source/test links remain in the readiness report. Live verification of DONE items
is performed once under item 21, not scheduled as new feature implementation.

| # | Requirement | Status | Responsible party | Remaining action | Dependency / blocker | Verification criteria |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [x] Checkout idempotency | DONE | M; B for live acceptance | No coding; test recovery in 21. | Deployed API for 21; no implementation blocker. | Identical persisted body/key returns the same order after timeout/restart; changed body cannot reuse key; account/API isolation holds. |
| 2 | [x] Direct cancellation only while pending | DONE | M | No coding; verify transitions in 21. | Deployed order fixtures. | Pending-only action sends version; stale state reloads without automatic write retry. |
| 3 | [x] Reasoned cancellation requests, states and resolution note | DONE | M; B for staff resolution | No coding; test approved/denied cases in 21. | Deployed customer/staff workflow. | Reason, pending/approved/denied state, timestamps and resolution note display correctly. |
| 4 | [x] Accept/decline reduced-quantity proposals | DONE | M; B for proposals | No coding; verify both decisions in 21. | Backend proposal fixtures. | Versioned `shortage-response`; resolved history remains without action buttons. |
| 5 | [x] Stock-shortage recovery | DONE | M; B owns error contract | Retain implementation; verify real refusals in 21. | B reconciles route declarations; section 5. | Both stock refusals refresh without write retry; quantities/SKU shown only from structured response or safely identified refreshed cart data. |
| 6 | [x] Specific bilingual API errors | DONE | M | No coding; verify deployed mapping in 21. | Real refusal scenarios. | Requested cart/SKU/coupon/order/role/surface/idempotency codes have Arabic/English feedback; raw server messages hidden. |
| 7 | [x] Complete customer order details | DONE | M | No coding; compare live snapshots in 21. | Representative order histories. | Timeline, cancellation, accepted prices, shortage outcomes and collection match server data; unknown collection is not presented as paid. |
| 8 | [x] Server availability labels; no browsing stock counts | DONE | M | No coding; check catalog/cart in 21. | Live stock-label cases. | Server labels retained; browsing/quantity controls hide inventory counts; numeric refusal detail limited to item 5. |
| 9 | [x] Strict department → subcategory tree | DONE | M | No coding; check production catalog in 21. | Catalog fixtures. | Active/sorted two-level tree; grandchildren excluded without breaking navigation. |
| 10 | [x] Remove negotiation fields | DONE | M | No further implementation work. | None. | Product serialization does not retain/emit `is_negotiable`, `floor_price`, `points_price`; regression evidence retained. |
| 11 | [x] Dedicated unavailable-product 404 state | DONE | M | No coding; test removed product in 21. | Real unavailable product. | Localized unavailable state for 404; transport failures retain retry. |
| 12 | [x] Whole-unit returns from historical snapshots | DONE | M | No coding; test returns in 21. | Historical order/return fixtures. | Saved `base_unit`/`whole_units_only` govern hidden-product returns; missing snapshots block unsafe returns; switching accounts closes stale dialogs. |
| 13 | [ ] Required governorate and completion of legacy addresses | BLOCKED | B publishes; M integrates | Implement selection/legacy completion after D1. | Unmerged D1 address/governorate contract and migration. | New addresses require published field; legacy completion gates checkout; localized errors. |
| 14 | [ ] Zone delivery fees and DELIVERY_ZONE_NOT_SERVED | BLOCKED | B prices; M presents | Integrate server fees/refusal after D1. | Published zone pricing and route error schema. | Served address uses server fee; unserved address prevents checkout with actionable feedback. |
| 15 | [ ] Automatic goods discounts and RTL progress | BLOCKED | B calculates; M presents | Integrate discount/next-tier display after D1. | Published tier/progress schema, rounding and coupon rules. | Server totals retained; goods-only automatic discount versus coupon follows approved larger-benefit rule; Arabic/English/RTL progress works. |
| 16 | [ ] Adjusted delivery fees/totals after phone confirmation | BLOCKED | B/staff workflow; M refreshes | Integrate adjustment/notification after D1; existing server fee/total display retained. | Published adjustment and notification behavior. | Customer sees revised server fee/total after staff confirmation; no new customer acceptance step. |
| 17 | [ ] Native Firebase push | PARTIAL | M + B | iPhone setup/Console delivery and Mobile Back-navigation fix complete; finish Backend-originated delivery and full device/lifecycle matrix. | Enabled matching Backend sender, Android physical-device verification, normally terminated delivery and remaining lifecycle evidence. | Receipt/taps in foreground/background/cold start, permission changes and token/account lifecycle pass on both platforms; Firebase entry returns Home without changing normal Home/Account navigation. |
| 18 | [x] Account deletion and private-state cleanup | DONE | M; B for live acceptance | No coding; verify success/blockers in 21. | Deployed deletion workflow. | `DELETE /me/account` 204 clears credentials/journals and resets push; blockers retain session; other accounts remain isolated. |
| 19 | [ ] Functional official privacy and support links | PARTIAL | L publishes; M configures | Set real `PRIVACY_POLICY_URL`/`SUPPORT_DESTINATION`; test opening. | Approved policy/contact not supplied in verified release configuration. | Published policy and approved HTTPS/mailto/tel support open on Android/iOS; no placeholder/unavailable fallback at launch. |
| 20 | [ ] Signed Android AAB, iOS distribution archive, stable localization | BLOCKED | M/account holder; P processes | Apple development signing and Play app registration complete; finish distribution signing, store uploads/testing and remaining setup; localization generation already verified. | Upload key, distribution identity/profiles, actual configuration and console requirements. | Signed AAB and archive/export accepted by stores; installed test builds work; localization remains reproducible. |
| 21 | [ ] Deployed API and bilingual/RTL device testing | BLOCKED | M + B + L/QA | iPhone Console push scenarios recorded; complete section 8 on intended release candidate. | HTTPS deployment/URL, accounts/data, D1 and platform configuration. | Physical Android/iOS Arabic/English/RTL journeys pass; evidence and team approval recorded. |

## 3. Mobile Developer — Independent Action Plan

Checked milestones below record completed work from 12 October; this documentation
update performs no setup or testing. Console/device results are account-holder
confirmed; navigation regression results were recorded locally. Composite steps
remain unchecked when any acceptance criterion is outstanding. Development signing
and Console push success do not establish distribution or store approval.

### Individual-account implications

- Apple displays an individual's **personal legal name as seller**, even when the
  app is branded Shubayr. Confirm the lead/client accepts this public identity.
  [Apple enrollment](https://developer.apple.com/programs/enroll/).
- Google allows a developer name distinct from the legal name, but also displays
  verified legal name, country and developer email. Monetization/regional rules
  can expose further address/contact details; inspect the actual public profile.
  [Google account information](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en).
- Personal-account publishing is the current expectation, **not a verified legal
  agreement**. Agree on brand rights, publishing authority, renewals, support,
  credential custody, data disclosures and handover. Google describes organization
  accounts for business use; confirm the appropriate representation with the lead
  and platform support if needed, without assuming organization enrollment or a
  completed conversion. [Account types](https://support.google.com/googleplay/android-developer/answer/10840893?hl=en).
- Future transfer to client/organization accounts depends on platform eligibility.
  Preserve identifier/ownership records and plan signing, APNs, Firebase and service
  access changes; do not promise an automatic transfer or share personal logins.
  [Apple transfer](https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer),
  [Google transfer](https://support.google.com/googleplay/android-developer/answer/6230247?hl=en).

### A. Apple Developer

1. [ ] Verify individual membership/expiry, two-factor authentication, account-holder
   permissions, pending agreements, Certificates/Identifiers/Profiles access and
   App Store Connect access. Record status without credentials. **Partial:** Apple
   account verification and working development signing confirmed on 12 October;
   the full expiry/2FA/agreements/access checklist is not recorded as complete.
2. [x] Verify availability/ownership of explicit App ID **`com.shubayr.app`**, the
   existing iOS bundle identifier. Confirmed by the registered app and successful
   signed physical-iPhone installation; no identifier change required.
3. [x] Enable Push Notifications on that App ID and verify the development app
   capabilities: remote-notification background mode, APNs entitlements and method
   swizzling retained. APNs/FCM acquisition and real delivery succeeded. Background
   fetch was not required for the verified implementation; no unrelated capability
   was enabled. [Firebase Apple setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started).
4. [ ] Select the intended Apple team and prepare an Apple Distribution identity
   and App Store distribution profile, or verify Xcode-managed equivalents.
   Regenerate profiles after enabling Push; verify bundle ID and production APNs
   entitlement. **Partial:** team `2C54WHGQ29` and Apple Development signing work;
   distribution identity/profile and signed distribution artifact remain unverified.
5. [ ] Create the App Store Connect record with matching bundle ID, approved name,
   primary language and recorded internal SKU. Check agreements and applicable
   tax/banking requirements for the chosen distribution model.
   [App Store Connect workflow](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow).
6. [ ] Draft Arabic/English name, subtitle, description, keywords, category, icon,
   screenshots, support URL, privacy URL, copyright and review contact. L approves
   final text/assets. Complete age rating, content rights, territories, export
   compliance and privacy answers from actual app/SDK behavior; check current
   SDK/submission requirements before upload.
   [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information),
   [App privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).
7. [ ] Prepare TestFlight groups, feedback contact and testing instructions. Once
   the configured signed build exists, upload, resolve processing/compliance issues
   and test internally. External testing needs the applicable TestFlight review;
   the first external build receives a full review.
   [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/),
   [external testing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).
8. [ ] With B/L, provide reliable customer OTP review access, working backend,
   review instructions, deletion behavior and reachable support/privacy pages.
   Submit after section 8 and team approval; TestFlight approval is not App Store
   approval. [Apple review preparation](https://developer.apple.com/app-store/review/).

### B. Google Play Console

1. [ ] Verify personal account identity/contact status, owner permissions, country
   and pending Dashboard tasks. Complete required device verification using the
   Play Console app on a non-rooted Android 10+ device if pending.
   **Partial:** account registration is complete; remaining Dashboard/device
   verification and publishing eligibility are not recorded as complete.
   [Device verification](https://support.google.com/googleplay/android-developer/answer/14316361?hl=en).
2. [ ] Confirm **`com.shubayr.app`** in Android source and the intended Play app;
   verify availability/ownership through the console/upload process. Prepare
   app record, default language, approved name, category and distribution choices.
   **Partial:** Play application registration is complete for `com.shubayr.app`;
   final listing/distribution choices and signed-upload validation remain open.
   Do not silently change the application ID.
3. [ ] Draft Arabic/English short/full descriptions, icon, feature graphic,
   screenshots, support contact and privacy link; obtain L's final assets/approval.
4. [ ] Configure **Play App Signing**, keeping the Google-managed app signing key
   distinct from the local **upload key**. Prepare/back up the upload keystore
   securely and record public certificate fingerprints. Match the AAB upload
   certificate to Play's record.
   [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en).
5. [ ] Prepare internal testers, closed-test group and opt-in instructions now.
   Upload/test the signed configured build when ready. Internal testing does not
   satisfy the personal-account closed-testing requirement.
6. [ ] Plan **at least 12 testers continuously opted in to a closed test for the
   preceding 14 days** before applying for production access. Confirm the actual
   Dashboard requirement; collect meaningful usage/feedback and resolve findings.
   Recruitment can start now; the qualifying period begins with the eligible test.
7. [ ] Apply for production access once eligible, answering questions about testing,
   feedback and readiness. Await Google's decision and any further requirements;
   tester count/time alone is not approval.
   [Personal-account testing and production access](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
8. [ ] Complete current App content declarations: Data safety, privacy, account/data
   deletion, app access/OTP instructions, ads, target audience, content rating and
   applicable permissions. Check current target API/SDK/bundle requirements before
   submission. B/L must confirm actual collection, sharing, retention and deletion.
   Provide the required external account-deletion request URL in addition to the
   implemented in-app flow.
   [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

### C. Firebase — practical setup sequence

Use the [existing integration guide](docs/push-notifications-release-1.md).
“M alone” assumes access to the relevant account/project. It does not imply that
Backend delivery can be completed independently.

| Step | Action | Owner / prerequisite | Completion evidence |
| --- | --- | --- | --- |
| 1 | [ ] Create a Firebase project for Shubayr after agreeing ownership/environment with B/L; first check that the intended project does not already exist. | M executes; shared decision. | **Partial:** project `shubayr-38835` created. Shared access/ownership records and intended Backend environment alignment remain to be confirmed. |
| 2 | [x] Register Android application. | M alone; project access. | Firebase Android package is `com.shubayr.app`. |
| 3 | [x] Register iOS application. | M alone; project access. | Firebase Apple bundle is `com.shubayr.app`. |
| 4 | [x] Cross-check native identifiers and each platform's distinct Firebase app ID. | M alone. | Native/registered identifiers are `com.shubayr.app`; external configuration validation confirmed distinct Android/iOS Firebase app IDs. |
| 5 | [x] Obtain public client API key, app ID, sender ID and project ID from actual Firebase app configuration. | M alone. | Values mapped to the exact four keys in section 4. |
| 6 | [x] Prepare external per-platform build files and use `--dart-define-from-file`; retain explicit `FirebaseOptions` initialization. | M; API/policy/support supplied separately. | External `shubayr-android.json` and `shubayr-ios.json` prepared/validated; real iPhone initializes `shubayr-38835` through the existing options architecture. Android runtime verification remains in steps 7 and 11–17. |
| 7 | [ ] Verify Android `POST_NOTIFICATIONS` and Account enable action; test Android 13+ allow/deny/revoke. | M; physical device/configured app. | No automatic permission prompt; registration respects permission and verified customer ownership. |
| 8 | [ ] Verify Apple Push/background capabilities, entitlements and regenerated provisioning. | M alone; Apple access. | **Partial:** development signing, remote-notification mode, APNs entitlement and iPhone delivery verified. Distribution provisioning/production entitlement remains unverified. Source Profile/Release requests production; actual signed entitlement must match provisioning, not an assumed build-mode environment. |
| 9 | [ ] Generate/select APNs authentication key or supported certificate; securely record Team ID/key ID. | M alone; Apple permissions. | **Partial:** Development and Production APNs credentials configured; secure custody/recovery and key-identification records are not documented here as complete. |
| 10 | [x] Link APNs credential to the correct Firebase iOS app in Cloud Messaging settings. | M; Apple/Firebase access; shared project. | Development and Production credentials configured for the matching Firebase iOS app; development-device delivery verified. No private key in app/Git; production-distribution delivery remains a separate check. |
| 11 | [ ] Verify real Firebase Messaging token retrieval after login/permission; wait for actual APNs token on iOS. | M; platform setup and working login API. | **Partial:** physical iPhone permission, APNs token then FCM token acquisition verified through the existing lifecycle. Android verification remains; no token values recorded here. |
| 12 | [ ] Verify API registration/reactivation. | M + B; deployed authenticated API. | **Partial:** physical-iPhone `POST /devices/token` returned HTTP 201. Reactivation, persisted owner/platform/locale checks and Android verification remain. |
| 13 | [ ] Send real customer event while foregrounded. | M + B; FCM worker enabled. | **Partial:** Console foreground delivery and Snackbar action verified on iPhone; Back-to-Home fix regression-tested. Backend event, persisted inbox/badge and Android acceptance remain. |
| 14 | [ ] Test background and normally terminated delivery on both platforms. | M + B; FCM/APNs and OS permission. | **Partial:** iPhone Console background/lock-screen delivery and sound passed. Android and normally terminated delivery remain; verify background handler isolation and record force-stop limitations separately. |
| 15 | [ ] Test notification taps from background and cold start. | M + B. | **Partial:** iPhone notification taps succeeded; Home-backed navigation, startup/session guards and cold-entry routing passed automated tests. Physical cold-start and Android tap acceptance remain; no arbitrary push URL/order route. |
| 16 | [ ] Test rotation, locale, resume, permission revocation, online/offline logout and reconnect. | M + B checks server state. | Correct token retires/reactivates; FCM reset on logout; offline server cleanup is not assumed. |
| 17 | [ ] Test rapid account switching, deletion success/blockers and sign-in after deletion. | M + B; two test customers. | No stale-account content/navigation; correct token ownership; deletion resets FCM without relying on revoked API credentials. |

A Firebase Console test can isolate platform delivery after obtaining a token;
it does not verify Backend recipient selection, persistence or events. Complete
steps 12–17 through Backend events before closing item 17. Distinguish normal
background/terminated behavior from OS force-stop restrictions using the
[Firebase message guide](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages).
This documentation task creates no projects, keys or credentials.

### 12 October 2026 — completed milestones within items 17, 20 and 21

- [x] Apple Developer account verification and development-signed physical-iPhone launch.
- [x] Google Play Console account and Shubayr application registration.
- [x] Firebase project `shubayr-38835` creation and Android/iOS app registration.
- [x] External per-platform Firebase configuration prepared without replacing `FirebaseOptions`.
- [x] APNs Development and Production credentials configured in Firebase.
- [x] Physical iPhone: Firebase initialization, notification authorization, APNs/FCM
  acquisition and Backend device registration (HTTP 201).
- [x] Physical iPhone: Firebase Console delivery, background and lock-screen
  notifications, audible sound, foreground Snackbar handling and notification taps.
- [x] Mobile Firebase Back-navigation fix: `/home/notifications` supplies Home
  beneath the existing inbox on the root Navigator. Normal `/notifications` pushes
  still return to their Home/Account caller. Existing AppBar/RTL design is reused.
- [x] **142 relevant tests passed; Flutter analysis clean; diff whitespace check
  passed** for the navigation fix. Real-router tests cover Android system Back,
  iOS completed/cancelled swipes, Arabic/English, repeated events, cold-entry
  processing, private routes, stale sessions and notification detail navigation.

Physical-device results above are account-holder confirmed. The new Back fix is
verified by automated tests; post-fix real-device confirmation remains open.
Normal terminated-state delivery, physical Android acceptance, Backend-originated
push and the complete token/permission/account lifecycle are **not complete**.
Requirement **17 remains PARTIAL**; these milestones do not close 20 or 21.

### D. Signing and distribution

1. [ ] Prepare encrypted credential storage and recovery access outside the checkout.
   Separate public client configuration from passwords, private keys and Backend
   credentials. Never place secrets in source control, build defines or shared logs.
2. [ ] Prepare/back up Android upload keystore outside Git. Existing packaging reads
   ignored `android/key.properties` with exactly `storeFile` (absolute path),
   `storePassword`, `keyAlias`, `keyPassword`. Provision privately on the signing
   machine/CI; retain the fail-closed release-signing guard and no debug fallback.
3. [ ] Prepare Apple distribution identity/private key in Keychain or approved
   signing service, matching profiles and recovery material. Verify team, bundle
   and APNs environment. [Local iOS signing](docs/ios-local-signing.md) describes
   development context and does not prove distribution readiness.
4. [ ] Obtain real HTTPS API, policy/support destinations and per-platform Firebase
   options. Profile/release reject local, IP-literal, placeholder and development
   hosts; do not bypass validation to make a test release. **Partial:** real
   per-platform Firebase options are prepared; production API and official links
   remain outstanding.
5. [ ] Verify the Android SDK/JDK and supported Xcode/CocoaPods toolchains on the
   signing machine. Run final checks and build signed AAB and iOS archive/export.
   Current version is `1.0.1+2`; inspect prior store uploads before selecting
   future build numbers or requesting a version change.
6. [ ] Validate signatures/entitlements, upload to Play internal testing and
   App Store Connect/TestFlight, then install through those tracks on devices.
   Record build numbers, configuration identity and results without secrets.
7. [ ] Complete required closed/external testing and resolve findings before release
   approval. Upload acceptance alone is not production publishing approval.

Future commands from `mobile/`, with dependencies/toolchains already prepared and
real external configuration selected; **not run in this documentation task**:

```sh
flutter analyze --no-pub
flutter test --no-pub
dart run tool/check_localizations.dart
flutter build appbundle --release --no-pub --dart-define-from-file="$SHUBAYR_ANDROID_CONFIG"
flutter build ipa --release --no-pub --dart-define-from-file="$SHUBAYR_IOS_CONFIG"
```

The two shell variables are operator-selected paths to real external client files,
not production values. Check export method/team in Xcode Organizer as appropriate.
Unsigned iOS compilation cannot satisfy archive/export acceptance. See
[release configuration](README.md#production-release-configuration) for existing guards.

## 4. Push notifications architecture

```text
Flutter Mobile
    |
    | Authenticated device token registration / unregistration
    v
Shubayr Backend API + notification worker
    |
    | FCM server credentials; OAuth-authenticated HTTP v1 delivery
    v
Firebase Cloud Messaging
    |
    +--> Android device
    |
    +--> APNs --> iPhone
```

| Owner | Responsibilities and existing boundary |
| --- | --- |
| MOBILE | Firebase initialization, explicit permissions, token lifecycle, API registration/unregistration, presentation/navigation and session/account isolation. Existing [Firebase client](lib/features/notifications/data/firebase_push_client.dart), [lifecycle](lib/features/notifications/domain/push_lifecycle.dart), [registration](lib/features/notifications/data/device_registration.dart) and [navigation bridge](lib/app/push_notification_bridge.dart). |
| BACKEND | Secure account-owned token storage, recipient selection, event generation, FCM authentication/delivery, invalid-token handling and notification persistence. [FCM provider](../backend/src/modules/notifications/notification-provider.ts) and [configuration](../backend/src/modules/notifications/notifications.module.ts) exist; production setup/delivery remain unverified. |
| SHARED | Coordinate Firebase project/environment, push payload contract, configuration, test users and end-to-end tests; verify token retirement/reactivation/reassignment and account privacy together. |

### Exact existing configuration and credential boundaries

| Value / asset | Location | Meaning |
| --- | --- | --- |
| `FIREBASE_API_KEY` | Public Mobile build configuration | Matching Firebase client API key; not server authorization. |
| `FIREBASE_APP_ID` | Public Mobile build configuration; platform-specific | Firebase app ID, not package/bundle ID. |
| `FIREBASE_MESSAGING_SENDER_ID` | Public Mobile build configuration | Messaging sender/project number. |
| `FIREBASE_PROJECT_ID` | Public Mobile build configuration | Project identifier; match Backend `FCM_PROJECT_ID`. |
| `com.shubayr.app` | Native/Apple/Play/Firebase registrations | Current package/bundle; explicit `iosBundleId` in Mobile `FirebaseOptions`. |
| `API_URL`, `PRIVACY_POLICY_URL`, `SUPPORT_DESTINATION` | Public external build configuration | Actual production API and approved destinations; separate from Firebase. |
| `NOTIFICATION_PROVIDER=fcm`, `FCM_PROJECT_ID` | Backend deployment configuration | Select real sender and matching project. Production defaults to disabled without configuration. |
| `FCM_SERVICE_ACCOUNT_JSON_BASE64` | **Backend secret manager only** | Service-account JSON with private signing material; Base64 is not encryption. Never bundle in Mobile. |
| APNs `.p8` key/certificate and private key | **Secure Apple/Firebase administration only** | Connect Firebase to APNs. Team/key IDs identify it but are not additional Dart define fields. |
| Keystore/passwords and Apple private signing keys | **Secure signing environment only** | Authenticate distribution; never commit or put in client defines. |

The app initializes from explicit `FirebaseOptions` using the four Firebase keys.
Missing any leaves push unavailable without blocking independent features. This
architecture does not require generating `firebase_options.dart` or introducing
`google-services.json`/`GoogleService-Info.plist` as an alternative configuration.
Public Firebase identifiers may be bundled; restrict API keys to intended services
and never reuse privileged API keys.
[Firebase API-key guidance](https://firebase.google.com/docs/projects/api-keys).

FCM auto-initialization starts disabled. Token retrieval/registration requires
permission and a verified customer. Login/resume/locale/rotation use a serialized
lifecycle with session revisions. `DELETE /devices/token` sends `{token}` in the
body, not a URL. Logout attempts cleanup before removing credentials and resets
FCM; offline cleanup cannot prove server deactivation. Successful account deletion
resets local FCM without attempting DELETE with revoked credentials.

Backend source currently sends `notification: {title, body}` without push navigation
data. Foreground receipt refreshes inbox/badge and shows generic localized feedback;
the OS presents background messages. Taps open the authenticated inbox after
startup. Firebase entry now uses `/home/notifications`, a Home child displayed on
the root Navigator; Back returns Home without duplicate Home routes. Normal
Home/Account entry still pushes `/notifications` and returns to its caller. This
fix retains startup/customer/session-revision guards and passed real-router tests.
Existing API inbox entries retain role-checked destinations. Do not invent
push `order_id`/deep-link fields, direct routes or a new token protocol for setup.
Source behavior is not proof that the deployed sender is active.

## 5. Backend team dependencies

[D1 PR #114](https://github.com/haideraljiryawe/Shubayr/pull/114) was rechecked:
**open draft, not merged**, head `3c36fd5`. Implementation, contract/types and tests
remain unchecked; planned **14.3.0** is not the authoritative version. Main has no
D1 governorate/zone/next-tier contract or newer migration note. Do not implement
D1 wire behavior from proposed field names or a draft PR description.

| Dependency | Responsible party | Required deliverable | Mobile impact | Verified status | Unblocking condition |
| --- | --- | --- | --- | --- | --- |
| D1 governorate/address contract | B; L confirms rules | Catalog, required field, legacy completion/error rules and migration note. | Item 13 address/checkout changes. | BLOCKED; 14.2 still uses `city`, no governorate field. | Merged versioned OpenAPI, migration guide and working endpoints/fixtures. |
| Zone-based delivery fees | B | Authoritative quote/checkout fees and address-dependent repricing. | Item 14 display. | BLOCKED; D1 unmerged. | Published schemas and deployed served-zone cases. |
| `DELIVERY_ZONE_NOT_SERVED` | B | Code/status/details on every affected route. | Item 14 localized refusal. | BLOCKED; absent from current contract. | Route declarations and reproducible unserved-zone response. |
| Automatic cart discounts | B; L confirms policy | Goods-only discount versus coupon, larger benefit, rounding/allocation and snapshots. | Item 15 totals; no client calculation. | BLOCKED; no D1 discount contract. | Server-owned amounts/rules with boundary/coupon cases. |
| Next-tier progress | B | Tier/progress shape, eligibility and no-next-tier behavior. | Item 15 Arabic/English/RTL display. | BLOCKED; no published shape. | Contract examples and endpoint data; no guessed fields/formulas. |
| Staff-adjusted delivery fees | B/Web Admin; L workflow | Authorized/audited phone-confirmation adjustment, totals and notification behavior. | Item 16 refresh; no extra acceptance. | BLOCKED; generic server fee/total display already exists. | Published adjustment outcome/event and staff-to-customer test. |
| Production API deployment/URL | B/operations + L | HTTPS base URL including API path, matching migrations, TLS/media, real OTP and isolated test users/orders. | Items 17, 19–21 and review access. | BLOCKED; no supplied URL or verified deployment. | Customer journeys work on intended deployment; health check alone insufficient. |
| Backend FCM service | B/operations; M shares public project ID | Enable `NOTIFICATION_PROVIDER=fcm`, secure matching service account, FCM HTTP v1 access and queue/worker. | Item 17 delivery. | PARTIAL; provider exists, deployment unverified. | Authenticated worker delivery and invalid-token deactivation verified. |
| Push events/payloads | B + M | Recipients, locale, persisted inbox and title/body payload; publish D1 additions. | Items 16–17. | PARTIAL; baseline source exists, no live evidence. | Real order/cancellation/shortage events and lifecycle matrix pass on both platforms. |
| Stock-refusal route declaration | B owns contract; M retains recovery | Reconcile `INSUFFICIENT_STOCK` with `/orders` `x-error-codes`; document actual detail availability. | Items 5–6 live validation; no repeat Mobile implementation. | Open follow-up; route omits code; cart refusal can omit quantity details. | Declarations match actual responses; detail-present/absent cases verified without invented quantities. |

When D1 publishes, fetch main, read its actual `info.version` and new migration
notes, then inspect affected operations/schemas before integration. Backend
financial acceptance retains phase-3 posting/idempotency, currency precision and
Asia/Baghdad business-date rules. Mobile displays authoritative server totals.

## 6. Project lead / client dependencies

| Needed information or decision | Owner | Required outcome / current gap |
| --- | --- | --- |
| Official privacy policy URL | L/client; B confirms practices | Real production HTTPS policy covering account/order/contact/token data, sharing, retention and deletion; URL not supplied. |
| Official support destination and contacts | L/client | Approved production HTTPS, single mailto recipient or international tel destination for Mobile; store support email/contact and Apple support URL as required. They need not be identical fields. |
| External deletion request page | L/client + B | Working, discoverable Play deletion request path naming app/developer and explaining retained data; API deletion alone does not supply this URL. |
| Production API URL and review access | B/operations + L | Intended deployment, reliable OTP review procedure and isolated customer test data; no invented host or hard-coded review bypass. |
| Store name/descriptions/assets | L/client approves; M prepares | Arabic/English copy, category, icon, screenshots and promotional assets; confirm brand/media rights. |
| Privacy disclosures | B + L; M inventories app/SDKs | Accurate collection/sharing/security/retention answers for Apple App Privacy and Play Data safety; disabled analytics does not mean no data collection. |
| Store ownership/publishing agreement | Developer + L/client | Document personal-account authority, public identity, costs/renewals, updates/support, recovery, ownership and future handover. Lead informed; final agreement unverified. |
| Business/legal/distribution details | L/client + account holder | Rights holder, copyright, business/contact information, launch territories and applicable trader/tax/identity declarations. Do not invent an organization or assume approval. |
| Testers and release acceptance | M recruits; L/client participates | Required Play participation, devices, customer/staff scenarios and named sign-off owner. |

Personal accounts remain the expected publishing route. A future transfer must
meet Apple/Google criteria and preserve Firebase/APNs/backend access separately;
a store listing transfer does not automatically transfer connected services.

## 7. Execution order

Complete small milestones and record evidence before checking them off. Platform
preparation can proceed alongside Backend D1. This roadmap update performs no
provisioning, dependency installation, builds or application changes.

### PHASE A — Can start immediately

Prerequisite: access to existing personal accounts and repository.

| Order | Action | Who | Expected result / completion check |
| --- | --- | --- | --- |
| A1 | [ ] Audit membership, identity, permissions, agreements, public identity and pending console tasks. | M | **Partial:** Apple account verification and Play account/app registration complete; remaining agreements, public-identity review, console gates and publishing eligibility still need a full record. |
| A2 | [ ] Check `com.shubayr.app` availability/ownership; prepare secure signing storage. | M | **Partial:** `com.shubayr.app` registrations and iOS development signing verified; secure distribution-signing storage/checklist remain open. |
| A3 | [ ] Draft metadata and data inventory; prepare dependency request from sections 5–6. | M | Reviewable drafts and named missing deliverables; no fabricated URLs/legal claims. |
| A4 | [ ] Recruit at least 12 prospective closed testers; prepare device matrix, opt-in instructions and scenarios. | M; testers later | Roster/test plan ready; qualifying clock not yet claimed. |
| A5 | [ ] Prepare exact build-config key inventory, signing checklist and acceptance cases for completed requirements. | M | **Partial:** Firebase four-key inventory/external files and push navigation regressions complete; full signing and release acceptance templates remain open. |

**Next milestones:** finish the remaining A1–A2 console/distribution-signing gates,
coordinate Backend FCM delivery and complete Android/iOS lifecycle acceptance.
Do not repeat the completed account registration, Firebase setup or iPhone Console
tests as new implementation work. Tester recruitment can proceed alongside this.

### PHASE B — Firebase and platform integration

Prerequisites: account/project access, B/L project ownership decision, real login
API for token tests, and approved configuration for signed release builds.

| Order | Action | Who | Expected result / completion check |
| --- | --- | --- | --- |
| B1 | [ ] Agree project/environment ownership; execute section 3C steps 1–6. | M + B/L | **Partial:** project/apps, distinct options and external files complete; iPhone initialization verified. B/L ownership and intended Backend sender/environment alignment remain open. |
| B2 | [ ] Configure APNs/capabilities/signing and verify permissions/token retrieval. | M | **Partial:** APNs Development/Production setup, iOS development signing, permission and tokens complete; Android permission/token tests and distribution identities/entitlements remain. |
| B3 | [ ] Enable Backend FCM; test API registration, delivery and full token/account lifecycle. | B + M | **Partial:** iOS registration HTTP 201, Console delivery/sound/taps and Back-navigation fix complete; Backend delivery, physical cold-start/Android and full lifecycle acceptance still required to close 17. |
| B4 | [ ] Configure official links; upload usable signed test builds and begin required testing. | M; L/B supplies values; P processes | Item 19 live checks pass; internal/TestFlight installs work; qualifying closed test starts when eligible. |

D1 need not delay account preparation or eligible platform testing. Retest the
final D1-integrated candidate before submission.

### PHASE C — Waiting for D1

Prerequisites: D1 actually merged, authoritative version/migration notes published,
and matching endpoints/fixtures available. A planned version is insufficient.

| Order | Action | Who | Expected result / completion check |
| --- | --- | --- | --- |
| C1 | [ ] Fetch main; inspect version, schemas/errors and migration notes; map changes to 13–16. | M; B publishes | Compatibility checklist based on merged contract. |
| C2 | [ ] Implement governorates and legacy address completion. | M | Item 13 focused tests and live new/legacy cases pass. |
| C3 | [ ] Integrate zone fees and unserved-zone handling. | M + B | Item 14 served/unserved/address-change cases pass using server totals. |
| C4 | [ ] Integrate automatic discounts and next-tier RTL progress. | M + B | Item 15 boundary/coupon/currency/RTL cases pass. |
| C5 | [ ] Integrate staff fee adjustment refresh/notifications; verify complete D1 journey. | M + B/Web Admin | Updated fee/total without customer acceptance; 13–16 evidence recorded. |

### PHASE D — Release verification

Prerequisites: D1 integration, intended deployment, approved links, signing/Firebase,
review access and physical Android/iOS devices.

| Order | Action | Who | Expected result / completion check |
| --- | --- | --- | --- |
| D.1 | [ ] Run final analysis/tests/localization guard and real GitHub CI. | M; CI owners | **Partial:** 142 relevant local tests and clean analysis recorded for the uncommitted Back fix; final candidate suite/localization and real GitHub CI remain outstanding. |
| D.2 | [ ] Build signed AAB and iOS archive/export; upload/install through store test tracks. | M; P processes | Item 20 artifacts, processing and entitlements verified; guards retained. |
| D.3 | [ ] Execute section 8 customer, money, push and bilingual/RTL matrix. | M + B + L/QA | **Partial:** dated physical-iPhone Console push evidence recorded; full deployed customer/money/push/bilingual matrix and final-candidate acceptance remain. |
| D.4 | [ ] Finish Play testing/production-access application, metadata/declarations and review access. | M + L/B; P decides | Actual console eligibility/review outcomes recorded. |
| D.5 | [ ] Obtain team approval, submit, resolve reviews and verify published build/configuration after approval. | L approves; M submits; P reviews | Approved release and publication smoke evidence; support/rollback owner identified. |

The [previous readiness estimate](docs/release-1-readiness.md#revised-remaining-effort--all-incomplete-items)
is **8.5–17 Mobile person-days after prerequisites**, not a new delivery promise.
It excludes Backend effort, external waiting, qualifying Play testing elapsed time
and store review. Re-estimate after D1 publication and the account/configuration audit.

## 8. Release acceptance checklist

Record candidate commit, API version/deployment, build numbers, device/OS, locale,
date, tester and result. Use approved test customers/orders; coordinate money cases
with B/L. Local acceptance suites must use a unique throwaway `shubayr_*_verify`
database, drop it afterward and stop containers they started, per root guidance.

- [ ] All **21 customer requirements** complete with no unresolved D1/configuration/
  distribution blocker; completed implementation stays DONE while live evidence
  is recorded here.
- [ ] Customer-only profile/release access verified for OTP, restored sessions, deep
  links and notification navigation; agent/monitor areas inaccessible; developer
  routes absent and no fixture fallback.
- [ ] Correct real HTTPS API, matching migrations/version, media and OTP verified;
  no development host or placeholder configuration.
- [ ] Real Firebase/APNs verified on physical Android/iPhone: foreground, background,
  cold start/taps, denial/revocation, rotation, resume/locale, logout/offline reconnect,
  switching and deletion. **Partial:** iPhone Console foreground/Snackbar, background,
  lock-screen, sound and taps passed; navigation fix has automated coverage. Backend
  events, Android, physical cold start, complete lifecycle and post-fix device
  navigation confirmation remain open.
- [ ] Signed Android AAB accepted/installed through Play testing with correct
  package/version, upload identity and release network policy; no debug fallback.
- [ ] iOS distribution archive/export accepted by App Store Connect/TestFlight with
  correct team, bundle, profiles and production APNs entitlement.
- [ ] Arabic and English verified across browsing, OTP, shopping, account, history,
  returns, support and notifications.
- [ ] RTL, physical keyboards/input normalization, Western digits, narrow/large-text
  layouts, light/dark and supported tablet layouts verified on devices.
- [ ] Real checkout/idempotent recovery, explicit price-change consent, stock/quantity
  refusals, cancellation/proposals, governorates/zones and discounts verified;
  no blind write retries or invented client-side money values.
- [ ] Server money/snapshots retained: IQD precision 0, USD where enabled, historical
  units, adjusted fees, collection/amount owed and returns. B verifies posting/
  reversal and Asia/Baghdad business-date behavior where applicable.
- [ ] Account deletion success/blockers tested; credentials, journals, tokens and
  private state cleared/isolated correctly; external deletion path and retention
  disclosures verified.
- [ ] Official privacy/support links functional on both platforms and reach approved
  content/contact; no missing-config fallback; external deletion link functional.
- [ ] Store metadata/screenshots, rights, privacy/data declarations, contact and
  reliable OTP review access complete and approved by L/client.
- [ ] Required Play closed testing and production-access decision complete;
  applicable TestFlight review/testing complete; store approval not assumed.
- [ ] Actual GitHub CI/secret scans green for final candidate, with final Flutter
  analysis/tests/localization evidence recorded.
- [ ] Team approval and personal-account publishing agreement recorded; platform
  review approval obtained before publication; published build smoke-tested.

## 9. Post-launch — explicitly outside Release 1

| Status | Deferred scope |
| --- | --- |
| POST-LAUNCH | Delivery-agent activation, newer delivery/collection/custody/detail migrations and separate acceptance. Preserve source; do not enable in customer release. |
| POST-LAUNCH | SSE notifications; existing inbox polling and native push remain Release 1 mechanisms. |
| POST-LAUNCH | Notification preferences and notification-type filtering. |
| POST-LAUNCH | Brand filters/facet counts. |
| POST-LAUNCH | Additional per-SKU “from” price presentation. |
| POST-LAUNCH | Additional order-monitor development and monitor-specific contract work; monitor stays frozen. |
| POST-LAUNCH | Previously deferred loyalty balance/history, Retry-After improvements, coupon-currency presentation and guest-cart merge UI if later approved; no implied addition to the 21 items. |

### Maintaining this roadmap

1. Update review date, fetched main SHA and API version together; read new migration
   notes before changing contract-dependent status.
2. Preserve numbers 1–21; record implementation/test evidence when status changes
   and retain separate signed-build, deployment and device evidence.
3. Keep blocked owners/deliverables explicit and counts current. Do not reopen
   completed work solely because historical migration notes say “to do”.
4. Recheck official platform rules and actual console requirements before submission.
   Links above were reviewed for this roadmap; account-specific status remains
   unverified until the account holder completes the checks.
5. Follow [root](../AGENTS.md) and [Mobile](AGENTS.md) Git rules for future tasks.
   This update changes only the roadmap on `mobile`; existing uncommitted work is
   preserved. No commit, push, merge or branch creation is part of this task.

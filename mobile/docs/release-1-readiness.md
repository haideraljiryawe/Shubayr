# Customer-only Release 1 readiness — 12 October 2026

**Not production-ready.** Production API URL, published privacy-policy URL and
Firebase project are not yet available. No replacement production values were
invented. Keep all configuration external. API production HTTPS/DNS checks and
Android production-signing enforcement remain enabled.

## Implemented scope

- Cancellation: pending-only direct cancellation; later eligible orders use a
  reasoned, versioned cancellation request and display its server status.
- Quantity proposals: explicit accepted/denied response to pending reductions,
  preserving fractional quantities, order versions and session ownership.
- Checkout: secure API/account-scoped journal persists the original payload and
  idempotency key before HTTP. Unknown outcomes require explicit recovery using
  the same key/payload, even after restart or a consumed cart. PRICE_CHANGED
  continues to require new, complete, explicit consent for the same cart/address.
- Catalog: server availability labels replace local low-stock calculations and
  inventory-count copy. Customer quantity dialogs also hide stock-derived numeric
  ranges. Internal quantity limits, 0.001 precision and whole-unit
  SKU rules remain enforced.
- Errors: all 17 published customer refusal codes have Arabic/English guidance.
  Stock/invalid-cart refusals refresh authoritative reads without repeating a
  mutation. Order conflicts reload state; uncertain checkout and price consent
  keep their distinct recovery rules.
- Push: Android/iOS FCM client integration, explicit permission, APNs preparation,
  revision-owned registration/rotation/cleanup, generic foreground notice,
  background handler, and safe authenticated inbox opens after cold startup.
  Successful account deletion resets Firebase without using revoked credentials.
- Account/privacy: official DELETE /me/account, acknowledged confirmation,
  localized open-order/return/unsettled-amount blockers, token/private-state cleanup,
  and system-browser opening of an externally supplied real HTTPS policy URL.
- Release access: profile/release reject delivery-agent/monitor identities and
  work-area deep links. Existing work-role code remains available in debug.
- Localization: explicit formatting, LF attributes and a double-generation guard.
  Historical release-build drift could not be reproduced on Flutter 3.47.4;
  do not treat a suspected historical cause as established fact.

No backend or Web Admin implementation was changed by the feature PRs. The initial
mobile-to-main integration preserved the already-existing branch history/files.
No agent feature development, SSE, notification preferences, brands/filters or
variant “from” price was added.

## Integration record

All integration uses normal merge commits, without squash/rebase/force push.
The main OpenAPI contract is **14.2.0**, unchanged; database migrations: **0**.

| PR | Scope | Feature commit | Normal merge already verified |
| --- | --- | --- | --- |
| [109](https://github.com/haideraljiryawe/Shubayr/pull/109) | Mobile → main | synchronized head `82e4c4d` | `2562c859623fe5982bd587c74707787a714646d1` |
| [115](https://github.com/haideraljiryawe/Shubayr/pull/115) | Localization | `ccd21b1` | `144a2f71f8f0d019c96ea42c21da23f820035a4c` |
| [116](https://github.com/haideraljiryawe/Shubayr/pull/116) | Customer order actions | `acaa676` | `eee60c94b89d075a3d0e0814428fc3d6ab007cfd` |
| [117](https://github.com/haideraljiryawe/Shubayr/pull/117) | Checkout | `7090791` | `740ce1675f2ed3cb041ca60e13f376bb741c154f` |
| [118](https://github.com/haideraljiryawe/Shubayr/pull/118) | Availability | `a90e149` | `c3cdd8ad496bcad94a966630c06a30eede70df2a` |
| [120](https://github.com/haideraljiryawe/Shubayr/pull/120) | Customer-only release | `b7ab9bd` | `6067979a4bb8ffbe54d89a3150b390bcef15644f` |
| [119](https://github.com/haideraljiryawe/Shubayr/pull/119) | Account/privacy | `a762f30`, synchronized `6c677ca` | `7bfd42e2662a9ab21c4fbdedc83d0a70aafedb3b` |
| [121](https://github.com/haideraljiryawe/Shubayr/pull/121) | Localized errors | `3e9522c`, integrated `dd39b65` | `9499c97c2ae685d5baecacad3e701c175b3b78ed` |
| [122](https://github.com/haideraljiryawe/Shubayr/pull/122) | FCM and combined validation | `f6c55a9`, fixture correction `dc41539` | `534703730e42a61836b0a5d1412ed8d76734ead5` |
| [123](https://github.com/haideraljiryawe/Shubayr/pull/123) | Hide customer stock ranges | `4dd7e18` | Pending final current-head CI at this snapshot |

All preceding PRs passed every current-head project check and secret scanning
before normal merge. The last row describes this report's source-commit state;
its PR handoff and the final conversation report record the subsequent result.
Shared ARB conflicts were resolved by combining source keys and regenerating Dart
output. No required review or check was bypassed.

## Verification

- Combined Flutter analysis: clean.
- Combined full Flutter suite: **2,032 passed, 5 skipped**. Existing skips retained.
- Additional final account/logout/push integration tests: **22 passed**.
- Stock-range follow-up: **58 focused tests passed**, including new Arabic/English
  checks that hidden limits remain enforced and fractional input remains valid.
- Arabic/English, RTL, narrow checkout, text scaling, quantity precision,
  session changes, duplicate actions and failed reads are exercised by tests.
- Deterministic localization guard passed before and after the final native build.
- Combined push/account/error unsigned iOS release with Firebase compiled successfully
  (25.2 MB), before the final quantity-helper visibility-only follow-up.
  This is compilation evidence, not signed distribution or push delivery.
- Android release AAB attempt reaches `:app:validateProductionSigning` and refuses
  absent `android/key.properties`. No debug signing fallback or bypass was used.
- Native identifiers: `com.shubayr.app` on both platforms. Version: `1.0.1+2`.
- GitHub integrated baseline: **47 Jest suites / 1,195 tests**, **27 real-data
  acceptance packs / 2,714 assertions**. The separate strict-schema suite has **2 tests passed** (wrong types/undeclared
  fields, dynamic maps/composed fields); acceptance also imports strict validation.
  Subsequent project checks must remain green. No local verification database or
  container was started; acceptance ran in GitHub's throwaway environment.
- No emulator was used. Real production API, signed device, App Store/Play Store
  submission and live FCM/APNs verification have not been completed.

A newly added logout test initially used an unsupported fixture constructor
argument, causing the superseded PR #122 Flutter analysis job to fail. It was
corrected in `dc41539` with a separate commit, then analysis/focused/full
verification passed. The first Android build attempt also encountered a stale
Gradle-daemon file-write failure; a fresh daemon progressed to the genuine
production-signing blocker. Neither failure was hidden or worked around by
weakening a release check.

## External configuration and backend dependencies

1. Publish the actual production API deployment and supply `API_URL`. Verify TLS,
   authentication, account deletion, idempotency and notification registration
   against that deployment. Never use localhost, LAN or development hosts in release.
2. Publish the actual policy and supply `PRIVACY_POLICY_URL`; verify the link and
   content for both store submissions. Unavailable feedback is not a published policy.
3. Establish the Firebase project and Android/Apple apps, supply platform-specific
   public client identifiers externally, upload APNs credentials to Firebase,
   enable Apple Push Notifications capability and regenerate provisioning.
4. Configure backend FCM service credentials in its secret manager. Never place
   service-account JSON, private keys or signing passwords in Mobile/Dart defines.
5. Supply Android distribution signing outside Git; verify Apple distribution
   certificates/profiles, entitlements and archive export. Confirm store-console
   access, screenshots/metadata, privacy disclosures and deletion-policy listing.
6. Run the physical-device checklist in [push setup](push-notifications-release-1.md)
   and deployment acceptance. Offline server unregistration cannot be proven
   until connectivity returns; verify token retirement and account switching.

Governorate/zone delivery fees and automatic cart-total discount thresholds remain
**pending published API/migration notes and verified backend implementation**.
The inspected main contract/notes do not publish these customer features. No fields,
fees, formulas or progress thresholds were invented. The backend team's approximately
8-day Web Admin window is not included in engineering estimates below; waiting for
new contracts does not block the independent Release 1 implementations above.

## Revised remaining estimate

Implementation is present and locally tested. Remaining days below are deployment
integration, real-device verification and fixes revealed by those checks, measured
after the required configuration is supplied. They exclude waiting time, store
review/signing administration, and all agent/post-launch/upcoming-contract work.

| Included Release 1 feature | Remaining working days |
| --- | ---: |
| Cancellation requests | 0.25–0.5 |
| Reduced-quantity responses | 0.25–0.5 |
| Checkout idempotency | 0.5–1 |
| Server availability labels | 0.25–0.5 |
| Main API errors/recovery | 0.25–0.5 |
| Push notifications | 1.5–3 |
| Account deletion | 0.5–1 |
| Functional published privacy link | 0.25–0.5 |
| **Total** | **3.75–7.5 person-days** |

Backend deployment/FCM setup, policy publication and distribution signing can
proceed in parallel with each other. With team capacity, Android and iOS push
checks can run alongside order/checkout/account deployment acceptance. Main risks
are missing external configuration, APNs provisioning, offline/session edge cases
revealed only on devices, and store review lead time. This is not the former
30–45-day estimate and does not include delivery-agent work.

## Commands for the next release verification

From `mobile/`:

```sh
flutter pub get
flutter analyze --no-pub
flutter test --no-pub
dart run tool/check_localizations.dart
flutter build ios --release --no-codesign --no-pub
GRADLE_OPTS='-Dorg.gradle.daemon=false' flutter build appbundle --release --no-pub
dart run tool/check_localizations.dart
```

For a real release, use the actual external build configuration and distribution
signing. A successful unconfigured compile does not authorize production release.

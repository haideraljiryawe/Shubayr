# Customer-only Release 1 — 12 October 2026

**Not production-ready.** This report follows Hiader's October 12, 2026 numbered
21-item plan, supplied in the implementation conversation. Earlier eight-feature
estimates are superseded by the complete remaining-scope estimate below.

Authoritative API: **14.2.0**, fetched from `origin/main:api/openapi.yaml`.
Added database migrations: **0**. Backend and Web Admin source were not edited.
Source baseline and verification results are recorded below. `DONE` means the
Mobile implementation and automated checks are complete, not that deployment or
physical-device acceptance has happened.

## Exact 21-item coverage

Source and test links below resolve from this document to the Mobile implementation.

| # | Requirement | Before this task | Current status | Source evidence and tests |
| --- | --- | --- | --- | --- |
| 1 | Checkout idempotency | DONE | DONE | [order_repository_remote.dart](../lib/features/orders/data/order_repository_remote.dart) sends `Idempotency-Key`; [order_action_providers.dart](../lib/features/orders/presentation/providers/order_action_providers.dart) and secure [pending_request_store.dart](../lib/core/storage/pending_request_store.dart) persist/replay identical bodies, scoped by API/account. [checkout_idempotency_test.dart](../test/features/orders/checkout_idempotency_test.dart), [api11_actions_test.dart](../test/features/orders/api11_actions_test.dart), [order_action_lifecycle_test.dart](../test/features/orders/order_action_lifecycle_test.dart). |
| 2 | Direct cancellation only while pending | DONE | DONE | [order_status.dart](../lib/features/orders/presentation/order_status.dart) and the shared order action controller require pending status and the server version. [customer_order_requests_test.dart](../test/features/orders/customer_order_requests_test.dart), [order_detail_screen_test.dart](../test/features/orders/order_detail_screen_test.dart). |
| 3 | Reasoned cancellation requests, states and resolution note | PARTIAL | DONE | Existing versioned actions retained; [order.dart](../lib/features/orders/data/order.dart) now retains timestamps/resolution note; [customer_order_requests.dart](../lib/features/orders/presentation/widgets/customer_order_requests.dart) displays reason, pending/approved/denied and resolution. [customer_order_requests_test.dart](../test/features/orders/customer_order_requests_test.dart), [order_detail_screen_test.dart](../test/features/orders/order_detail_screen_test.dart). |
| 4 | Accept/decline reduced-quantity proposals | DONE | DONE | Official `shortage-response` call and server version retained. Resolved proposal history now remains visible without actionable buttons. [customer_order_requests_test.dart](../test/features/orders/customer_order_requests_test.dart), [order_detail_screen_test.dart](../test/features/orders/order_detail_screen_test.dart). |
| 5 | Stock-shortage recovery | PARTIAL | DONE | [error_mapper.dart](../lib/core/error/error_mapper.dart) decodes the published string quantities. [stock_shortage_dialog.dart](../lib/features/cart/presentation/widgets/stock_shortage_dialog.dart) identifies the SKU/product, displays structured available/requested amounts, and uses only refreshed cart data as fallback. Checkout offers cart correction; both codes refresh without write retry. [release_error_recovery_test.dart](../test/features/cart/release_error_recovery_test.dart), [stock_shortage_screen_test.dart](../test/features/cart/stock_shortage_screen_test.dart), existing idempotency tests. |
| 6 | Specific bilingual API errors | PARTIAL | DONE | [failure.dart](../lib/core/error/failure.dart) covers the requested CART/SKU/coupon/order/cancellation/role/surface/idempotency codes and both stock refusals. [release_error_recovery_test.dart](../test/features/cart/release_error_recovery_test.dart) exercises all requested codes in Arabic/English. Raw server messages are not shown. |
| 7 | Complete customer order details | PARTIAL | DONE | [order.dart](../lib/features/orders/data/order.dart), [order_detail_screen.dart](../lib/features/orders/presentation/screens/order_detail_screen.dart), [order_server_details.dart](../lib/features/orders/presentation/widgets/order_server_details.dart): inline timeline with legacy endpoint fallback only when absent, cancellation info, accepted price snapshots, short lines/proposal outcomes and server collection amounts. “Paid on delivery” / “Still owed”; unconfirmed amounts stay unknown. [order_detail_screen_test.dart](../test/features/orders/order_detail_screen_test.dart). |
| 8 | Server availability labels; no browsing stock counts | DONE | DONE | [stock_availability.dart](../lib/features/catalog/data/stock_availability.dart), product detail/cards, [cart_screen.dart](../lib/features/cart/presentation/screens/cart_screen.dart): API labels and hidden inventory-derived input ranges. Numeric availability is disclosed only after the explicit stock refusal in item 5. [product_detail_test.dart](../test/features/catalog/product_detail_test.dart), quantity widget tests. |
| 9 | Strict department → subcategory tree | NOT DONE | DONE | [catalog_providers.dart](../lib/features/catalog/presentation/providers/catalog_providers.dart) drops children of subcategories, preserving active filtering, ordering and display metadata. [catalog_category_scope_test.dart](../test/features/catalog/catalog_category_scope_test.dart); existing navigation/carousel/category suites. |
| 10 | Remove negotiation fields | NOT DONE | DONE | [product.dart](../lib/features/catalog/data/product.dart) and generated serializer no longer retain or emit `is_negotiable`, `floor_price`, `points_price`; mock records cleaned. [product_detail_test.dart](../test/features/catalog/product_detail_test.dart) verifies old input fields cannot survive serialization/copying. |
| 11 | Dedicated unavailable-product 404 state | NOT DONE | DONE | [product_detail_screen.dart](../lib/features/catalog/presentation/screens/product_detail_screen.dart) displays localized unavailability rather than a generic server error; transport errors retain retry. [product_detail_test.dart](../test/features/catalog/product_detail_test.dart) covers both languages and directionality. |
| 12 | Whole-unit returns from historical snapshots | PARTIAL | DONE | [order.dart](../lib/features/orders/data/order.dart), [return_request.dart](../lib/features/orders/data/return_request.dart), [after_sales_providers.dart](../lib/features/orders/presentation/providers/after_sales_providers.dart), [after_sales_screens.dart](../lib/features/orders/presentation/screens/after_sales_screens.dart): saved unit/rule controls validation and display, including hidden catalog SKUs. Missing snapshots block returns; caller-supplied rules cannot weaken the saved rule. Dialog closes on account switch. [after_sales_state_test.dart](../test/features/orders/after_sales_state_test.dart), [after_sales_screens_test.dart](../test/features/orders/after_sales_screens_test.dart), [quantity_contract_test.dart](../test/features/commerce/quantity_contract_test.dart). |
| 13 | Required governorate and completion of legacy addresses | BLOCKED | BLOCKED | D1 has not merged; no authoritative governorate address contract/migration note on main. No invented field or address migration. |
| 14 | Zone delivery fees and DELIVERY_ZONE_NOT_SERVED | BLOCKED | BLOCKED | Pending published D1 contract and backend. No Mobile fee calculation or invented refusal schema. |
| 15 | Automatic goods discounts and RTL progress | BLOCKED | BLOCKED | Pending D1 tier/next-tier schema and backend. No invented `next_tier` fields, percentages, thresholds, stacking or monetary formula. |
| 16 | Adjusted delivery fees/totals after phone confirmation | BLOCKED | BLOCKED | Existing detail already displays server fee/total; D1 adjustment and notification behavior cannot be completed/verified until published. No acceptance step added. |
| 17 | Native Firebase push | PARTIAL | PARTIAL | Existing [firebase_push_client.dart](../lib/features/notifications/data/firebase_push_client.dart), [push_lifecycle.dart](../lib/features/notifications/domain/push_lifecycle.dart) and application navigation integration retained. Automated lifecycle/token/session tests pass. External Firebase/APNs/backend configuration and physical-device delivery remain pending. |
| 18 | Account deletion and private-state cleanup | DONE | DONE | Official `DELETE /me/account`, blocker messages, credential/journal cleanup and deletion-aware push reset retained. [auth_providers.dart](../lib/features/auth/presentation/providers/auth_providers.dart), [auth_repository_remote.dart](../lib/features/auth/data/auth_repository_remote.dart), account-deletion and push lifecycle tests. Live deployment verification is item 21. |
| 19 | Functional official privacy and support links | PARTIAL | PARTIAL | [privacy_policy_provider.dart](../lib/features/settings/presentation/providers/privacy_policy_provider.dart) plus new [support_provider.dart](../lib/features/settings/presentation/providers/support_provider.dart); existing account rows open configured system destinations. Missing values show bilingual unavailable guidance. [privacy_policy_test.dart](../test/features/settings/privacy_policy_test.dart), [support_test.dart](../test/features/settings/support_test.dart), [account_identity_test.dart](../test/features/settings/account_identity_test.dart). **Official URLs/contact absent; live support verification PENDING** until Hiader supplies them. |
| 20 | Signed Android AAB, iOS distribution archive, stable localization | BLOCKED | BLOCKED | Deterministic localization guard retained and reverified; native compilation evidence is separate below. Android signing properties absent; no local Apple distribution identity found. Signed AAB/archive/export and store setup remain pending. |
| 21 | Deployed API and bilingual/RTL device testing | BLOCKED | BLOCKED | No production API URL supplied. Automated Arabic/English/RTL, resizing, session and money-safety checks are not live Mobile/device verification. |

Exact changed-file diffs are in the linked PRs below.

## What existed and what changed

Preserved the completed prior PRs #109 and #115–#123: customer-only profile/release
role/routing enforcement, pending-only direct cancellation, versioned decisions,
secure checkout recovery, explicit complete PRICE_CHANGED consent, server
availability, account deletion, privacy integration and Firebase lifecycle.
Existing agent code and frozen monitor functionality were preserved.

This task completed category depth filtering, obsolete-field removal, product-404
copy, order detail snapshots/resolution/collection wording, historical return-unit
validation and dialog ownership, stock-refusal details/cart correction, missing
role/surface error messages and external Support integration. Existing navigation,
carousel, visual layout and money-writing workflows were retained.

No SSE, notification preferences/type filter, brand filters/facet counts, new
per-SKU/from-price display, Retry-After, coupon currency display, monitor or agent
features were implemented.

## D1 and backend dependencies

[PR #114](https://github.com/haideraljiryawe/Shubayr/pull/114) is still unmerged.
Its remote branch currently publishes the October 12 decisions, not a merged
Mobile migration/implementation contract. Main's newest migration note is
`docs/mobile/contract-changes-v14.1-to-v14.2.md`; the verified API remains 14.2.0.
Re-fetch main and verify the actual OpenAPI, migration notes and backend support
before starting items 13–16. The lead's proposed field names are not a substitute
for that publication.

When D1 arrives: mandatory governorate including legacy completion; backend zone
fees; goods-only automatic discount versus coupon, whichever is larger; server
next-tier progress; staff fee adjustment with the updated customer total and
notification, without a separate acceptance step.

Stock-error detail is conditional on what the server actually returns.
`FieldError` documents `requested`, `available`, `variant_id`; inventory's
`INSUFFICIENT_STOCK` supplies them, whereas current cart
`REQUESTED_QUANTITY_UNAVAILABLE` can omit them. The client uses fresh cart values
where a line can be identified and otherwise gives safe generic correction
without guessing quantities. The backend owner should also reconcile
`INSUFFICIENT_STOCK` with the `/orders` route's `x-error-codes` list. No backend
source/contract changes were made in this task.

## External release requirements

- Real deployed HTTPS `API_URL`; TLS/authentication, idempotency, order decisions,
  returns and account deletion acceptance against that deployment.
- Published real `PRIVACY_POLICY_URL` and Hiader's `SUPPORT_DESTINATION` (production
  HTTPS, a single `mailto:` recipient, or international `tel:` destination).
  Missing configuration is deliberately unavailable, never a fabricated URL.
- Actual Firebase platform app options via external build configuration;
  backend FCM service credentials in its secret manager; APNs key/certificate in
  Firebase, Apple Push capability and regenerated provisioning. Never bundle
  private keys, service accounts or signing passwords in Dart defines.
- Android upload/distribution keystore and external signing properties; Apple
  distribution certificate/profile, signed archive and export. Existing native
  identifiers remain `com.shubayr.app`, app version `1.0.1+2`.
- Play/App Store console access, signing setup, required privacy/deletion
  declarations, published policy/support details, metadata/screenshots and
  submission review.
- Physical Android/iOS foreground/background/terminated push, permission denial,
  token rotation, logout/offline cleanup/account switching; Arabic/English/RTL,
  real keyboards, offline recovery and deployed checkout/returns tests.

Production HTTPS and signing checks remain enabled. No production values were
invented. No emulator, local acceptance database or container was started for
this task. GitHub real-data acceptance is separate from deployed Mobile testing.

## Verified source and integration

The complete implementation was verified at commit
`1476aa5a0e39086e4b9ab1804018acdbd1fcd63a`; the report update changes documentation
only. The starting main was `cefffbe16c25e4f83e6f243e4f29e8c6e26e56db`.
The authoritative contract and migration list were re-fetched on October 12.

| PR | Change | Integration evidence |
| --- | --- | --- |
| [#124](https://github.com/haideraljiryawe/Shubayr/pull/124) | Catalog hierarchy, obsolete fields, unavailable product | Normal merge `235a7254dc8712a0f9cbd7774807499f097528c6`; current-head CI passed |
| [#125](https://github.com/haideraljiryawe/Shubayr/pull/125) | Customer order snapshots, resolution and collection | Normal merge `d75a7453f1d66a3f1e2acd305c3d80e5ffc2e629`; current-head CI passed |
| [#126](https://github.com/haideraljiryawe/Shubayr/pull/126) | Historical return units and session ownership | Normal merge `96f1e8c302d5e0fb624b5fb21fc29930e8c98faf`; current-head CI passed |
| [#127](https://github.com/haideraljiryawe/Shubayr/pull/127) | Stock refusal recovery and specific errors | Normal merge `06d88d2055d2ed52a55ca961dbc8279eb5014048`; current-head CI passed |
| [#128](https://github.com/haideraljiryawe/Shubayr/pull/128) | External support destination and this integrated readiness report | Complete local verification below; current-head GitHub checks and final merge record are on the PR |

PR #128 carries this report, so its own final merge SHA cannot be embedded in this
source commit. The final conversation handoff records the resulting main commit.
No squash, rebase or force push was used.

## Verification results

- Complete integrated Flutter suite: **2,061 passed, 5 existing skips**.
- `flutter analyze --no-pub`: **no issues**. Focused tests include both languages,
  RTL, narrow/large-text stock feedback, saved quantity rules and account changes.
- Localization guard: **unchanged after two generations**, before and after both
  native build attempts. No tracked localization drift from release builds.
- Unsigned iOS release compilation: **passed**, `Runner.app` **25.3 MB**. This is
  compile/link evidence only: no production values, signing, distribution archive,
  device launch or APNs delivery were verified.
- Android release AAB: **blocked as expected** at `:app:validateProductionSigning`
  because external `android/key.properties` is absent. No debug-signing fallback
  or guard bypass; no signed AAB produced. Gradle/AGP/Kotlin future-support and
  Cupertino font warnings were also emitted, without being the stopping error.
- GitHub project checks and full-history secret scans passed on the final heads
  of #124–#127. The final #128 head must pass independently before normal merge.
  Unchanged Backend/real-data CI logs inspected on #125's final head report
  **47 Jest suites / 1,195 tests**, **2 strict-response checks**, **27 acceptance
  packs / 2,714 assertions / 29 operation replays**. The acceptance database was
  removed by CI. These are CI integration checks, not deployed Mobile acceptance.
- Physical-device, deployed production API, Firebase/APNs end-to-end and signed
  distribution acceptance: **not performed / pending**.

## Revised remaining effort — all incomplete items

Engineering estimates after contracts/configuration are available; implementation
items marked DONE have zero further planned coding days. Cross-feature deployment
checks for those items are included once in item 21, not double-counted.

| Remaining plan item | Working days |
| --- | ---: |
| 13: governorate input and legacy-address completion | 1–2 |
| 14: zone fees and unserved-zone handling | 0.75–1.5 |
| 15: automatic discounts and bilingual/RTL progress | 1.5–3 |
| 16: confirmed fee changes, totals and notification integration | 0.5–1 |
| 17: Firebase/APNs setup integration and physical-device validation | 1.5–3 |
| 19: real policy/support configuration and live link validation | 0.25–0.5 |
| 20: distribution signing/builds, localization/build check and submission preparation | 1–2 |
| 21: deployed Mobile flows, Android/iOS bilingual/RTL acceptance and fixes | 2–4 |
| **Total remaining customer Release 1 engineering effort** | **8.5–17 person-days** |

This replaces the earlier 3.75–7.5-day estimate, which deliberately omitted D1 and
store/release work. It includes every incomplete item in the 21-item plan.
External waiting, backend/Web Admin implementation and their eight-day window,
store review elapsed time and excluded agent/post-launch features are not Mobile
engineering days. Contract changes or significant device-only failures may change
this estimate. Backend D1 work, policy/support publication and Firebase/signing
setup can proceed in parallel; platform device checks can overlap with API
acceptance when the team has capacity.

## Verification commands

From `mobile/`, with dependencies available:

```sh
flutter analyze --no-pub
flutter test --no-pub
dart run tool/check_localizations.dart
flutter build ios --release --no-codesign --no-pub
```

Unsigned compilation is not a distribution archive. Real signed release commands
require the actual external production configuration and signing assets. Follow
[push integration and device checklist](push-notifications-release-1.md) before
claiming delivery or release readiness.

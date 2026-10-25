# Shubayr — Project Development Notes and Requirements

**Status:** Draft / Pending Team Review — not final. Completed Flutter work was separately authorized; remaining requirements and recommendations are pending review.
**Created:** 2026-10-18
**Last updated:** 2026-10-24
**Primary audience:** Backend, Web Admin, Web Store, and Flutter teams.

## Executive summary — team review handoff

All **12 notes (NOTE-001–NOTE-012)** were reconciled on 2026-10-18 against the current Flutter working copy and the Backend, Web Admin, Web Store, and API sources from `origin/main` at `17161ea` (contract **17.4.0**). This is a source-based handoff, not production or browser acceptance. “Implemented” below means present in the reviewed code; it does not mean deployed. Earlier review observations and test counts are historical evidence; later implementation sections and this summary take precedence for current status.

NOTE-013 was added on 2026-10-24 from a focused OTP review against `origin/main` at `af09cf2` (contract **17.12.0**). It records the locally implemented OTPIQ adapter and outstanding OTP controls; it does not re-audit or supersede the historical evidence for NOTE-001–012.

### Remaining work by team and dependency

Priorities below are a proposed implementation order, not new requirements or release approval. **P1** covers correctness and shared prerequisites; **P2** covers management and presentation enhancements. Teams can proceed in parallel on work supported by the existing contract.

| Owner | Remaining work | Priority and dependency |
|---|---|---|
| Backend/API | Define account-persistent order/notification hiding, ownership, terminal/after-sales eligibility, bulk scope and badge behavior (NOTE-005). The per-order portion of NOTE-011 is delivered in contract 17.7.0; rolling quotas remain deferred. | P1; Backend contract and agreed policies first, then clients. No local-only substitute. |
| Backend/API | NOTE-001 structured banners/default composition and NOTE-004 managed Recently Added selection are delivered in contract 17.7.0. Platform-specific artwork variants remain intentionally excluded. | Client teams may now adopt the additive contract; existing banner CRUD/media are reused. |
| Backend/API | Add country-aware validation with safe legacy-identity handling (NOTE-007). Supply more specific documented error codes only where current codes cannot express actionable business failures (NOTE-012). | P1 review; neither blocks current Flutter phone input nor ordinary web error localization. No account rewrite or new localization API is implied. |
| Backend/API | Delivery summaries/search, invoice/payment/remaining-collection semantics, governorate/contact semantics, and action eligibility (NOTE-002). | P1 correctness **if the future delivery add-on is approved**; release scope must be resolved first. Existing `amount_due` is not a remaining balance. |
| Web Admin | Add category description fields and soft editorial guidance/previews (NOTE-003/008); upload/crop/preview/replace/remove category images (NOTE-006). | P2; existing category/media API is sufficient. Treat NOTE-003/008 as one editor task. No current category icon picker was found to remove. |
| Web Admin | Build Home Banners management using existing CRUD/media/schedule/order support; integrate new semantics when agreed (NOTE-001). Add Recently Added settings and product-limit controls (NOTE-004/011). | P2; banner basics can start now; new banner behavior, Recently Added settings and quota controls depend on Backend contracts. |
| Web Admin | Official login branding/favicon/title review, central localized error handling, full language-switch audit (NOTE-012); international work-phone alignment (NOTE-007). | P1 for safe localized feedback; P2 for branding and input alignment. Reuse existing `next-intl` and error codes. |
| Web Store | Official login branding/favicon, localized safe feedback and language-switch retention (NOTE-012); Zain typography integration (NOTE-009); international sign-in/address phones (NOTE-007). | P1 for feedback correctness; P2 for branding, typography and phone alignment. Current contracts largely suffice; protect existing identities. |
| Web Store | Align banner artwork, structured actions/defaults and genuine No Action (NOTE-001); consume agreed product quotas (NOTE-011). | P2, after the relevant Backend contract. Web customer hiding, if scheduled, must use NOTE-005's shared account state. Recently Added is currently requested for Flutter Home, not an additional Web Store feature. |
| Flutter | Keep completed current-API work below. Implement managed banner enhancements, Recently Added, account hiding and quota feedback only after their agreed contracts (NOTE-001/004/005/011). Complete delivery summaries/search/collection information only within approved add-on scope (NOTE-002). | Dependent work; no fabricated API fields, client-only quota/hiding state, or per-card request fan-out. No new Backend work is needed for completed category display or bulk-read functionality. |

### Verified completed work and reconciliation

- **NOTE-002:** on-demand assigned-delivery details, View Details navigation, compact cards, truthful order-total/collection wording and contact protections are implemented. Readable reference/contact summaries and search are still missing from the list API; the detail page does not remove those dependencies.
- **NOTE-003/006/008:** real category descriptions, two-line responsive presentation, API images across category levels and Flutter category-icon cleanup are implemented. Admin description/image editing and editorial previews remain pending. Legacy `icon_key` storage/serialization is retained safely.
- **NOTE-007:** integrated international phone input, country-aware E.164 conversion, centralized readable LTR display, primary/alternate address contact handling and shared form/helper/radio spacing are implemented. Locale-aligned phone labels are fixed. The typography audit found no unintended Arabic/English size mismatch; no blanket English enlargement was made.
- **NOTE-010:** the Flutter bulk-read action uses the existing persistent account-wide API and refreshes inbox/badges. Web Admin/Web Store already support bulk read. This is complete current-API work, **not** the hiding feature in NOTE-005.
- **NOTE-001/004/011:** the additive Backend/API contract is delivered in 17.7.0; Web Admin/Web Store/Flutter adoption remains. NOTE-011 rolling-window quotas are deferred. **NOTE-005/009/012** remain pending as described below.
- The same handoff also preserves the previously authorized API 17.4.0 Flutter migration: Returns v2 statuses/detail/reason codes and durable operation identifiers, order/pricing/discount presentation, store information and notification destinations. These compatibility changes are not additional numbered requirements.

**Overlap resolution:** NOTE-003 owns category description editing/display; NOTE-008 adds soft editorial guidance to that same editor. Its proposed 24-character name/60-character description guidance supersedes the earlier six-word/36-character helper as an editorial recommendation, not a storage limit. NOTE-006 owns category artwork, while NOTE-001 owns banner artwork. NOTE-007 defines phone behavior and NOTE-012 defines web localization; share their controls/error translations. NOTE-009 changes Web Store typography only; NOTE-012 does not implicitly authorize a Web Admin font replacement.

**Release-scope decision:** `docs/decisions/2026-10-12.md` and `2026-10-17.md` defer the delivery-agent application to a future add-on. NOTE-002 preserves the owner's subsequently authorized Flutter work and findings, but does not silently amend those product decisions or approve a delivery-app release. The team/owner must reconcile the release scope before scheduling its remaining Backend work. No agent-wage feature is added here.

**Other decisions still open:** hiding eligibility/restore/bulk and badge semantics; rolling-quota counting/window/returns policy; category artwork targets and whether variants are justified; and web official-branding/configuration precedence. Contract 17.7.0 resolves the launch banner, Recently Added and per-order-only choices without approving rolling quotas or platform artwork variants.

### Verification and handoff limits

- Latest full Flutter regression result: **2,227 passed, 8 skipped**; static analysis reported no issues. File hashes for all 543 Flutter files recorded at the subsequent documentation baseline still match, so those results remain applicable without rerunning the whole suite. The eight skipped tests are opt-in live integration tests, not failed tests.
- A separate real local API run passed **3 phone sign-in-to-OTP/address roundtrip cases** using API 17.4.0 and an isolated throwaway verification database. External SMS was disabled; temporary resources were removed. Earlier delivery integration was GET-only. These checks do not claim live acceptance of financial mutations or every new backend module.
- Final handoff checks: fresh static analysis passed; local launch/access tooling tests passed **12 tests with 1 opt-in test skipped**, and the Admin launcher passed its syntax check. Flutter/document whitespace checks passed. The imported `main` documentation contains an existing extra blank line at the end of `docs/notifications/push-testing.md`; it was left unchanged.
- Changed-file secret scanning found only two existing synthetic/example values from `main`. Full-history scanning identified the known synthetic expense-test idempotency key under its new main merge fingerprint; the narrowly scoped existing allowlist was extended for that exact fingerprint, without disabling a detection rule. No real secret or personal runtime configuration was identified in the pending changes.
- This final review updates the requirements document and the single secret-scanner false-positive fingerprint; it makes no new application-code changes. The existing merge brings Backend/Web Admin/Web Store from the reviewed `main`; no additional implementation edits to those applications are included. Existing device/Docker connection settings are retained.
- The owner has now separately authorized commits and a push to `origin/mobile` for review. That authorization does not make this document final or approve its remaining requirements, production deployment, a push to `main`, or a Pull Request.

## Purpose and maintenance

This document is the ongoing collection of the project owner's development notes and requirements. It will be reviewed collaboratively before being handed to the implementation teams. It remains a draft until the owner explicitly declares it final.

- Add future notes to this same document as separate, numbered sections with stable identifiers.
- Update an existing section when a later note clarifies or changes that requirement; record material changes in the revision history.
- Distinguish verified existing functionality, requested requirements, recommendations, and decisions still awaiting agreement.
- Recording a requirement does not authorize implementation. This document does not replace the authoritative API contract or approve proposed contract changes.
- Do not mark recommendations or open decisions as agreed without an explicit decision.

## Notes index

| ID | Subject | Status |
|---|---|---|
| NOTE-001 | Home Page Banner Management | Backend/API contract delivered in 17.7.0; client UI adoption pending |
| NOTE-002 | Delivery Agent – Order Management Improvements | Current-API Flutter improvements implemented; Backend/API pending; future-add-on release scope needs agreement |
| NOTE-003 | Main Categories – Description | Flutter display implemented; Web Admin editing required; see NOTE-008 |
| NOTE-004 | Recently Added Products | Backend/API contract delivered in 17.7.0; Admin/Flutter adoption pending |
| NOTE-005 | Customer Order History and Notifications – Hide Functionality | Draft; account-level Backend/API support required before client implementation |
| NOTE-006 | Category Images and Icon System Migration | Current-API Flutter migration implemented; Web Admin image workflow and editorial decisions pending |
| NOTE-007 | International Phone Input, OTP Display, and Delivery Contacts | Flutter implemented; deeper Backend validation and web input alignment pending |
| NOTE-008 | Category Name and Description Editorial Guidance | Flutter display supported; Web Admin soft guidance/preview required |
| NOTE-009 | Zain Font for Web Store | Asset review complete; Web Store implementation pending |
| NOTE-010 | Mark All Notifications as Read | Flutter implemented using existing bulk API |
| NOTE-011 | Product Purchase Quantity Limits | Per-order Backend/API delivered in 17.7.0; client adoption pending; rolling quota deferred |
| NOTE-012 | Web Applications – Branding and Localization Improvements | Source audit complete; Web Admin/Web Store requirements; conditional Backend error-code follow-up |
| NOTE-013 | OTPIQ SMS OTP Delivery | Adapter reviewed; C23 adds shared cooldown/quotas, atomic attempt limits, anti-fraud IP and an operator live-check; activation remains manual |

## NOTE-001 — Home Page Banner Management

**Implementation update (2026-10-19):** contract 17.7.0 delivers the additive
Backend/API portion: bilingual text with server fallback, `show_text`, internal
names, structured actions, resolved target availability, prioritized protected
defaults, 0/1/2+ feed composition, computed status and atomic full reorder.
Legacy fields remain. Single-boundary schedules remain valid. A failed feed is
not treated as an empty feed; clients must not fabricate or revive expired
campaigns. A failed image may be omitted while the rest of Home remains usable.
Client screens/artwork are separate follow-up work.

### 1. Objective and scope

Provide a simple, complete Web Admin workflow for managing home page banners shared by the Flutter app and the Web Store. Administrators should be able to change campaign content, images, schedules, display order, and supported click destinations without a new mobile release or a code change for each campaign.

An initial coordinated implementation may require changes across Backend, Web Admin, Web Store, and Flutter. Adding entirely new action types later may still require client development. No such implementation is authorized by this draft.

### 2. Verified current baseline

Review date: 2026-10-18. Flutter was inspected on the `mobile` branch at `b141b04`. Backend, Web Admin, and Web Store were reviewed against freshly fetched `origin/main` at `17161ea`. The authoritative API contract version was **17.4.0**. These observations describe those revisions, not an independently verified production deployment.

| Area | Existing functionality | Gap or qualification |
|---|---|---|
| Backend management | List, create, read, update, and delete banners; permission `catalog.products`. | No dedicated Web Admin banner screen was found. Reuse the existing operations. |
| Public banner feed | Returns all enabled banners within their display windows, ordered by `sort_order`, with stable tie-breaking. | No managed default-banner selection behavior exists. |
| Content | Required title, optional subtitle, image URL, optional link and CTA label. | No separate Arabic/English content fields, explicit text-visibility control, or structured internal action types. |
| Images | Existing managed image upload service; banner writes require a URL from that service. Web Admin already has image preparation/upload utilities for other catalog screens. | No banner-specific crop, preview, or separate mobile/web artwork workflow. |
| Scheduling | Optional start/end times, enable/disable flag, and validation that an end follows its start. Expired records remain stored and editable. | Permanent/Scheduled must be exposed clearly in the new interface. Retention should be preserved, not rebuilt. |
| Flutter carousel | Multiple banners, circular manual navigation, five-second autoplay, RTL support, position indicators, and interaction/lifecycle pauses. | A single banner has no paging or indicators; an empty list hides the section. No default-banner substitution exists. |
| Flutter artwork | Full-card image with proportional cover cropping, text overlay, dark scrim, and responsive geometry based on a nominal 2:1 ratio. | Actual geometry can vary with width and text size. Text height is measured, but there are no banner-specific editorial line limits. |
| Flutter actions | Tapping an actionable banner opens its valid HTTP/HTTPS URL externally. An absent/invalid URL is inert. | Product, category, and offers destinations are not resolved as internal banner actions. CTA text is not rendered as a separate button. |
| Web Store carousel | Multiple slides, swipe/scroll navigation, arrows, dots, and six-second autoplay with hover/focus/hidden-tab/reduced-motion handling. | Empty results or feed failures currently hide the section; no managed default-banner policy exists. |
| Web Store artwork | Responsive text-led card with contained artwork in a separate area. | Artwork is hidden below the `sm` breakpoint. This is materially different from Flutter's full-card image presentation. |
| Web Store actions | Renders a CTA link using the supplied URL. | A missing URL becomes `/categories`, and a missing CTA label gets default shopping text. Therefore, No Action is not respected consistently across clients. |

The live local environment used by the iPhone simulator was also checked during the initial review. It contained three enabled banners: Technology essentials had no expiry, Seasonal offers expired on 2026-10-09, and Home refresh expired on 2026-10-16. Only the first was eligible on the review date. All three had empty click URLs. This explains the single visible banner in the supplied screenshot; Flutter is not limited to one banner.

The initial review's 69 existing Flutter banner tests passed. This confirms existing tested behavior; it does not validate the new requirements below. The Web Store findings are based on source review, not a new visual browser acceptance test.

### 3. Banner management requirements

- Provide a dedicated, clearly discoverable **Home Banners** screen in Web Admin.
- Support adding, editing, deleting, reordering, enabling, and disabling banners, reusing existing backend capabilities where applicable.
- Show an image thumbnail, an identifying title, display order, schedule, action destination, and effective status in the list.
- Make reordering straightforward. Up/down controls are sufficient initially; drag-and-drop is an optional convenience, not a prerequisite.
- Display these effective statuses: **Active**, **Scheduled**, **Expired**, and **Disabled**. An enabled but expired banner must not be labeled Active. Disabled should take precedence when the manual switch is off.
- Preserve the existing permission model unless a separate banner permission is explicitly agreed.
- Make deletion deliberate and clearly different from disabling. Expiry must never delete a record.

### 4. Banner images and responsive presentation

**Requested behavior**

- Allow uploading custom artwork for each banner using the existing media service.
- Provide a simple crop and reposition tool before saving, with an accurate preview of the resulting composition.
- Review Flutter and Web Store layouts together before selecting a shared aspect ratio. Include narrow phones, tablets, and desktop screens, including the Web Store on phones.
- Preserve image proportions. Do not stretch artwork or compress it unevenly to fill a container.
- Keep essential artwork, embedded promotional text, and logos within a documented safe area. Preview any intentional crop rather than hiding it from the administrator.
- Define and communicate accepted formats, recommended dimensions, minimum usable resolution, and maximum upload size. Optimize delivered images for display quality and loading speed.
- Support image-led campaigns on both platforms. The current Web Store behavior of hiding artwork on small screens must be addressed, particularly when overlaid text is disabled.
- If one source image cannot produce acceptable crops on both platforms, evaluate an optional mobile image and web image. Avoid making duplicate uploads mandatory when one image works well.

**Recommendations to validate, not approved specifications**

- Start visual evaluation with a **2:1** shared composition, reflecting Flutter's current nominal ratio. Do not assume the current Web Store layout already follows that ratio.
- Use **1600 × 800 pixels** as an initial shared-image design candidate and aim for an optimized delivered file around **300–500 KB** when visual quality permits. Final dimensions, delivery targets, and upload limits need agreement after cross-platform review.
- Existing general catalog image utilities accept JPEG, PNG, WebP, and AVIF, use an 8 MiB upload ceiling, and target a longest edge of 1600 pixels during preparation. These are reusable facilities, not an approved banner-specific specification.
- Prefer one shared image with a visible crop preview first. Add optional platform-specific artwork only if representative designs demonstrate that a shared composition is inadequate. Decide how phone-sized Web Store pages select artwork before adopting variants.

### 5. Banner scheduling and reuse

- Offer two clear display modes:
  - **Permanent:** no scheduling restriction; eligible until manually disabled.
  - **Scheduled:** an explicit start date/time and end date/time, with the end after the start.
- Display and edit scheduling times in **Asia/Baghdad**, clearly labeled, consistently across preview and status displays.
- Preserve the manual enable/disable control independently of scheduling. Disabling a scheduled banner should not erase its saved dates.
- Keep expired banners available for editing and reuse in a future campaign. Updating their schedule or deliberately changing them to Permanent should not require recreating them.
- Clearly preview the effect of switching between scheduling modes, especially removal of an old end date.
- Agree on how existing records with only one schedule boundary are represented or migrated. Do not silently reinterpret them.

### 6. Titles, descriptions, and readability

- Support a main title and an optional subtitle/short description.
- Allow hiding customer-facing text when the artwork already contains the promotional message. Preserve an administrative identifier so image-only banners remain easy to manage.
- Support Arabic and RTL correctly. Avoid assuming an English title plus an Arabic subtitle is a localization model; the current API stores each text field only once.
- Use responsive typography, safe internal spacing, suitable text-length limits, and line limits that prevent text from escaping the banner.
- Validate long Arabic and English content, narrow screens, and enlarged accessibility text. Explain limits in the editor and reflect them accurately in previews.
- Maintain readable contrast between text and artwork through a suitable overlay or similarly simple presentation treatment.

**Proposed starting point for review:** up to 60 characters for the displayed title and 120 for the subtitle, with a target of two lines each at ordinary text size. These are editorial candidates, not approved contract limits; the existing title limit is 200 characters. Final limits must account for Arabic wrapping and accessibility without silently losing important content.

**Open decision:** whether separate Arabic and English content is required at launch, and how missing translations should behave. Also decide whether title and subtitle visibility should be controlled together or independently.

### 7. Default banners and minimum carousel content

This is a core requirement. Prepare **at least two distinct default banners**, designed for Shubayr's identity and containing useful, evergreen information about the app or store. They must look intentional, remain unobtrusive, and avoid time-sensitive promises or unverified commercial claims.

Possible content directions, subject to owner approval, include discovering store departments and explaining a useful shopping feature. Artwork and final copy are future deliverables; this document does not create or approve them.

“Eligible regular banners” means enabled campaign banners whose schedules permit display at the current time. The count must be evaluated after those conditions are applied.

| Eligible regular banners | Requested outcome / proposed composition |
|---|---|
| Two or more | Show regular banners in their configured order. Do not insert default banners. |
| Zero | Show at least the two approved, distinct default banners. Do not leave the banner section empty. |
| Exactly one | Proposed policy: show the regular banner first, followed by one selected default banner, providing at least two distinct slides and preserving Flutter's neighboring-slide presentation. |

The zero-banner and sufficient-banner rules are requested requirements. The exact single-banner policy is a recommendation awaiting confirmation. Prefer a stable, administrator-defined default priority over random selection; do not duplicate the same campaign merely to fill two positions.

Defaults should follow the same image quality, readability, and action rules as regular banners. The system should protect the minimum default set from accidental removal without replacement. The ownership, storage, and replacement workflow for these defaults remain to be agreed.

**Separate decision:** an unavailable feed is not the same as a successful response with no eligible campaigns. Agree on whether approved defaults should also appear during network/API failures, how they remain available then, and how failures remain diagnosable. Never silently revive expired advertisements as a fallback. Also define behavior for individual image failures.

### 8. Banner click actions

Provide an explicit **On click** selection in Web Admin:

| Action | Administrator input | Expected customer behavior |
|---|---|---|
| Open Product | Search and select a product | Open that product inside Flutter or on its Web Store page. |
| Open Category | Search and select a category | Open the selected category's relevant browsing destination. |
| Open Offers | Select the action; no identifier entry | Open the offers listing on the current platform. |
| External URL | Enter a valid HTTP/HTTPS address | Open the external destination using an agreed platform-appropriate behavior. |
| No Action | No destination | Display the banner without an active CTA or misleading click affordance. |

- Do not require administrators to type product/category identifiers or application routes.
- Show the selected destination in preview and before saving. Validate that the required target is supplied for the chosen action.
- If a previously selected product/category becomes unavailable, fail gracefully with clear customer feedback and a useful administrative indication; do not redirect to an unrelated destination.
- Apply No Action consistently. Specifically, remove the Web Store's implicit categories destination for banners explicitly intended to be non-clickable.
- Decide whether the whole banner, a visible CTA, or both are interactive, and apply that decision consistently and accessibly. Flutter currently uses the whole banner; Web Store currently renders a CTA.
- Keep existing external-link banners compatible when introducing structured actions. Backend/API and both clients must agree on the action contract before implementation.

### 9. Additional practical recommendations

The following are useful proposed additions, not already approved scope:

- **Preview before publishing:** phone and desktop views showing crop, text visibility, destination, and scheduling eligibility. If scheduling preview is included, show the preview time explicitly.
- **Duplicate a banner:** copy reusable content into a new disabled record for review, avoiding accidental publication with an old schedule or destination.
- **Simple status filtering:** find expired and disabled campaigns quickly for reuse; retain existing editing rather than adding a complex campaign lifecycle.
- **Accessible carousel controls:** retain manual navigation and sensible autoplay pauses; review reduced-motion behavior across clients. A marketing configuration panel for animation timing is unnecessary unless a real need emerges.
- **Efficient image loading:** optimize and cache artwork, prioritize the initially visible slide, and avoid loading all large images eagerly. Keep banner failures from blocking the rest of the home page.
- **Predictable freshness:** agree when edits, disable actions, and schedule boundaries become visible to customers. The Web Store currently has configurable public-data caching, with a default 10-second banner cache, while Flutter refreshes through its existing data flow. Do not promise immediate updates to already-open pages without defining refresh behavior.

Avoid introducing analytics dashboards, audience targeting, approval workflows, or other campaign-management complexity unless separately requested.

### 10. Decisions requiring agreement

| Decision | Current position |
|---|---|
| Shared image ratio, resolution, file-size targets, and safe area | Validate the proposed 2:1 starting point and sample artwork across both platforms. |
| Single artwork versus mobile/web variants | Prefer one source where acceptable; introduce optional variants only when justified. |
| Text limits, visibility controls, and localization | Validate editorial limits and decide bilingual field/fallback needs. |
| Single regular banner composition | Recommend regular banner first plus one default; owner confirmation pending. |
| Default-banner ownership and protection | Decide who edits/replaces defaults and how two usable defaults remain available. |
| Network/API/image failure behavior | Define separately from the zero-eligible-campaign fallback. |
| Clickable surface and external browsing behavior | Align Flutter and Web Store, including explicit No Action. |
| Existing data compatibility | Agree treatment of old URLs, text fields, and partially bounded schedules. |
| Refresh and scheduling visibility | Agree practical freshness expectations for both new and already-open pages. |

### 11. Draft acceptance checklist

These checks define expected outcomes for later implementation review; they are not completed work.

- [ ] An authorized administrator can create, edit, delete, reorder, enable, and disable banners from Web Admin.
- [ ] Upload, crop, and preview work without image distortion; artwork remains visible and usable on phone, tablet, and desktop layouts.
- [ ] Permanent and Scheduled behavior is clear, uses Baghdad time, and preserves expired campaigns for reuse.
- [ ] Titles and descriptions remain readable in Arabic/RTL and English; image-only banners do not receive unwanted text overlays.
- [ ] At least two approved default designs exist and satisfy the agreed zero/one/multiple-campaign selection rules.
- [ ] All five action types work consistently across Flutter and Web Store, with searchable product/category selection and true No Action behavior.
- [ ] Existing manual/autoplay carousel capabilities are preserved, including usable Flutter neighboring slides with the agreed minimum-content policy.
- [ ] Unavailable targets, failed images, feed failures, and publication freshness follow the agreed behavior without blocking home page content.
- [ ] After the initial coordinated release, routine banner content and destination changes require only Web Admin operations.

### 12. Review references

Paths below identify the reviewed sources. Backend, Web Admin, Web Store, and contract observations use the `origin/main` revision recorded above. The current handoff includes those sources through the previously authorized main-to-mobile merge.

- Contract: `api/openapi.yaml` — public/administrative banner operations and Banner schemas.
- Backend: `backend/src/modules/banners/`, `backend/src/modules/media/media.service.ts`, and `backend/prisma/seed.ts`.
- Flutter: `mobile/lib/features/banners/`, `mobile/lib/core/layout/app_layout.dart`, and `mobile/test/features/banners/`.
- Web Store: `web/src/components/home/hero-banner.tsx`, `hero-carousel.tsx` in the same directory, `web/src/app/[locale]/page.tsx`, `web/src/lib/api.ts`, and `web/src/lib/server-data.ts`.
- Web Admin: route inventory under `admin/src/app/`, navigation in `admin/src/lib/nav.ts`, and reusable image utilities in `admin/src/lib/media-upload.ts` and `admin/src/lib/product-images.ts`.

## NOTE-002 — Delivery Agent – Order Management Improvements

### 1. Objective and review baseline

Make the delivery agent's Flutter workflow useful in the field: compact delivery cards, a clear **View Details** page, customer search, and unambiguous collection information. Reuse existing backend capabilities and keep staff-only financial actions in Web Admin.

**Status:** Working draft. The owner subsequently authorized the current-API Flutter improvements in conversation. Backend/API extensions below remain pending and are not authorized for implementation by this document.

Reviewed on **2026-10-18** against freshly fetched `origin/main` at `17161ea`, authoritative API **17.4.0**, and the current Flutter working copy on `mobile`. At the initial review, the earlier main-to-mobile merge and Flutter edits were uncommitted. Backend and contract sources matched the reviewed main revision. The supplied screenshot records the pre-improvement list design; section 11 describes the implemented design. See the executive summary for the current handoff and future-add-on scope decision.

### 2. Verified data availability at the initial review

The baseline findings in sections 2–8 describe the pre-implementation review. Section 11 records the subsequently implemented Flutter work and supersedes those frontend gaps; unimplemented Backend/API requirements remain open.

The list uses `GET /deliveries/assigned`. A separate, already implemented `GET /deliveries/{id}` returns assignment-scoped details. At that initial review, Flutter implemented the list and status updates but had no delivery detail model, repository read, page, or View Details action. Those frontend gaps are now addressed in section 11.

| Required information | Existing backend support | Required work or qualification |
|---|---|---|
| Recipient name | Detail response includes `recipient_name`. | Flutter can display it now. It currently comes from the customer's current account name, not a separately captured recipient-name snapshot. A distinct recipient name requires a coordinated address/checkout/backend change if desired. |
| Recipient phone | Detail response includes the order's delivery-contact phone. | Use this number, not the customer's login phone or the delivery party's phone. Not present in list rows. |
| Full address | Detail response includes the order's saved label, city, area, street, additional details, and optional coordinates. | Format these fields in Flutter without inventing missing values. The order's governorate snapshot is not exposed here; adding it requires an API/backend extension. |
| Readable order number | Detail response already includes `order_number`. | Use this server-issued reference instead of the UUID. It is absent from list rows. Existing normal references use an `ORD-…` format; development records use references such as `DEV-ORDER-8`. Do not manufacture a shortened identifier by slicing a UUID. A different numbering scheme is a separate decision. |
| Products, quantities, and prices | Detail includes bilingual product names, variant SKU/attributes, quantity, unit, whole-unit rule, unit price, line total, and currency. | Build the detail presentation in Flutter. Preserve fractional quantities and historical name/price/unit values; do not reload current catalog prices to reconstruct the order. |
| Invoice breakdown | List includes delivery fee; list and detail include `amount_due`. | Detail lacks explicit subtotal, discount breakdown, delivery fee, and a separately labeled invoice total. Request these server-owned values; do not derive missing discounts from current prices. |
| Amount to collect and payment state | `amount_due` exists. List also exposes nullable `collection` with confirmation, collected amount, and shortfall. | Flutter reads `amount_due` but ignores `collection`. Both list and detail currently calculate `amount_due` as the order total, without subtracting paid amounts. This is not a reliable remaining-balance field. Payment method/status are absent from agent responses. |

Contact disclosure is deliberately limited: the agent detail route returns name, phone, and address only for `assigned`, `out_for_delivery`, and `failed` deliveries. These fields become null for `delivered` and `returned`. Preserve this rule; the requested new card and page must not silently expand historical contact access.

### 3. Backend-supported work requiring Flutter improvements only

- Add **View Details** using the existing assigned-delivery endpoint. Show order reference, delivery status, available recipient contact, formatted address, products, quantities/units, unit prices, and line totals.
- Present optional fields gracefully. Explain that contact details are no longer available after completion instead of showing stale cached values or treating deliberate nulls as a loading failure.
- Reuse the existing status filters, pagination, pull-to-refresh, session ownership, and duplicate-submission protection.
- Decode and present the existing collection result where supplied by the list: **confirmed in full**, **confirmed short**, or **unconfirmed**. An unconfirmed/null amount must never be labeled zero collected or fully paid. Collection shortfall is not automatically permission for the agent to perform another collection.
- Improve status and error wording while preserving the existing concurrency and collection-confirmation workflow. Put secondary timestamps, retry history, and failure reasons in the detail page rather than overcrowding cards.
- Do not call customer `/orders/{id}` or administrative endpoints to fill gaps. Those routes are not authorized for delivery-agent sessions.

**List-card dependency:** Existing detail reads make these fields available per delivery, but the requested cards cannot obtain order number/name/phone from one list response today. Prefer the small list-response extension below over one additional detail request for every card. Do not describe the complete card redesign as backend-free.

### 4. Requirements needing Backend/API development

1. **Useful list summaries.** Add the existing order reference and permitted recipient name/phone to assigned-delivery rows, plus enough order readiness/collection information to explain permitted actions. Apply the same contact-redaction rules as the detail route. Keep full addresses and product arrays in the detail response.
2. **Server-side customer search.** Add documented search by customer/recipient name and delivery-contact phone, scoped to the current agent and applied before pagination. Combine it with the existing status filter; totals must describe the filtered results. Define phone normalization, partial matching, and how redacted historical records behave. Searching must not reveal another agent's assignments or bypass the contact policy. Searching only the currently loaded page is not an adequate substitute. Order-reference search is a useful optional addition.
3. **Complete invoice information.** Extend delivery details with authoritative subtotal, discounts, customer delivery charge, and invoice total. Include relevant coupon/tier/loyalty allocations where needed to explain the final amount. Preserve historical snapshots and exclude internal cost/profit information.
4. **Clear collection semantics.** Expose payment method, customer-facing payment/collection state, and an explicit amount still requiring collection, or an equally clear server-owned instruction. Distinguish invoice value, customer money received, unconfirmed collection, collection exceptions, and money the agent owes the store. Do not silently redefine `amount_due` for existing clients; agree compatibility and migration behavior first.
5. **Payment scope.** Current checkout supports COD only. Do not imply that card or prepaid checkout is already implemented. If such methods are planned, agree their collection behavior before extending the agent workflow. Even with COD, paid/completed orders must not be presented as requiring the entire invoice again.
6. **Full address and true recipient identity.** Expose the saved governorate name/code in delivery details. Decide whether a recipient distinct from the purchasing account is required; if so, capture and preserve that name through the address/checkout flow rather than simply relabeling the account name.
7. **Action eligibility.** Expose the relevant order state and/or server-computed permitted actions with a clear unavailable reason. Do not let Flutter guess dispatch readiness from delivery status alone. Review how cancelled orders disappear from active work or are clearly marked non-actionable, including contact visibility.

These should be coordinated additions to existing delivery endpoints, not a new parallel order-management API. Any contract change must follow project versioning, generated-type, validation, and mobile migration-note requirements.

### 5. Existing status and collection rules to preserve

| Current delivery state | Next state allowed by the existing transition map | Additional backend condition |
|---|---|---|
| Assigned | Out for delivery | Order must be ready for dispatch. |
| Out for delivery | Delivered or Failed | Order must be dispatched. |
| Failed | Out for delivery | Order must be ready for dispatch or failed; retry preserves custody. |
| Delivered | Returned | Order must be delivered or return requested. |
| Returned | None | Terminal delivery state. |

- Every update requires the current `order_version`. The backend also verifies ownership and that this is the order's current delivery.
- Failed requires a non-empty reason, up to 500 characters.
- Delivered requires an `operation_id` and an explicit confirmed/unconfirmed collection choice. Confirmed additionally requires a decimal-string `collected_amount`; unconfirmed must omit the amount. The operation identifier must remain stable when retrying an uncertain delivery-confirmation result.
- Flutter already sends these fields, persists pending delivered confirmations, validates amounts, and refreshes after conflicts instead of automatically repeating a stale write. These capabilities should be retained, not rebuilt.
- The backend accepts partial confirmed collection. In the ordinary COD case the amount must be between zero and the customer total. Customer-paid external-trip fare introduces an additional minimum: confirmation includes the customer's total payment including that fare, while only the store's share enters custody. Flutter currently knows only the zero-to-total bound; it cannot explain this additional condition from the existing response.
- The existing Delivered → Returned delivery action is not the Returns v2 approval/inspection/refund workflow. Do not describe it as issuing a customer refund. Agree clearer wording and operational ownership before changing its availability.

### 6. Confirmed gaps and observed compatibility issues

| Finding | Evidence and impact | Proposed ownership |
|---|---|---|
| Available details are unused | Flutter displays `order_id`, fee, amount due, and status controls only; the existing detail endpoint was verified locally. | Flutter; list-summary extension coordinated with Backend. |
| Invoice total is presented as money still due | The backend returns order total as `amount_due` even on paid terminal records. Local paid deliveries still returned 18 and 40 IQD; a returned record returned 99 IQD. Flutter uses the same amount-due label across states. | Backend defines explicit balance semantics; Flutter adopts correct labels and collection display. |
| Collection data is dropped | Assigned-list responses have a `collection` field, but the Flutter delivery model does not decode it. | Flutter; add to detail contract if the page needs it independently. |
| Delivery status does not prove order readiness | Local data includes assigned deliveries for pending, confirmed, preparing, and cancelled orders. Flutter offers dispatch based only on delivery status; the backend will reject inappropriate transitions. | Backend/API action eligibility and Flutter controls. |
| Cancelled development order remains assigned | The screenshot's 24 IQD row corresponds to a cancelled order with assigned delivery status. The development seed creates this combination. This is verified locally, not proof of a production incident. Cancellation/assignment lifecycle and seed consistency need review. | Backend investigation; Flutter must handle non-actionable records once identified by the API. |
| Conflict feedback loses useful context | The delivery screen replaces all HTTP 409 failures with one generic conflict message, including potentially actionable accounting or fare errors. | Flutter messaging, with declared backend codes kept authoritative. |
| Recipient and address semantics are incomplete | Account name is used as recipient name; governorate snapshot is missing from delivery detail. | Backend/API if separate recipient identity and complete province information are required. |

The screenshot's 24, 22, and 27 IQD amounts and zero fees match the local database and real API. There is no evidence here of a Flutter thousands-conversion bug. Do not multiply these values or substitute more realistic-looking amounts; development data quality is a separate concern.

### 7. Proposed Flutter experience and practical additions

**Main card:** delivery status, readable order reference, permitted recipient name/phone, and a clearly labeled collection instruction/amount. Add **View Details**. Show a primary operational action only when allowed; keep unusual actions deliberate and contextual.

**Detail page:** group content into delivery/order identity, recipient and address, products, invoice breakdown, payment/collection result, and delivery history/actions. Distinguish order state from delivery state when both are relevant. Refresh before consequential actions and handle reassignment or loss of access by clearing inaccessible content.

**Recommended conveniences, not approved implementation decisions:** tap-to-call for the disclosed delivery phone, copy the order reference/address, open maps when valid coordinates are supplied, and a clear empty/search-results state. Keep Arabic/RTL, long addresses, fractional units, enlarged text, and narrow devices readable. Do not introduce route optimization, offline mutation queues, or additional financial controls without a separate requirement.

Clear contact caches on terminal status, reassignment, and logout/account change. Preserve exact pending collection intent after an uncertain network result, and never suggest another cash collection merely because a confirmation response was lost.

### 8. Local integration verification and limits

This review used the real local Docker Backend (`shubayr-backend-dev:api-17.4.0-review`) and existing development PostgreSQL data. No mock repository or fabricated API response was used. Some existing records are deliberately seeded development examples; they are not production evidence.

- Performed authenticated **GET-only** checks with short-lived, locally issued app tokens for existing local users. Normal backend role/assignment guards remained active; OTP/login/session creation was not exercised.
- Checked both local agents and all **10** assigned deliveries against read-only database queries. Confirmed assignment-scoped lists, all five status filters, pagination, readable order references, and product-detail responses.
- Confirmed available contact fields on **7** nonterminal records and deliberate null contact fields on **3** delivered/returned records.
- Confirmed another agent's detail returns **404**, customer access to the agent list returns **403**, anonymous list access returns **401**, and agent access to customer order details returns **403**.
- An unsupported `q` search parameter returned **422 VALIDATION_FAILED** for both agents; search is not merely missing from Flutter.
- All ten returned `amount_due` values matched stored order totals; delivery fees matched the stored order fees in this dataset. The data contains no collection records for these deliveries, so full/short/unconfirmed collection rendering was not live-tested here.
- No PATCH, POST, DELETE, reseeding, or data correction was performed. Status-transition/collection-write conclusions come from contract and implementation review; new successful writes and replay/failure tests should be run on a disposable database during implementation. No production environment was accessed.
- The supplied screenshot and Flutter source were reviewed; the proposed detail page has not been implemented or visually tested.

### 9. Draft acceptance checklist and decisions

- [ ] Compact cards show a server-issued readable reference and permitted recipient summary without per-card request fan-out.
- [ ] View Details displays existing contact/address/product fields plus the agreed invoice and collection extensions.
- [ ] Search works across the agent's complete authorized result set, with correct totals and status filtering.
- [ ] Paid, partially collected, unconfirmed, cancelled, delivered, and returned records have truthful collection wording; missing information is never treated as zero or inferred payment.
- [ ] Actions reflect both delivery and order rules; stale state, reassignment, accounting conflicts, and uncertain confirmations are handled safely.
- [ ] Terminal/reassigned/account-switched screens do not retain inaccessible contact data.
- [ ] Arabic/English, narrow-screen, large-text, fractional-quantity, permission, and real API integration checks pass on disposable test data.

**Decisions pending:** exact collection/balance fields and compatibility; whether a separate recipient name is required; inactive/terminal search visibility; order-readiness/permitted-action response design; and wording/ownership of the existing Returned action. No new payment method, numbering scheme, or expanded contact access is approved by this note.

### 10. Review references

- API: `api/openapi.yaml` — assigned-delivery list, delivery GET/PATCH, `Delivery`, `DeliveryDetail`, and `DeliveryCollection`.
- Backend: `backend/src/modules/fulfilment/deliveries.controller.ts`, `deliveries.service.ts`, and `dto/assigned-deliveries-query.dto.ts` / `dto/delivery.dto.ts` in the same module; order creation/cancellation in `backend/src/modules/orders/orders.service.ts`; sample data in `backend/prisma/seed.ts`.
- Flutter: `mobile/lib/features/delivery/data/delivery.dart`, `delivery_repository_remote.dart` in the same directory, and `mobile/lib/features/delivery/presentation/` providers/screens; collection validation in `mobile/lib/features/delivery/domain/delivery_collection_input.dart`.
- Migration notes: `docs/mobile/contract-changes-v14.1-to-v14.2.md`, `contract-changes-v13-to-v13.1.md`, and `contract-changes-16.3.0-to-17.0.0.md` in the same directory.

### 11. Current-API Flutter implementation — 2026-10-18

The owner authorized implementing what is possible with the existing API without changing Backend or Web Admin. The following changes are present in the reviewed `mobile` code:

- **On-demand details:** every delivery card has a View Details button. The assignment-scoped detail page uses `GET /deliveries/{id}` and displays the server order number, status, permitted recipient name/phone, saved address, bilingual product snapshots, variant SKU/attributes, fractional quantities/units, unit prices, and line totals.
- **Compact cards:** retain the delivery status, available technical reference, fee, order total, collection result, and actions. Secondary timestamps, failure reason, and retry count appear in the detail page when the already loaded list summary is available. Updating delivery status remains on the card and retains the existing version, ownership, reason, confirmation, and operation-id rules.
- **Honest money labels:** `amount_due` is labeled Order total in cards, details, and the status dialog, with explicit wording that it is not a confirmed remaining collection balance. Existing collection data is rendered as a recorded store collection: full, short, or unconfirmed. Missing amounts remain unknown; a recorded shortfall is not an instruction to collect extra cash. The page explains that discount breakdown/payment method are unavailable rather than reconstructing them.
- **No per-card detail requests:** details are requested only when opened, refreshed, or revalidated. Opening from the list reuses its existing fee/collection/history data when delivery version and status agree. Direct detail navigation fetches only the detail endpoint; it does not scan assigned-delivery pages for optional summary fields. Explicit refresh of a list-opened detail refreshes both relevant reads.
- **Contact protection:** detail state is bound to the authenticated agent/session and disposed when no longer observed. Terminal contacts are discarded, revalidation hides previous details, and denied/not-found reads clear visible contact data. List-observed state changes trigger detail revalidation; the visible page also revalidates on app resume. No continuous background polling or offline contact store was introduced.
- **Useful actions:** copy the order reference/address, call the supplied delivery phone without inventing a country code, and open a map only when valid coordinates are available. Actions have localized failure feedback.
- **Clearer conflicts:** preserve specific feedback for stale order state, closed accounting periods, fare mismatches, and repeated-operation conflicts instead of replacing every HTTP 409 with the same message.
- **Runtime boundary:** normal launches continue to use the real API. Existing test-only adapters remain confined to explicit test overrides; no mock-data runtime or failure fallback was added. Backend, Web Admin, Web Store, database contents, and device launch settings were not changed by this task.

**Still dependent on Backend/API:** name/phone/readable-reference summaries directly in list rows; complete server-side customer search; governorate and a separately captured recipient name; full invoice/discount/payment information; an authoritative remaining-collection instruction; and server-provided action eligibility/cancelled-order handling. These requirements remain in section 4 for team handoff. Cards therefore still use the available technical order reference, while the readable order number is shown in details. They do not perform extra requests to fabricate a complete summary or offer search over only the loaded page.

**Verification:** focused delivery tests passed (98 tests after the final feedback review), covering navigation/request counts, detail parsing, fractional values, session changes, contact redaction/reassignment, collection wording, contact dialing, and Arabic/English layouts including narrow screens and enlarged text. A separate GET-only integration check exercised the actual Flutter remote repository against the local Docker API: all 10 existing deliveries decoded successfully, including 3 terminal records with redacted contacts. No status update or financial write was made during that integration check. The full Flutter suite passed with 2,169 tests and 5 skipped tests; the final focused delivery run passed all 98 tests. `flutter analyze --no-pub` reported no issues and `git diff --check` passed. No manual device/simulator interaction was performed for this task.

The document remains Draft / Pending Team Review. The later handoff authorization permits commits/push to `origin/mobile`; pending Backend requirements still require team review.

## NOTE-003 — Main Categories – Description

### 1. Objective and verified baseline

Show a localized description below each main category name in Flutter, using the existing card design. Review date: 2026-10-18. This note and NOTE-004/005 were reviewed against the current `mobile` working copy, freshly fetched `origin/main` at `17161ea`, and authoritative API **17.4.0**. Backend and Web Admin observations are based on source review; selected public reads were also checked against the local Docker API. These findings do not establish the state of a production deployment.

| Area | Verified existing capability | Gap |
|---|---|---|
| Backend/API | Categories already store and return nullable `description_ar` and `description_en`. Existing admin create/patch operations accept both fields; category reads fall back to the other language when a localized description is empty. | No new description field or endpoint is needed. |
| Web Admin | Catalog > Categories already has create/edit forms. | Those forms currently edit names, parent, slug, visibility, and order, but neither display description inputs nor send description changes. |
| Flutter data | The remote category repository and model already decode both descriptions and provide localized selection. | Data transport is available and does not need a replacement. |
| Flutter presentation — implemented | `CategoriesScreen` now passes the real localized description to `CategoryCard`, with two lines, ellipsis, secondary styling, and no description-specific spacing when empty. | The initial mock-only conditional suppressed real API descriptions; that condition has been removed. Web Admin editing remains pending. |

**Local read verification:** `GET /categories` returned eight root categories, all eight with non-empty descriptions and both description fields present. In that initial environment, missing content was not the reason descriptions were absent; the Flutter presentation condition has since been fixed. No mock data was used for this verification.

### 2. Requirements and team ownership

- **Flutter — implemented with the current API:** pass the real localized description to the existing main-category card. Trim whitespace, use the other language when appropriate, and omit the description and its spacing when neither language has content. Do not add another API call or fabricate text from a category name.
- Keep the preview below the name, at most two lines, with readable secondary typography and ellipsis for overflow. Preserve the artwork, tap target, and responsive card arrangement; allow normal accessibility layout adaptation without clipping the name or overflowing the card. Verify Arabic/RTL, English, narrow screens, and enlarged text.
- **Web Admin — possible with existing Backend operations:** add optional Arabic and English description inputs to the existing category create/edit dialog, load current values, and support clearing a description. Preserve descriptions when editing unrelated fields. Explain the language fallback so the editor understands why the other language may appear after clearing only one translation.
- **Backend/API:** reuse existing storage, read fallback, permissions, and write operations. No mandatory Backend change is identified for the requested display behavior.

**Editorial recommendation, not an approved constraint:** encourage short descriptions in Admin, with an optional two-line preview. The older compact-description helper has six-word/36-character guidance; it is neither the current real-API display limit nor a Backend validation rule. Use NOTE-008 as the consolidated proposed editorial guidance for this same editor. Preserve full stored strings; the two-line display limit remains independent of text length.

**Acceptance:** a real stored description appears without additional requests; a long description stays within two lines; blank descriptions leave no dedicated gap; Admin can save and clear either language without losing unrelated category data.

### 3. Review references

- API: category list and admin category create/patch operations; `Category`, `CategoryCreate`, and `CategoryPatch`.
- Backend: `backend/src/modules/catalog/categories.service.ts` and `dto/category-write.dto.ts` in the same module.
- Web Admin: `admin/src/app/(admin)/catalog/categories/categories-view.tsx`.
- Flutter: `mobile/lib/features/catalog/data/category.dart`, `category_description_limits.dart`, `presentation/screens/categories_screen.dart`, and `presentation/widgets/category_card.dart` under the catalog feature.

## NOTE-004 — Recently Added Products

**Implementation update (2026-10-19):** contract 17.7.0 delivers managed
enabled/max-count/rolling-day settings and `GET /products/recently-added`.
Defaults are disabled/10/30 with bounds 1–50 and 1–365 days. The server filters
positive sellable availability before the cap and pagination and orders by
stored `created_at DESC, id DESC`. Client UI remains follow-up work.

### 1. Objective and verified baseline

Add a Recently Added section to Flutter Home, controlled by the store administrator. Product creation time determines recency; a later edit, price change, or republication must not make an old product newly created.

| Area | Verified existing capability | Gap |
|---|---|---|
| Public catalog API | `GET /products` supports `sort=newest` and pagination. Backend sorts public results by `created_at` descending and restricts them to active, published products in visible category hierarchies. Responses include `created_at`, `in_stock`, and computed availability. | Public queries do not support a creation-date window or an in-stock filter. An active/published product can still be out of stock. |
| Admin catalog API | Has stock-availability filters for administrative catalog management. | This privileged endpoint is not a customer-facing substitute and must not be called by Flutter customers. |
| Settings and Web Admin | Existing managed settings infrastructure and settings screens can be extended. | No enable/count/time-window settings for Recently Added were found. Backend accepts only managed keys and publishes a defined subset; adding Admin controls alone cannot enable the feature. |
| Flutter | Existing remote product reads, newest sorting, pagination, product cards, prices, and stock presentation are reusable. Home currently has banners, category shortcuts, offers, and shopping information. | There is no dedicated Recently Added section or remotely managed configuration. The product model does not currently retain `created_at`. |

**Local read verification:** `GET /products?sort=newest&per_page=8` returned eight products in descending creation-date order, of which seven were in stock. `GET /settings` contained no Recently Added configuration. GET probes using the unsupported `in_stock` or `created_from` query parameters returned HTTP 422; these names are observations of rejected queries, not proposed or approved contract additions.

### 2. Requested behavior

- Provide an administrator-controlled enable switch, maximum displayed product count, and recency window. Validate all values and show concise help text explaining the selection rules.
- Select products using their stored creation timestamp, newest first. Include only active, published products whose category hierarchy is visible and whose server-calculated sellable availability qualifies them for purchase. Low stock with a positive sellable quantity should remain eligible; do not confuse the `low_stock` label with unavailability.
- Apply the eligibility filters before counting, limiting, and paginating results. Display up to the configured count; never fill a short list with older, unpublished, or unavailable products.
- Hide the entire section, including its heading and spacing, when disabled or when no eligible products exist. An optional section failure must not block the rest of Home or trigger mock content.
- Reuse product cards and authoritative server prices, discounts, currency, and availability. Opening a product uses the existing detail route. Normal Home refresh should refresh the section without per-card detail or availability requests merely to assemble the feed.
- Changes saved in Admin must reach clients through normal settings/feed refresh without a new app release. The display count and time window must not be hardcoded as a substitute for management support.

### 3. Work required by team

**Flutter with current API:** a basic newest-products list can use the existing repository and card components. However, that alone does not meet the requested administrator-controlled window and availability rules. Filtering only a loaded page can underfill the section or hide it incorrectly; scanning the entire catalog adds unnecessary requests. Do not ship either as a temporary substitute. After the Backend contract is available, add the configured Home section and its loading, empty, refresh, and failure behavior. Retain `created_at` in Flutter only if the agreed client behavior actually requires it; server filtering should not depend on the device clock.

**Backend/API:** extend the existing managed/public settings to expose the agreed configuration and provide an efficient public selection mechanism that applies the time and sellable-stock rules before the limit. Reusing the catalog route is preferred if it remains simple; a dedicated Home feed is an alternative to evaluate, not a decided endpoint. Define stable ordering for identical creation timestamps, configuration defaults/bounds, validation errors, and freshness behavior. Do not treat administrative stock filters as already available in the public contract.

**Web Admin:** add a small Recently Added settings group, preferably within existing store/Home settings. Reuse existing authorization and save feedback. Avoid a manual product-selection workflow because this section is defined by creation date, not curated membership. A lightweight preview/count is optional and should use the same eligibility rules as the public feed.

**Decisions pending:** rolling last-N-days versus a fixed date range; default count/window and safe limits; precise window boundaries and refresh/cache policy; and section placement on Home. A rolling last-N-days control is the simpler recommendation. Backend should define the authoritative time calculation; calendar-date boundaries, if selected, must use Asia/Baghdad. Imported/backfilled products follow their stored creation date unless a separate policy is explicitly agreed.

**Acceptance:** disabled/empty states leave no section; out-of-stock, hidden, unpublished, and out-of-window products never enter the feed; low-stock sellable products remain eligible; counts are correct across pagination; editing/re-publishing an old product does not renew its recency; Admin changes propagate through the agreed refresh behavior.

### 4. Review references

- API: `/products`, `/admin/products`, `/settings`, `/admin/settings`, and the product/settings schemas.
- Backend: `backend/src/modules/catalog/products.service.ts`, `dto/catalog-query.dto.ts` in the same module, and `backend/src/modules/settings/settings.service.ts`.
- Web Admin: `admin/src/app/(admin)/settings/settings-form.tsx` and the catalog product management screens.
- Flutter: `mobile/lib/features/catalog/data/catalog_repository_remote.dart`, `product.dart`, `presentation/providers/catalog_providers.dart`, and `presentation/screens/home_screen.dart` under the catalog feature.

## NOTE-005 — Customer Order History and Notifications – Hide Functionality

### 1. Objective and verified baseline

Let a customer hide eligible past orders and inbox notifications from their account without deleting the original records or changing any business state. Hidden state must survive logout, app reinstall, and switching devices.

| Area | Verified existing capability | Missing functionality |
|---|---|---|
| Customer orders | `GET /orders` scopes reads to the authenticated customer and supports status/pagination. Owned detail access is checked separately. | No account-level hide operation, visibility state, or hidden-history filter exists in the reviewed contract, Backend order model/service, or Flutter repository/UI. |
| Notifications | A durable, recipient-scoped inbox is already shared across devices. API supports pagination, unread/type filters, unread counts, marking one notification read, and marking all unread notifications read. | Read state does not hide an item. No single, selected-bulk, or filtered hide-all operation or persisted hidden state exists. |
| Flutter inbox | Displays paginated notifications, marks opened items read, supports the account-wide bulk-read action implemented in NOTE-010, and navigates to permitted destinations. | There is no unread/type filter UI or selection/hide workflow. Existing API filter support can be reused later. Bulk read does not provide hiding. |
| Web Admin | Administrative order lists/details and operational workflows are separate from the customer's history. | Customer hiding should not remove records from these screens. No new Admin hide control is required for this customer feature. |

These findings come from contract, source, and schema review. No order or notification was hidden, marked read, deleted, or otherwise changed during this review. Account-persistence and new mutation behavior cannot be verified before the missing Backend functionality exists.

### 2. Order eligibility and customer behavior

- Provide **Hide order** for one eligible order at a time, with wording that it leaves administrative/accounting records intact. This is a visibility preference, not cancellation, deletion, payment settlement, or return completion.
- There is no `completed` value in the current order contract. Use the existing statuses and agree on eligibility with Backend; do not invent a new status for this feature.

| Existing order status | Proposed hide policy, pending agreement |
|---|---|
| `delivered` | Treat as the candidate for a completed customer order, while preserving return rights and checking open after-sales activity. Delivery alone does not prove all refunds or accounting work is finished. |
| `cancelled` | Eligible as requested, subject to the agreed policy for unresolved customer-facing follow-up. |
| `rejected` | Terminal in the current order state machine; recommend including it after explicit confirmation. |
| `returned` | Terminal in the order state machine; consider eligible only after checking associated returns/refunds rather than assuming the status proves financial completion. |
| `failed` | Not terminal: Backend permits redispatch or return to preparation for dispatch. Do not make it eligible merely because a delivery attempt failed. |
| `return_requested` and fulfillment-in-progress states | Keep visible; these represent ongoing customer or operational work. |

- **Recommended safeguard:** prevent hiding while an active customer-facing return/refund or cancellation process would become difficult to follow. Backend must evaluate related records, not only the displayed order label. The final after-sales eligibility policy remains a decision for the team/owner.
- Hide from the default customer order history and its filtered totals. Preserve access needed for invoices, support, returns, and refunds through an agreed hidden-history/detail policy; hiding must never waive an entitlement or alter a server eligibility calculation.
- Hiding an order must not automatically hide its notifications. New legitimate status/return notifications must continue to follow existing preferences. Define what happens if an order becomes active again after hiding; recommended behavior is to make ongoing work discoverable again and explain the change.

### 3. Notification behavior

- Support hiding one notification, multiple selected notifications, and **Hide all** in the current list or server-supported filter.
- Clearly identify the scope of Hide all. It must cover all matching records across server pages, not just the loaded page, and must not affect other filters or accounts. Use a defined operation boundary so notifications arriving after the action begins are not silently hidden with the earlier batch.
- Keep hiding distinct from marking read and from disabling future notifications. Existing `read-all` marks every unread notification for the caller, without a current-filter scope; it cannot implement filtered Hide all.
- **Recommendation:** exclude hidden notifications from the visible unread count/badge while preserving their original read/unread history. Agree and document this behavior before implementation, including badge/live-update consistency on other signed-in devices.
- A hidden notification must stay hidden after pagination, reload, sign-in, or inbox synchronization. Hiding an existing notification must not mute later notifications about the same order.
- Define behavior for old push/deep links. Customer ownership and role checks must still apply; hiding should not grant or remove authorization to the underlying order. Clearing already delivered operating-system notifications on other devices is a separate capability and is not implied by hiding the in-app inbox record.

### 4. Backend, privacy, and administrative requirements

- **Backend/API required first:** persist account-specific visibility for orders and notifications; expose owned single-item operations, selected notification bulk actions, and filtered notification hide-all. Exact routes, field names, and storage structure are deliberately left to contract design.
- Derive the account from authentication. Validate ownership for every item, including bulk requests; never accept another customer's identifiers as authority. Define atomic rejection or explicit partial-result semantics for invalid selections without leaking other customers' record details.
- Validate current order eligibility when applying the request and return a clear declared refusal when the state changed. Repeating an already successful hide should have a safe, documented result.
- Apply visibility consistently to customer lists, pagination totals, unread counts, and inbox synchronization. Account changes must clear private client state and discard late responses from an older session.
- Retain original orders, lines, payments, returns, status events, notifications, and operational/audit records. Do not delete records, cascade changes, rewrite order statuses, or change accounting balances to hide history.
- Keep Admin, accounting, monitoring, and delivery workflows governed by existing permissions and operational visibility. Customer history preferences must not suppress an order from staff processing or alter reporting totals. Any future staff visibility into the customer's hiding preference should be limited to a justified permission; no customer-hidden list should become public.
- **Recommendation:** use a simple per-account hidden state, independent of business lifecycle fields, rather than a general archival system. Reuse the existing durable inbox and owner-scoped order infrastructure. The exact storage design remains a Backend decision.

### 5. Flutter and Web Admin work split

**Flutter:** genuine account-persistent hiding cannot be implemented with the current contract. Once Backend support is agreed, add single-order actions, notification selection and bulk actions, clear scope/confirmation, request progress, and accurate error/refusal feedback. Update lists and badges only in line with confirmed server results, with refresh/recovery for uncertain outcomes. Do not use local hidden-ID lists, device preferences, `read_at`, or optimistic disappearance without persistence as a substitute.

**Reusable Flutter-only capabilities:** existing order status labels, pagination, session ownership, and notification navigation can remain. Exposing the already-supported notification filters is possible independently, but would not provide hiding. No such UI change is authorized by this documentation task.

**Web Admin:** no customer-hide management page is needed initially. Validate that hidden customer records remain available to authorized staff, reports, and normal order/return operations. No deletion or business-status controls should be repurposed for this feature. Any later Web Store customer hiding UI must use the same account-level contract.

**Decisions pending:** inclusion of `rejected`/`returned`; open-after-sales eligibility; restoring or viewing hidden items; old deep-link behavior; unread-count semantics; the bulk-operation boundary and partial failures; and reappearance when hidden orders become active. A simple restore path is recommended to prevent accidental permanent loss of customer access, but is not an approved additional feature.

**Acceptance for later implementation:** verify persistence with the same account on two devices and after logout/login; cross-account and mixed-owner bulk rejection; eligible/ineligible and concurrently changed order states; unchanged financial/admin records; filtered Hide all across multiple pages with concurrent new arrivals; consistent unread counts; repeated requests; and session changes during pending operations. Use disposable test data for these mutations, not existing business records.

### 6. Review references

- API: `/orders`, owned order detail, `OrderStatus`, `/me/notifications`, unread-count/read/read-all operations, and notification schemas.
- Backend: `backend/src/modules/orders/orders.service.ts`, `order-transition.ts` in the same module, `backend/src/modules/notifications/notifications.service.ts`, and the `Order` / `NotificationEvent` models in `backend/prisma/schema.prisma`. Returns v2 behavior is also relevant to eligibility.
- Web Admin: `admin/src/app/(admin)/orders/orders-table.tsx` and `orders/[id]/order-detail.tsx` under the same admin application.
- Flutter: `mobile/lib/features/orders/data/order_repository_remote.dart`, order history screens, and `mobile/lib/features/notifications/data/notification_repository.dart` / `presentation/notifications_screen.dart`.

**Historical initial-review boundary for NOTE-003/004/005:** only this document was changed at that stage; NOTE-003 Flutter display was subsequently implemented as recorded above. Verification comprised source/contract review and the public local API GET checks described above. No application code, configuration, business data, commit, or push was changed or performed for these notes. New feature acceptance tests and UI/device verification remain for an explicitly authorized implementation task.

## NOTE-006 — Category Images and Icon System Migration

### 1. Objective and verified baseline

Replace category-specific icons with store-managed images for main categories and subcategories, while preserving navigation and readable names when artwork is unavailable. Review date: 2026-10-18; authoritative API **17.4.0**, freshly fetched `origin/main` at `17161ea`, and the existing `mobile` working copy. The owner authorized Flutter implementation and documentation; Backend and Web Admin changes remain for their teams.

| Area | Existing capability | Remaining gap |
|---|---|---|
| Category storage/API | Main categories and subcategories already expose nullable `image_url`. Existing admin category create/patch operations accept a managed media URL; patching it to `null` removes the association. | One image per category; no separate square/card image, crop position, or saved source-image/crop metadata. These are not needed for a basic single-image workflow. |
| Upload and delivery | `POST /media/images` accepts PNG, JPEG, WebP, and AVIF up to 8 MiB, subject to configured limits, and returns a durable URL backed by object storage. Media reads supply an ETag and immutable one-year cache headers. | The general upload endpoint does not enforce category dimensions or produce category-specific crops. Do not assume the separate catalog-import optimization path runs for every ordinary upload. |
| Replacement/removal | Uploading creates a new media URL. Category PATCH can replace or clear its association. Media deletion refuses objects still referenced by a category, product, or banner. | Admin needs a clear workflow and safe handling of abandoned uploads; removing a category image must not delete the category or immediately destroy shared media. |
| Web Admin | Catalog > Categories already manages both levels. Product screens have reusable upload, image preparation, and preview infrastructure. | The category form currently has no image upload, preview, crop, replace, or remove controls. No category icon-picker UI was found in the current Web Admin source, so removing such a picker there is not presently required. |
| Flutter before this migration | Main category cards and subcategory tiles could read `image_url`; Home shortcuts used category-specific icons. Main cards also contained a legacy test-mode random-image fallback. | Icon registries, category-ID mappings, and unused icon-picker labels remained in Flutter. |

**Local read-only verification:** the actual Docker API returned eight main categories with images and 18 subcategories, 16 with images. The nine distinct local image URLs all returned HTTP 200 with PNG content. Eight main categories and 17 subcategories also retained `icon_key` values. No uploads, category changes, media deletion, or database migration were performed. Existing development images were not replaced with invented artwork.

The checked local media URLs use `localhost:8000`; successful desktop GETs do not establish reachability from a physical phone. Backend media URL configuration must supply an address reachable by the intended client environment. Do not compensate with hardcoded URL rewriting in Flutter. Device/production URL verification remains separate from these local checks; launch and Backend configuration were preserved.

### 2. Implemented Flutter behavior

- **Home:** each category now uses its API image as a centered square inside the existing circular background. The square fits completely within the circle; its corners are not cut off by an oval mask. The existing circle size, labels, tap targets, RTL order, and carousel interaction/lifecycle behavior remain intact.
- **Main Categories:** use the same API image in the existing rectangular artwork area beside the category name/description. Preserve the existing responsive card geometry and directional artwork placement.
- **Subcategories:** use the image in the existing rounded square tile, with the category name below it and the existing navigation behavior.
- All three surfaces use the shared category-image presentation and the existing `CatalogImageView` / `CachedNetworkImage` path with `BoxFit.cover`. Images preserve their proportions; excess edges may be cropped to fit the available area.
- Missing, empty, loading, and failed images use a neutral image placeholder while the name and navigation remain available. No category-specific glyph or random image is substituted. This is a deliberate empty/error state, not replacement catalog content.
- Changing the supplied image URL selects the new cached image; clearing it removes the previous artwork. Existing category metadata refresh remains responsible for receiving Admin changes. No per-category detail fetch, upload service, polling, or device-local artwork override was added.
- Category images are decorative for accessibility; the adjacent category name continues to label the action. Existing description behavior is preserved.

### 3. Image preparation and aspect-ratio guidance

These are recommendations for Admin implementation and content preparation, not new enforced API limits:

| Surface | Display geometry | Recommended preparation |
|---|---|---|
| Home shortcut | 1:1 image, inscribed within the existing 67.2 logical-pixel circular background; square side approximately 47.5 logical pixels. | Clear central subject, no essential small text, and transparent PNG where helpful. |
| Subcategory tile | 1:1, responsive, with rounded corners. | Reuse the square image and preview the corner clipping. |
| Main category card | Artwork occupies 42% of card width; card height adapts to text and accessibility settings. It is a rectangle, not a fixed aspect ratio. | Preview the actual rectangular cover crop. At ordinary phone sizes it is approximately 1.2:1–1.5:1; enlarged text can make it taller. Do not promise that one fixed rectangle matches every viewport. |

- Start with a **1:1 master image around 1024 × 1024 pixels** for the current single-image contract. Keep the important subject centrally positioned with generous edge space. Provide both square and main-card previews, including a narrow screen and enlarged text, before saving.
- Prefer PNG for transparency or sharp graphic artwork; accept WebP and JPEG for appropriate photographic content. Preserve transparency when processing PNG/WebP. The existing Admin compression utility can fall back to JPEG on white, so it must not silently flatten artwork that relies on transparency.
- Aim for an optimized file of roughly **300–500 KiB or less** where quality permits; this is a content target, not an approved rejection threshold. The API's 8 MiB ceiling is not a recommended delivery size. Existing Admin preparation can limit the longest edge to 1600 pixels and compress large images; reuse it with category-specific preview and transparency handling.
- Use cover cropping, never stretching. A single image cannot guarantee identical framing in square and variable rectangular slots. Prefer a simple square crop plus composition guidance initially. If real content cannot work across both, evaluate separate square/card variants or focal-point metadata as a coordinated API/Flutter/Admin enhancement; do not send undocumented fields now.
- Keep URLs immutable on replacement so clients can use the existing cache reliably. Do not overwrite bytes behind an unchanged one-year-cached URL. No new image-cache framework is required for this migration.

### 4. Web Admin requirements using current Backend capabilities

1. Add an image field to the existing main-category/subcategory create and edit forms; show the saved image and its empty state.
2. Allow file selection, immediate local preview, and a simple crop/reposition tool before uploading. Display the recommended square dimensions, the multiple target previews, accepted formats, and the upload-size limit.
3. Reuse managed media upload and existing permissions. Save only the returned managed URL with the category. Preserve name, descriptions, parent, visibility, order, and legacy fields during unrelated edits.
4. Provide **Replace image** and **Remove image**. Removal clears `image_url` and previews the neutral Flutter placeholder; it does not delete the category. Keep the current saved image if a replacement upload or category save fails, and show a retryable error.
5. Treat cancelling the form separately from saving. Track an uploaded-but-unsaved image for safe cleanup if appropriate; never delete media still used elsewhere. Reuse the existing media-reference protection rather than bypassing it.
6. Do not introduce a new category icon picker. If an older separately deployed Admin build still has one, retire that UI as part of its image migration after confirming the deployed version. No such UI was found in the reviewed source.

**Backend/API work:** no new field or endpoint is required to upload, associate, replace, clear, and display one image per category. Crop can produce the upload file in Admin. Additional Backend work is conditional on later agreement about persisted original artwork, re-editable crops, per-surface variants/focal points, or server-side category-specific optimization. Record any agreed expansion in the authoritative contract before client implementation.

### 5. Icon cleanup and transition boundaries

- Removed Flutter's `category_icon.dart` and `category_icon_catalog.dart`, including category-key/ID-to-Material-icon maps. Removed the legacy random category-image URL helper and test-mode artwork switch.
- Removed the 140 unused category icon/group/picker localization entries from each language source and regenerated localization output. Unrelated localization content and general Material Icons remain available.
- Retained `Category.iconKey` as passive contract metadata, including serialization/copy behavior. It no longer affects category presentation. Backend fields, stored values, generated Admin API types, and database contents remain unchanged; this task does not authorize dropping them.
- The small generic image-placeholder icon remains intentionally. It is a standard empty/error indicator, not a category icon selection system. Layout dimensions still used by the circular background and placeholder are retained.
- The manager still needs to supply missing or better artwork through the forthcoming Admin workflow. Flutter cannot create real category photographs or provide Admin upload controls by itself.

### 6. Verification and pending decisions

Focused tests cover the Home square-within-circle geometry at narrow/wide breakpoints, Arabic/English and enlarged text; bounded lazy image creation for a large category list; URL replacement/removal; neutral fallback instead of legacy glyphs; main-card and subcategory image layout; navigation; descriptions; and loading/error states. The category/Home focused run passed 106 tests and the offers regression run passed 9 tests. After updating obsolete icon expectations, the final full Flutter suite passed **2,176 tests with 5 skipped**. `flutter analyze --no-pub` reported no issues and `git diff --check` passed. Local API checks were GET-only and did not alter business data. No manual simulator/physical-device interaction was performed.

**Pending decisions:** approved artwork and editorial size targets; whether a single square composition is sufficient after real content preview; and whether retaining originals for later re-cropping is necessary. Basic image management should not wait for optional multi-image or crop-metadata features. The overall document remains a working draft. Recently Added and account-history hiding requirements in NOTE-004/005 are unchanged and unimplemented.

**Review references:** `api/openapi.yaml` category/media operations; `backend/src/modules/catalog/categories.service.ts`; `backend/src/modules/media/media.service.ts` and `media.controller.ts`; `admin/src/app/(admin)/catalog/categories/categories-view.tsx`; `admin/src/lib/media-upload.ts` and `product-images.ts`; Flutter category data, `category_image.dart`, `category_card.dart`, `home_category_carousel.dart`, and category/subcategory screens.

## NOTE-007 — International Phone Input, OTP Display, and Delivery Contacts

### Verified baseline and scope

Reviewed on 2026-10-18 against freshly fetched `origin/main` at `17161ea` and API **17.4.0**, plus the current Flutter working copy. Findings describe source and contract behavior, not a production deployment. This update changes Flutter and this document only.

| Area | Existing capability / gap |
|---|---|
| Backend authentication | Request/verify OTP require an E.164-shaped string (`+`, non-zero country prefix, 8–15 digits). The DTO checks syntax; the service trims input. It does not perform country-aware numbering-plan validation or normalize national numbers. Phone is an authentication identity, so changing an existing stored value could break OTP lookup or create a duplicate account. |
| Delivery addresses | Create/patch already accept independent `contact_phone` in the same international shape. Recipient contact may equal the account phone or belong to another person. No new address endpoint or country field is necessary for the Flutter input improvement. |
| Web Store | Login currently validates Iraqi `07…` national numbers. Shared `toE164` uses simple prefix rules; checkout and saved-address forms reuse this helper. This is not an international country-aware parser. |
| Web Admin | Work-phone management already accepts international-shaped numbers and converts familiar Iraqi numbers using a local helper. It has no equivalent searchable international country selector. Existing number displays use LTR where inspected. |

### Implemented in Flutter with the existing API

- A shared `InternationalPhoneField` is used by sign-in and delivery-address create/edit. Its left-side integrated selector shows only a flag and dialing code inside the standard input border, separated from the national-number entry by a vertical divider. The number and integrated selector are LTR in both interface languages; the field label, outline gap, and validation retain the interface direction. The existing searchable country-picker sheet retains its flags, localized names, calling codes, search, and ordering.
- The initial selection uses an explicit supported device locale region; language alone does not imply a country. Iraq is the fallback. A stored or pasted international number selects its own country. The user can change the selection manually.
- National input may include its leading zero. `phone_numbers_parser` handles country-specific parsing, validation and E.164 output; significant zeros are not removed by a universal prefix rule. Arabic-Indic and Persian digits are folded through the existing input formatter.
- The existing packages are `phone_numbers_parser` 9.0.28 and `country_picker` 2.0.28; their local metadata does not require a country lookup API or native plugin configuration. Maintain metadata versions deliberately as numbering plans evolve. Package references: [phone_numbers_parser](https://pub.dev/packages/phone_numbers_parser), [country_picker](https://pub.dev/packages/country_picker).
- `InternationalPhone.display` and `PhoneNumberText` provide country-aware international spacing and LTR display across account/profile, address cards, OTP, monitoring order/contact details, delivery details, and store support contacts. Verification and resend continue using the exact canonical number used for the OTP request; display formatting is never sent to the API. Full-number copying from selectable phone text uses E.164, while partial selection retains normal copy behavior. Call actions use an explicit international identity; invalid or legacy display values remain unchanged without inventing a country. A delivery contact without a valid explicit international identity remains visible but has no automatic dial action; any legacy migration needs Backend review rather than a client-side country guess.
- Selecting the primary delivery contact hides the alternate input and displays the formatted account number as plain, non-editable LTR text below that choice, without a flag or selector. It does not edit or re-normalize the account identity. Selecting another contact enables country selection and national-number entry; saving sends canonical `contact_phone`. The alternate country and number draft survive switching to the primary contact and back. Existing E.164 account numbers are not rejected merely because client numbering metadata cannot validate them.
- Form controls retain `AppSpacing.formFieldGap = 12`. Ordinary external field explanations use `AppSpacing.fieldHelperGap = 8`; native InputDecoration helper/error spacing is not padded again, and section/action spacing is preserved.
- Radio title/supporting-text separation uses `AppSpacing.radioSubtitleGap = 4` where a subtitle exists (currently the address primary-contact option), without changing spacing between choices. The shared phone field keeps the ambient label/error direction and selects the physical-left decoration slot for the LTR country selector.
- The Arabic/English typography audit verified matching central Zain family, sizes, weights and line heights at identical widths/scales, including notifications. Bundled 400/700/800 faces cover Arabic, Latin and digits. No unintended locale-dependent size setting was found; natural glyph-design differences did not justify resizing English text.
- No authentication contract, stored account identity, device/backend configuration, or runtime data source was changed.

### Phone UX and local integration follow-up — 2026-10-18

The three Iraqi inputs `07811100070`, `7811100070`, and `+9647811100070` validate under the selected Iraq region and produce exactly `+9647811100070`. A national Iraqi number can reproduce the reported validation error when the device-selected region remains United States. This is a region/input mismatch, not evidence of a Backend rejection; the UI keeps the chosen country visible and never guesses a different region from national digits. Pasting a valid explicit international number selects its country and displays only the national portion beside the prefix, preventing duplicate calling codes.

A real local API test exercised each of the three inputs through the Flutter sign-in screen and observed navigation to the actual OTP screen. It then verified the development OTP through the remote repository, created a delivery address, updated its phone to a UK international number, and reread the persisted contact. Tests used API 17.4.0 and a unique throwaway `shubayr_*_verify` PostgreSQL database, with existing public geography/access reference tables, no copied customer records, no mocked API responses, and external SMS disabled. The temporary API container and database were removed afterward. This proves local API flow, not external SMS delivery.

Layout/behavior coverage includes Arabic and English, light/dark themes, widths from 280 to 1920 logical pixels, text scaling through 200%, focused/error/disabled input, primary/alternate contact retention, full and partial phone copying, and preserved standard field height. Existing legacy account identities are not migrated. No new Backend blocker was found for this Flutter work; the server-side validation requirement below remains open.

### Remaining requirements by team

**Backend/API:** add trusted country-aware validation of canonical international numbers at the existing phone-writing boundaries, with consistent documented validation errors. Continue accepting the current E.164 payload; accepting raw national numbers would require an explicit region and a separately agreed contract change. Assess existing account/work-phone data before tightening validation. Do not silently rewrite identities, merge accounts, or invalidate OTPs/sessions; any legacy normalization needs collision review and a verified migration plan. Apply consistent rules to independent delivery contacts as well. Client-side validation does not replace server validation.

**Web Store:** replace Iraqi-only login checks and prefix-only conversion with the same user-facing country selection and trusted parsing policy for sign-in, checkout and saved-address editing. Keep numeric runs LTR and preserve the exact OTP identity between request, verify and resend.

**Web Admin:** use country-aware entry/validation for editable work phones where appropriate, without silently changing registered identities. Existing canonical values remain usable and readable. Reuse the international input policy rather than creating a separate country-code convention.

**Acceptance:** cover Iraqi local numbers with a leading zero, another country with a removable trunk prefix, a country with a significant national zero, pasted international numbers, shared calling codes, invalid input, device-region fallback, RTL, accessibility text scaling, and account/alternate delivery contacts. Region selection must never depend on a guessed IP location or an extra network request.

## NOTE-008 — Category Name and Description Editorial Guidance

### Current implementation

The real-API description display requested in NOTE-003 is already implemented in Flutter. Localized category descriptions appear below names with secondary styling, at most two lines and visual ellipsis; blank descriptions add no description-specific space. Full strings remain in the model and database.

The current main-category card has a minimum design width of 280 logical pixels, 42% artwork, and 16-pixel padding on each side of the text. A minimum-width card therefore has about 130 logical pixels for text. Names use Zain 16/700; descriptions use a 12-pixel preview style. Names allow two lines at normal scale and wrap with a growing card at larger accessibility scales. Descriptions retain the two-line preview. These constraints, not a universal character count, determine visible text.

### Web Admin requirements — existing Backend fields can be reused

- Provide guidance beside both language-specific name inputs, and beside the description inputs requested in NOTE-003.
- **Proposed editorial starting points:** names around 2–4 words, preferably no more than **24 user-perceived characters**; descriptions around 6–10 words, preferably no more than **60 user-perceived characters**, including spaces. These are soft recommendations to validate with the editor, not API limits or a guarantee of fitting. Arabic and English have different widths; even shorter text may truncate on a narrow screen or at enlarged text sizes.
- Show a non-blocking warning above these recommendations: “This text may be shortened with … on smaller screens.” Continue allowing longer content and preserve the full supplied text on save. Do not add `maxLength` input enforcement or silently trim content to a preview length.
- Prefer a simple narrow-card preview with the actual font, artwork proportion and two-line description. Include RTL/LTR and enlarged-text preview when practical. Count user-perceived characters without splitting combining marks or grapheme clusters.
- Explain that an empty description creates no blank row and that the existing API language fallback may show the other translation.

**Backend/API:** category names/descriptions already have storage and write support; there is no current editorial maximum on these fields. No database or contract change is needed for soft guidance. The existing slug limit is unrelated and must not be repurposed as a display-text limit.

**Flutter:** no further text truncation or data manipulation was added in this update. Preserve the responsive behavior and full accessibility text. Guidance applies to the main-category layout; do not assume identical visible lengths in home circular tiles or subcategory cards.

## NOTE-009 — Zain Font for Web Store

### Verified assets and current web baseline

| Flutter asset | Configured weight | Approximate original size |
|---|---|---|
| `mobile/assets/fonts/Zain-Regular.ttf` | 400 | 175 KiB |
| `mobile/assets/fonts/Zain-Bold.ttf` | 700 | 176 KiB |
| `mobile/assets/fonts/Zain-ExtraBold.ttf` | 800 | 178 KiB |

The folder also includes the SIL Open Font License in `OFL.txt`. Flutter registers these three static faces in `pubspec.yaml`. No 500/600 or italic face is supplied there. The Web Store currently uses self-hosted Cairo WOFF2 subsets through `web/src/fonts/cairo/index.ts`, `next/font/local`, locale layout variables and typography tokens; it already avoids runtime Google Fonts downloads.

### Requirements for the Web Store team

- Adopt Zain for customer-facing Arabic and English text and numeric content through the central font setup and typography tokens, including forms, navigation, product cards, checkout and account screens. Keep Western numeric formatting and LTR phone runs independent of font choice.
- Host licensed assets locally with the attribution/license retained. Evaluate WOFF2 conversion/subsetting of the provided faces to reduce transfer size; do not ship all three original TTF files by default without evaluating cost.
- Register actual static weights correctly. Map existing 500/600 usages deliberately to supplied weights or obtain appropriate licensed faces; do not declare a static font as a variable range or rely on accidental synthetic weight rendering.
- Verify glyph coverage and shaping for Arabic letters/diacritics, English, Western digits, Arabic-Indic digits, punctuation and mixed strings. Preserve a suitable fallback for unsupported characters; subsetting must retain shaping features and necessary symbols.
- Retain swap-style loading, browser caching and controlled preloading of only the faces needed above the fold. Check layout shifts and slower connections.
- Recheck line height, button/input heights, two-line product/category previews, prices, wrapping and RTL at narrow/wide widths and browser zoom. Matching the family does not require blindly copying mobile pixel sizes.

**Status:** documented only. No Web Store, Web Admin, Backend or font asset files were changed. Web Admin font replacement is outside this request.

## NOTE-010 — Mark All Notifications as Read

### Existing support and completed Flutter behavior

API 17.4.0 already exposes `PATCH /me/notifications/read-all` without a request body, returning `updated` and `read_at`. Backend applies it to the authenticated user's unread, non-test notification records across pages and persists read state. It also emits the existing notification read/unread-count stream events. Web Store and Web Admin already expose bulk-read actions; they do not need a new endpoint for this feature.

Flutter now provides a localized **Mark all as read** button in the inbox:

- Sends one bulk PATCH for the account, not one request per loaded notification. Repeated taps are blocked and duplicate in-flight controller calls are coalesced.
- Uses server-refreshed inbox rows to switch unread icons to the existing read appearance, and invalidates the shared unread-count provider used by Home and Account badges.
- Refetches the authoritative count rather than assuming zero, because a new notification can arrive during the operation. Existing polling/foreground synchronization remains intact.
- Keeps an in-flight mutation alive when leaving the inbox so an owned successful response can refresh the shared badge. Late responses from a different authenticated session must not modify the new session.
- On failure, retains the current read state, displays localized feedback and allows retry. Reopening the app or signing in again obtains persisted state from Backend.

**No new Backend/API requirement for this action.** It marks notifications read; it does not hide or delete them. Account-persistent hiding in NOTE-005 remains a separate unimplemented Backend/API requirement. There is no inbox filter in the current Flutter implementation; this action explicitly covers the entire account, not only the visible page.

### Verification scope

Automated coverage checks the request method/path/body, coalescing, failure recovery, ownership changes, authoritative badge refresh including a new-arrival race, Arabic/English inbox icon changes, and reopening reads. This review did not mark real customers' local Docker notifications as read or send real OTP messages.

## NOTE-011 — Product Purchase Quantity Limits

**Implementation update (2026-10-19):** contract 17.7.0 delivers the agreed
per-order-only policy. It sums every variant/line for the product, enforces the
maximum under cart and checkout locks, preserves idempotent replays, exposes the
policy on product reads and returns `PRODUCT_ORDER_LIMIT_EXCEEDED` with product,
allowed and requested quantities. The suggested 10 is editor-only. Rolling
quotas and their cancellation/return policy remain deferred after launch.

### Verified current behavior

The current API, product schemas, Backend and Web Admin product editor do not expose per-product purchase-limit settings or per-customer rolling-window usage. The existing cart rules enforce quantity precision up to 0.001, `whole_units_only`, sellable stock and a general maximum of **99 per cart line**. Coupon usage restrictions and stock reservations have different purposes; they are not customer purchase quotas. Flutter already respects these supported quantity/stock rules. No arbitrary limit of 10 was introduced.

### Backend/API requirements

- Add an optional per-product policy with an explicit enabled flag and a maximum quantity per order. Offer an additional cumulative quantity over a configurable period, such as a rolling 24 hours, when enabled.
- A suggested value of **10** should prefill the editor only when an administrator enables the policy. Existing and disabled products remain unrestricted by the new policy; normal stock/quantity constraints still apply.
- Enforce policy server-side across cart/checkout paths and authenticated account sessions, including multiple devices and simultaneous checkout requests. Availability shown in a client is advisory; final enforcement must be atomic with order acceptance/reservation. Replays of the same checkout must not consume quota twice.
- Define the aggregation unit explicitly: recommended default is the sum of all variants and order lines of the same product for the customer. Confirm whether some catalog cases need a variant-level exception before designing it.
- Preserve fractional-quantity products and existing precision rules. Decide whether thresholds follow product selling units; do not silently round fractional quantities or label every product as “pieces.”
- Publish policy/effective allowance data where clients need it and declare stable, localized-error-mappable rejection codes with useful allowed/requested quantities and next-available time where meaningful. Do not require a separate per-item polling API to render every product card.
- Specify which order states consume quota and how cancellations, partial cancellations, payment failures, returns and partial returns affect it. Recommendation for evaluation: accepted open and completed orders consume quota; confirmed cancellations release the canceled quantity; the team must decide whether accepted returns release usage and how to prevent repeated purchase/return circumvention.
- Decide rolling versus fixed windows, the server timestamp used, policy changes affecting open orders, and whether only orders accepted after enabling a policy count. Rolling periods should use elapsed server time; any fixed business-day reset must use the shared Asia/Baghdad business-date rules.
- Test concurrent orders, idempotent retries, mixed variants/lines, edits/cancellations/returns, disabled limits and changed policies. Database enforcement must preserve existing immutable accounting/order history.

### Web Admin, Flutter and Web Store responsibilities

**Web Admin:** add a simple enable toggle, per-order maximum, optional cumulative maximum and duration, suggested initial value 10, and explanatory unit/status rules. Validate positive values and meaningful combinations, retain disabled settings for reuse if agreed, and show a clear summary of the active policy. Avoid unrelated campaign-management complexity.

**Flutter and Web Store, after the contract is available:** display the applicable limit/remaining allowance and clear rejection messages, refresh authoritative cart/allowance after a rejection, and allow the user to correct quantity. Do not treat cached client values as enforcement or silently change the requested quantity. Keep current valid stock/precision feedback in the meantime.

**Guest behavior:** the current mobile guest can browse/use a local guest cart, while server checkout requires authentication. A guest cart cannot establish a reliable account quota. Validate after sign-in/merge and again at checkout; do not use a device-only counter or invent persistent guest identities. If anonymous checkout is added later, the Backend team must define a separate abuse-resistant identity policy.

**Status:** Backend/API and Web Admin design required before meaningful client implementation. The policy decisions above are recommendations/open decisions, not an approved contract. No temporary local counter, new API field, fabricated rejection code or purchase cap was implemented in Flutter.

## Historical verification for the initial NOTE-007–011 implementation

- `flutter analyze --no-pub`: passed with no issues.
- `flutter test --no-pub --reporter expanded`: **2,202 passed, 5 skipped** at that stage, before the later phone/direction follow-ups. The executive summary records the superseding 2,227-test regression result. The five opt-in local API integration tests remained disabled; no real OTP or notification-read mutation was performed on existing Docker data.
- Coverage includes international/national phone normalization, significant zeros, Arabic/Persian digits, searchable country changes, OTP wire-identity preservation, delivery-contact toggles, RTL/text scaling, bulk-read errors/session ownership/late arrivals, shared notification state, and existing cross-screen regressions.
- `git diff --check`: passed. Backend, Web Admin, Web Store, API and device/Docker configuration were not changed by this task. Earlier requirements remain preserved. No commit or push was performed.

## NOTE-012 — Web Applications – Branding and Localization Improvements

### 1. Scope and review basis

**Status:** Draft requirements; documentation only. **Owners:** Web Admin and Web Store teams, with narrowly scoped Backend/API follow-up where error semantics are insufficient. Flutter is outside this note's implementation scope.

Reviewed on 2026-10-18 against the current local Web Admin and Web Store source and API **17.4.0**. This was a source/asset audit, including translation-key comparison; it does not certify deployed browser behavior or claim an exhaustive manual review of every screen. Existing authentication, authorization, and business rules must remain unchanged.

### 2. Verified existing capabilities and gaps

| Area | Web Admin | Web Store |
|---|---|---|
| Login branding | The shared `AuthFrame` shows a styled Arabic letter mark and translated Shubayr/admin names. It does not use the requested official image. | `LoginView` has a translated heading and the phone/OTP form, but no dedicated official logo above the form. Shell branding uses the shared `Logo`, which can load `settings.logo_url`; its default is a generic leaf beside the store name. Existing configurable branding is reusable. |
| Browser icon | No application-owned favicon/icon asset or metadata icon declaration was found in the inspected source. | `src/app/icon.svg` and `public/logo.svg` contain the same generic leaf artwork, not the official Shubayr symbol. |
| Browser titles | Root metadata already provides translated admin branding and a title template; login supplies its translated page title. | Root metadata already uses the configured store name with a translated fallback and a page-title template; login supplies its translated title. Audit and refine these mechanisms rather than rebuilding them. |
| Localization infrastructure | `next-intl`, Arabic/English JSON catalogs, Arabic default, a locale cookie, and root `lang`/`dir` are implemented. The locale switch stores the preference and refreshes the route without calling logout. | `next-intl`, Arabic/English JSON catalogs, locale-aware routing, and root `lang`/`dir` are implemented. The switch changes the current path's locale without calling logout. |
| Login feedback | Credentials, lockout, session-expired and generic error messages have translations. However, `fieldErrorMap` returns server field messages verbatim, and `FormError` can append raw conflict/validation details. The shared path explains how English field errors can appear in an Arabic form. | Phone/OTP validation, rate-limit, send/verify failures and success messages already use translations. Do not describe all login feedback as untranslated. Some errors are stored as already translated strings, which requires testing during an in-place language change. |
| Other feedback gaps | Raw server messages also reach confirmation/posting feedback and examples in catalog imports/images, product operations, supplier toasts and warehouse failures. Some business-error classifiers depend on matching English message text. | Return-request failures and the existing work delivery screen can display raw server messages. The Arabic footer's `brand.strapline` remains English, and product breadcrumbs have a fixed English accessibility label. Native confirmation dialogs can use browser-language button labels. |
| Global failure fallback | The root error boundary is fixed Arabic-first with an English sentence and Arabic retry button, rather than following the selected locale. | The root error boundary has the same Arabic-first limitation. Normal localized error boundaries already exist. |

The Arabic/English catalog keys match: **3,301 keys per language in Web Admin** and **975 per language in Web Store**, with no missing counterparts in this check. Key parity does not establish translation completeness, correct wording, or coverage of raw API messages. Brand names, SKU labels, numeric placeholders and email examples must not be incorrectly treated as untranslated prose.

The inspected styling uses shared light-oriented color tokens; no runtime light/dark mode selector was found in the inspected shells. Names such as `primary-dark` denote color shades, not proof of a dark theme. This note does not request a new theme system.

### 3. Official branding and browser identity

**Responsible: each web team for its application; coordinate visual approval across both.**

- Use `mobile/assets/images/branding/shubayr-logo.png` as the official source. Asset inspection confirms a **613 × 613 transparent PNG containing the symbol only**, so no wordmark removal is needed. Keep the original unchanged.
- Place the official symbol consistently above the login heading/form, with suitable Shubayr identification and a clear distinction between staff administration and customer sign-in. Reuse the existing shared authentication frame/logo components; account for Web Store's regular and restricted/info shells without unnecessary duplicate branding.
- **Sizing recommendation for visual review:** start with a 64–96 CSS-pixel square symbol, constrained by the available width. Confirm the final size and spacing on the real layouts. Preserve its 1:1 ratio, use contain-style sizing, reserve its dimensions to avoid layout shifts, and provide appropriate accessible naming without repeated announcements.
- Keep one maintained source and only the assets required for each independently deployed web application. A copy in each application's asset directory is acceptable; do not create separate copies per page or require the browser to load from the Flutter source tree. Preserve existing store-name/logo configuration; agree its precedence with the official Shubayr default so login, header and browser identity remain consistent.
- Replace the generic/missing browser icon with a small-size rendition derived from the official symbol. Recommended deliverables are a multi-size ICO containing 16/32/48-pixel variants, a 32-pixel PNG, and a 180-pixel Apple touch icon. Use SVG only if a genuine approved vector source exists; do not treat wrapping the PNG as a vector upgrade. Add 192/512-pixel manifest icons only if an existing installable-web requirement calls for them; a new PWA is outside scope.
- Verify favicon readability and transparent-edge quality at actual tab sizes, browser metadata references, caching after replacement, and light/dark browser chrome. Check any supported page themes without inventing a dark-mode requirement.
- Retain the existing localized title templates. Ensure representative pages clearly identify both their purpose and application, such as a translated sign-in title followed by Shubayr Admin versus Shubayr. Check Arabic/English titles after switching language, reload and direct navigation.

No images were copied, resized, generated, or installed as part of this documentation task.

### 4. Localization and error handling requirements

**Web Admin priority:** fix the shared field-error mapping and form-error detail presentation first. Reuse `next-intl`, `useApiForm`, `Field`, `FormError`, existing dialogs/toasts and the current message catalogs. Review callers that bypass these shared paths, including nested product fields and bulk/import operations. Preserve useful field association and actionable business explanations instead of replacing every failure with the same generic sentence.

**Web Store priority:** retain the translated OTP flow; remove raw-message presentation in the identified return/work paths, translate the Arabic footer tagline and accessibility labels, and audit the remaining customer and existing work surfaces. This is a localization audit of existing screens, not authorization to develop new work-role features. Reuse the current catalog, error components, toast provider and locale-aware navigation.

**Both teams must:**

1. Cover field validation; server failures; success/failure notifications; alerts, snackbars and toasts; confirmation/deletion dialogs; helper text and placeholders; loading/empty states; expired sessions; permission failures; and accessibility labels/tooltips. Include client validation, BFF errors, and server-rendered failures.
2. Map documented error codes and field-level codes to localized messages, using safe structured values where available. Unknown codes, transport failures and malformed responses receive a localized fallback. Never display raw technical messages, stack traces, database details, tokens, or internal exception text. Do not build new logic around translating or parsing English server prose.
3. Preserve Arabic RTL and English LTR around messages and controls, while isolating phone numbers, email addresses, codes and other directional values appropriately. User-entered content and legitimate product/brand names are not automatically translated.
4. Make a language change update the full interface without signing out. Include open dialogs, visible validation errors, toast feedback, loading states and tab titles. Already translated strings held in state must be re-resolved or safely cleared when appropriate; they must not remain in the previous language. Preserve the current route, relevant query parameters (including login return destinations), filters, session and unsaved form/OTP progress where applicable. Current switches exist, but these retention cases need verification; the Web Store switch currently passes the pathname without explicitly preserving query parameters.
5. Replace browser-native confirmation UI where its button language cannot follow the application locale, using the existing localized dialog approach rather than a second translation system. Provide a minimal locale-aware root-error fallback that still works when normal providers fail; it must not depend on the provider that crashed.
6. Audit catalogs and fixed strings together. Continue key-parity checks, review placeholder/interpolation/plural consistency and translation quality, and distinguish customer/admin production screens from internal style-guide examples.

**Backend/API responsibility, only for genuine gaps:** the current contract already supplies top-level `code` and field-level `field`, `code`, and `message`. The validation pipeline already emits validator codes, so ordinary login validation localization does **not** need a new localization API or translated server messages. Where generic codes or English-message classifiers cannot distinguish meaningful business refusals, inventory the affected routes and provide stable documented codes and any necessary safe structured parameters through the normal contract process. Do not add undeclared response fields or change shipped codes ad hoc. Web teams can implement localized fallbacks while those specific gaps are resolved.

### 5. Acceptance and handoff

- [ ] Both login pages use the official undistorted artwork and remain clear at narrow/mobile and wide/desktop sizes, zoomed text, and any supported themes.
- [ ] Official browser icons load at small sizes; page titles distinguish Admin from Store and follow the selected language.
- [ ] Arabic and English login validation, invalid credentials/OTP, lockout/rate limiting, session expiry and permission failures show localized, safe feedback.
- [ ] Representative catalog, inventory, finance, import, checkout, address, return and notification flows cover successful, failed, loading, empty and confirmation states; no raw server message reaches visible feedback.
- [ ] Switching language while signed in, while a form has errors, and during the OTP flow updates direction/copy without logout or loss of required navigation/form context. Unknown error codes also have translated fallbacks.
- [ ] Root-error fallback, dialogs, toast accessibility, favicon caching and metadata are checked in browsers; matching translation keys alone is not considered acceptance.

**Evidence locations:** `admin/src/components/shell/auth-frame.tsx`; `admin/src/app/login/`; `admin/src/lib/api/errors.ts`; `admin/src/components/forms/`; `admin/src/app/global-error.tsx`; `web/src/components/auth/`; `web/src/components/layout/logo.tsx`, `locale-switcher.tsx`, `footer.tsx`; `web/src/components/account/return-request-form.tsx`; `web/src/components/work/delivery-detail.tsx`; `web/src/app/icon.svg`; both applications' layouts, locale configuration, message catalogs and toast providers; and the `Error`/`FieldError` schemas in `api/openapi.yaml`.

## NOTE-013 — OTPIQ SMS OTP Delivery

**Date / scope:** 2026-10-24. User-authorized local implementation only, on `codex/otpiq-sms-delivery`, based on `origin/main` at `af09cf2`. Contract **17.12.0** is unchanged. No migrations, commits, push, real SMS, production secret changes, deployment, or database operations were performed.

### Existing flow and preserved behavior

- `AuthService.requestOtp` generates six digits with `crypto.randomInt` outside development, stores an HMAC digest keyed by the existing JWT secret, and expires the code using `OTP_TTL_SECONDS` (default 300 seconds). For OTPIQ, its transaction consumes previous codes and creates the replacement after the provider accepts a funded submission with a valid `smsId`; final tracking is asynchronous. Development retains the existing fixed `DEV_OTP` and response behavior, with no outbound SMS.
- `verifyOtp` looks up an unconsumed, unexpired code, compares its digest with timing-safe equality, and atomically consumes it before customer lookup/creation and token issuance. Session versions, role checks, refresh rotation, and logout are unchanged.
- Flutter's international phone field converts Iraqi national input such as `07701234567` to `+9647701234567`; digit folding, RTL/LTR presentation, and country selection are unchanged. Request, verification, and resend keep that canonical identity. The adapter alone converts it to `9647701234567`. It rejects ambiguous/noncanonical input without guessing a country or changing account identities. OTPIQ requires 10–15 digits; shorter numbers allowed by the broader E.164 API syntax cannot be submitted through this provider and receive the existing delivery-unavailable error.
- Flutter's flow remains screen → session controller → remote repository → ApiClient. Duplicate in-flight operations, session ownership, secure credential storage, login navigation, and localized failure handling remain intact. No Flutter source changes were needed. The latest mobile migration note (17.9.0 → 17.10.0) adds optional-to-client language information; it does not alter OTP behavior.

### Implemented adapter and delivery semantics

`SmsGatewayService` selects OTPIQ only with `SMS_PROVIDER=otpiq`; the existing generic gateway remains the default. It uses the documented [send endpoint](https://docs.otpiq.com/api-reference/messaging/post), a backend-only bearer key, `smsType=verification`, `provider=sms`, and the existing backend-generated code. No OTPIQ secret, code or raw provider body enters Flutter, application logs, or public API responses. Logs contain only the validated `smsId`, safe status and masked phone suffix needed for support.

A successful funded POST with a valid `smsId` is sufficient for the existing
`otp_sent: true`: the code is persisted immediately and the customer request
does not wait for the documented
[tracking endpoint](https://docs.otpiq.com/api-reference/messaging/track).
This means provider acceptance, not handset delivery. HTTP failures (including
authentication, invalid input and 429), `canCover: false`, malformed responses,
transport errors and the submission deadline return the existing sanitized
`503 OTP_DELIVERY_UNAVAILABLE` and store no replacement code.

The POST has its own 1–15 second deadline (default 10 seconds), rejects
redirects and is never retried because a timeout can still represent a billable
submission. After acceptance, a BullMQ job on the existing worker polls tracking
best-effort for up to `OTPIQ_TRACKING_TIMEOUT_MS` (default two minutes). It logs
the final status, `smsId` and only the last four phone digits. Failed,
undelivered or timed-out tracking is a warning and never blocks the response or
deletes the stored code. The operator live-check deliberately retains its
synchronous final-tracking behavior.

### Configuration and activation work

- Set **backend only** `SMS_PROVIDER=otpiq`, `OTPIQ_API_KEY=<shubayr project API key from the secret store>`, and optionally `OTPIQ_TIMEOUT_MS=10000` plus `OTPIQ_TRACKING_TIMEOUT_MS=120000`. Keep `SMS_GATEWAY_URL=disabled` and `SMS_GATEWAY_TOKEN=` when using the production Compose template; the OTPIQ branch ignores these legacy settings. Empty keys fail startup validation when OTPIQ is selected.
- `APP_ENV=development` always bypasses SMS, including with OTPIQ selected. Do not change that setting merely to test with real phone numbers. Automated tests mock all outbound calls and database operations.
- Placeholder configuration is documented in `backend/.env.example` and `.env.production.example`. `docker-compose.prod.yml` forwards the provider, key, submission deadline and tracking deadline settings to the backend environment.
- Before real activation, the owner must authorize installing the project secret and a separately approved controlled end-to-end SMS test. Verify project credit, SMS channel availability, tracking fields, latency, and successful phone verification/session issuance. These live checks were explicitly excluded from this task.

### Missing controls: exact follow-up work

The existing strict route throttle is IP-based (default 30 requests/minute). It is preserved, but it is **not** a per-code failed-attempt limit or a per-phone resend cooldown. `OtpCode` has no attempt counter. Neither `AuthService` nor the Flutter resend screen implements a timed cooldown; Flutter only prevents overlapping requests. Do not describe those absent controls as preserved or implemented.

**Backend/API follow-up:** agree the attempt ceiling, resend interval, phone/IP quotas, and lockout/recovery policy. Add shared, atomic state (database or the existing Redis infrastructure) so limits work across API instances and concurrent requests. Increment failed verification attempts and invalidate exhausted challenges atomically; reserve the resend window before a billable provider call; define behavior for failed/unknown submissions without allowing rapid paid retries. Serialize concurrent sends for the same phone so a delayed request cannot replace a newer challenge. Cover restarts, concurrent verification, resend races, and limit expiry. If database fields or client-facing fields/errors are added, follow the migration/contract version/generated-types/mobile-migration-note workflow and obtain approval before running migrations.

**Flutter follow-up:** once server policy/contract is agreed, render the authoritative retry time with localized feedback and disable resend until eligible; retain existing phone formatting, session ownership, and navigation. A UI-only timer is not a security control. Do not invent retry fields or local attempt limits before the backend contract exists.

### C23 review and hardening follow-up

Contract 17.13.0 closes the backend controls listed above. Redis atomically
reserves a 60-second cooldown before delivery, applies 3-per-10-minute and
10-per-rolling-24-hour phone quotas plus 60-per-rolling-hour IP quota, and uses
an expiring per-phone lock. A failed or unknown provider result keeps its
reservation. PostgreSQL atomically increments each challenge's attempt counter
and invalidates it on the fifth wrong code. Development still makes no outbound
request, but it passes through the same Redis policy.

The adapter review tightened the SMS id to OTPIQ's documented 24-hex form,
passes a validated IPv4/IPv6 `req.ip` through one isolated camelCase
`antiFraud.requesterIp` helper, and retains the submission deadline, redirect
refusal and no-retry POST rules. Provider status/category logging is
sanitized: it contains no API key, OTP, provider body or full phone number. Provider
429 remains an internal delivery failure and maps to
`OTP_DELIVERY_UNAVAILABLE`; Shubayr's own rate decisions use the new stable 429
codes and retry fields.

The manually authorized live check is documented in
`docs/operations/otpiq-live-check.md`. It was not run by C23 and no key,
production environment or deployment was changed.

### Verification and handoff

Focused mocked adapter/configuration/authentication tests cover payload/normalization, dispatch confirmation, pending/failure handling, insufficient credit, rate limiting, timeouts, malformed responses, no automatic resend, digest/TTL preservation, expired/consumed OTP rejection, and atomic replay rejection. Existing Flutter phone, OTP, refresh, and session-lifecycle tests passed **78 tests**. Backend verification passed **80 Jest tests across 5 suites**, **2 strict-schema tests**, TypeScript type checking, and the contract error-code check (349 declared codes). Focused ESLint, `git diff --check`, and static Compose YAML/configuration checks also passed.

Reproduce from `backend/` using Node **24** and the committed lockfile:

```sh
npm ci --ignore-scripts --no-audit --no-fund
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/shubayr_otpiq_verify npm run prisma:generate
npx jest --runInBand src/modules/auth/otpiq-sms.spec.ts src/modules/auth/sms-gateway.service.spec.ts src/modules/auth/auth.service.spec.ts src/config/env.validation.spec.ts src/common/guards/tiered-throttler.guard.spec.ts
npm run typecheck
npm run contract:error-codes
node --test test/openapi-response-validator.spec.mjs
npx eslint src/modules/auth/sms-gateway.service.ts src/modules/auth/otpiq-sms.spec.ts src/modules/auth/auth.service.spec.ts src/config/env.validation.ts src/config/env.validation.spec.ts
```

Prisma generation uses an unreachable placeholder URL and generates local types only; it neither connects to nor migrates a database. The pre-existing local dependencies/types were stale and were refreshed from the committed lockfile. No dependency manifests or lockfiles were changed. The shell defaults to Node 22; backend verification uses an npm-cached Node 24 executable instead.

From `mobile/`:

```sh
flutter test --no-pub test/core/utils/international_phone_test.dart test/core/utils/phone_otp_input_formatters_test.dart test/features/auth/international_phone_flow_test.dart test/core/network/auth_refresh_test.dart test/app/auth_shell_lifecycle_test.dart
```

**Handoff:** base commit `af09cf2`; implementation remains uncommitted at the user's request. No PR/merge exists. Next steps are review of this diff and the missing-controls policy, then separately authorized activation/live acceptance. Database acceptance packs and real provider behavior are untested. No containers were started.

## Revision history

States below describe each historical step; the executive summary records the current handoff status.

| Date | Change | State |
|---|---|---|
| 2026-10-18 | Created the ongoing requirements document and added NOTE-001, including current implementation findings, requested behavior, recommendations, and open decisions. | Working draft; no implementation performed. |
| 2026-10-18 | Added NOTE-002 after delivery-agent Flutter/API/backend review and GET-only integration checks against local Docker data; separated reusable capabilities, backend gaps, observed issues, and pending decisions. | Working draft; documentation only; no application changes. |
| 2026-10-18 | Recorded the explicitly authorized current-API Flutter delivery improvements in NOTE-002 section 11; retained Backend/API requirements for later team handoff. | Working draft; implementation uncommitted; no Backend/Admin changes. |
| 2026-10-18 | Added NOTE-003/004/005 for category descriptions, managed Recently Added products, and account-persistent order/notification hiding after API 17.4.0, Flutter, Backend, and Web Admin review and public local API GET checks. | Working draft; documentation only; implementation and open decisions not approved. |
| 2026-10-18 | Added NOTE-006 and recorded the authorized current-API Flutter category image migration, legacy icon cleanup, existing media capabilities, and pending Web Admin workflow. | Working draft; Flutter changes uncommitted; Backend/Admin and legacy database fields unchanged. |
| 2026-10-18 | Added NOTE-007–011 after current API, Flutter, Backend, Web Admin and Web Store review. Implemented shared international phone input, LTR OTP display and existing bulk notification read in Flutter; documented other-team requirements and open policy decisions. | Working draft; changes uncommitted; no Backend/Admin/Web Store changes. |
| 2026-10-18 | Added NOTE-012 after reviewing Web Admin/Web Store login branding, official artwork, browser metadata, translation catalogs, locale switching and error presentation. Distinguished existing localization from raw-message and branding gaps; assigned implementation ownership. | Working draft; documentation only; no application or asset changes. |
| 2026-10-18 | Reconciled all 12 notes against current code and API 17.4.0, added team ownership/priorities/dependencies, corrected superseded category and notification findings, recorded phone direction/radio/typography completion, and flagged delivery add-on release scope without removing requirements. | Draft / Pending Team Review; owner-authorized mobile handoff; remaining requirements unapproved. |
| 2026-10-19 | Delivered the additive 17.7.0 Backend/API contract for NOTE-001 structured/default banners, NOTE-004 Recently Added, and NOTE-011 per-order limits; documented compatibility and deferred rolling quotas/client adoption. | Backend complete for C16; client UI work remains. |
| 2026-10-24 | Added NOTE-013: opt-in backend OTPIQ SMS adapter, mocked verification, configuration, preserved Flutter/API behavior, and exact missing attempt/cooldown/concurrency work. | Local implementation only; no commit, push, deployment, live SMS or database changes. |
| 2026-10-24 | C23 reviewed NOTE-013 and added the agreed shared OTP controls, localized additive contract and one-message operator check. | Backend/API implementation; live provider activation and Flutter adoption remain separate. |
| 2026-10-25 | C24 changed customer OTP persistence to funded OTPIQ submission acceptance and moved final tracking to the existing BullMQ worker, while keeping the live-check synchronous. | Backend behavior fix; contract remains 17.13.0. |

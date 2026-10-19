# Development-notes backlog

One row per note in [`docs/PROJECT_DEVELOPMENT_NOTES.md`](../PROJECT_DEVELOPMENT_NOTES.md)
(Ahmed's notes, merged to `main` with the mobile app in `46a80e9`). That
document holds each note's full requirements and open questions; this page tracks
**who does what, in which order, and what has been decided**, so nothing gets lost.

- **Owners:** Backend/API = Codex; Web Admin and Web Store = Claude Code;
  Flutter = Ahmed.
- **Contract first:** a row that "needs a contract" waits for Codex to
  add it to `api/openapi.yaml`. No client invents fields in the meantime.
- **Blocks app-store submission:** *Yes* means the first mobile app-store
  submission should wait for the item. These items need code inside the app
  binary, so shipping without them means a second store review to add them.
  *No* means the item is server, web or content work, or the app side is already
  done.

Update this page in the same PR that moves an item.

## Now — before the store opens

| Note | Subject | Owner team(s) | Status | Agreed decision | Blocks app-store submission |
|---|---|---|---|---|---|
| [NOTE-006](../PROJECT_DEVELOPMENT_NOTES.md#note-006--category-images-and-icon-system-migration) | Category images (icon migration) | Web Admin | **In PR A9.** Flutter migration is already done. | One square image per category through the existing media upload. Crop in the browser; replace or remove without deleting the category or shared media. No new API. | No |
| [NOTE-003](../PROJECT_DEVELOPMENT_NOTES.md#note-003--main-categories--description) | Main-category descriptions | Web Admin | **In PR A9.** Flutter display is already done. | Optional Arabic and English descriptions in the existing category dialog, cleared with an empty field. The API's language fallback is explained in the editor. No new API. | No |
| [NOTE-008](../PROJECT_DEVELOPMENT_NOTES.md#note-008--category-name-and-description-editorial-guidance) | Category name/description guidance | Web Admin | **In PR A9.** | Soft guidance only: names about 2–4 words / ≤ 24 user-perceived characters; descriptions about 6–10 words / ≤ 60. A non-blocking "may be shortened" warning; no `maxLength`, no trimming. | No |
| [NOTE-001](../PROJECT_DEVELOPMENT_NOTES.md#note-001--home-page-banner-management) | Home banners | Web Admin, Web Store (now); Backend/API, Flutter (next) | **Partly in PR A9:** the Web Admin Home Banners screen on the existing API, and Web Store no-action, phone-artwork and empty-feed fixes. **Needs a Codex contract** for the rest. | Now: existing CRUD, schedule (Asia/Baghdad), up/down reorder, duplicate as disabled, 2:1 artwork starting at 1600 × 800. Next contract: Arabic/English text, text visibility, structured click actions (product / category / offers / URL / none) and managed default banners. | **Yes**, for the structured actions and default banners: both need Flutter code. |
| [NOTE-012](../PROJECT_DEVELOPMENT_NOTES.md#note-012--web-applications--branding-and-localization-improvements) | Web branding and localized errors | Web Admin, Web Store (+ Backend codes only where one is missing) | To do | Official logo and favicon from `mobile/assets/images/branding/shubayr-logo.png`. Localized messages by error code; never raw server text. | No (web only) |
| [NOTE-004](../PROJECT_DEVELOPMENT_NOTES.md#note-004--recently-added-products) | Recently Added products | Backend/API, Web Admin, Flutter | **Needs a Codex contract** (settings and a public selection that filters before limiting) | Recency comes from the product's creation date. No client-side filtering of a loaded page as a substitute. | **Yes**: it is a new Flutter Home section. |
| [NOTE-009](../PROJECT_DEVELOPMENT_NOTES.md#note-009--zain-font-for-web-store) | Zain font for the Web Store | Web Store | **Pending owner OK** | Self-hosted WOFF2 of the licensed 400/700/800 faces; Web Store only (Web Admin unchanged). | No |
| [NOTE-011](../PROJECT_DEVELOPMENT_NOTES.md#note-011--product-purchase-quantity-limits) | Purchase limits: **per-order maximum only** | Backend/API, Web Admin, Web Store, Flutter | **Needs a Codex contract** | Before opening: an optional per-product maximum per order, enforced by the server, with a declared refusal code. The rolling-window quota is deferred (below). | **Yes**: the app must show the limit and the refusal. |

## After launch

| Note | Subject | Owner team(s) | Status | Agreed decision | Blocks app-store submission |
|---|---|---|---|---|---|
| [NOTE-005](../PROJECT_DEVELOPMENT_NOTES.md#note-005--customer-order-history-and-notifications--hide-functionality) | Hide orders and notifications | Backend/API, Flutter (Web Store later) | Deferred | Account-persistent server state only; no local hidden-id lists. | No (after launch) |
| [NOTE-011](../PROJECT_DEVELOPMENT_NOTES.md#note-011--product-purchase-quantity-limits) | Purchase limits: rolling-window quota | Backend/API, Web Admin, Web Store, Flutter | Deferred | Follows the per-order maximum. Window, returns and cancellation policy still to agree. | No (after launch) |

## Out of this version

| Note | Subject | Owner team(s) | Status | Agreed decision | Blocks app-store submission |
|---|---|---|---|---|---|
| [NOTE-002](../PROJECT_DEVELOPMENT_NOTES.md#note-002--delivery-agent--order-management-improvements) | Delivery-agent order management | Backend/API, Flutter | Out of this version | The delivery-agent app is a future add-on per [`docs/decisions/2026-10-12.md`](../decisions/2026-10-12.md). The current-API Flutter work already done is kept; no Backend work is scheduled. | No |

## Open decision

| Note | Subject | Owner team(s) | Status | Decision needed | Blocks app-store submission |
|---|---|---|---|---|---|
| [NOTE-007](../PROJECT_DEVELOPMENT_NOTES.md#note-007--international-phone-input-otp-display-and-delivery-contacts) | International phones | Backend/API, Web Store, Web Admin (Flutter done) | **Open decision** | Iraq-only phones or international ones (sign-in and delivery contacts)? Until decided, the server keeps accepting E.164 and the web keeps the Iraqi `07…` input. | No: the app already accepts both. |

## Done

| Note | Subject | Owner team(s) | Status | Agreed decision | Blocks app-store submission |
|---|---|---|---|---|---|
| [NOTE-010](../PROJECT_DEVELOPMENT_NOTES.md#note-010--mark-all-notifications-as-read) | Mark all notifications as read | Flutter | Done | Uses the existing `PATCH /me/notifications/read-all`; Web Admin and Web Store already had it. | No |

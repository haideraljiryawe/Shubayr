# Shubayr Web Admin — Visual Review and Implementation Brief

**Review date:** 2026-10-22  
**Document language:** English; approved Arabic UI copy is retained where implementation requires it.  
**Approved findings:** 25, retaining stable IDs (VIS-001 through VIS-025).  
**Status:** Initial review and approved follow-up findings documented; implementation and verification remain pending.  
**Audience:** Frontend and backend engineers, QA, and coding agents such as Claude Code.

## Review environment and production data

**The reviewer states that this review was performed against the application hosted on the VPS, using the production database. Records were added or modified in production during the review.** Treat the screenshots as captures of that environment, not as evidence of an isolated test database.

The affected records, their IDs, and the full extent of those changes have not been inventoried in this document. The review does not authorize deleting, resetting, migrating, or otherwise changing production data. Any cleanup requires identification of the exact records and separate, concrete approval. Prefer isolated test data for implementation verification.

## How to use this brief

- Each finding separates the **problem/evidence**, **required solution**, **implementation guidance**, and **acceptance criteria**. Unchecked criteria are pending, not failed tests or completed work.
- Priorities are provisional review assessments: **High** for the active-session interruption; **Medium** for most usability and consistency issues; **Low** for field borders and the tab scrollbar.
- Screenshots establish visible symptoms. They do not establish the underlying code, API behavior, database schema, or root cause. User-reported behavior is identified explicitly.
- Global requirements apply to every relevant component instance, including dialogs. A screenshot is an example, not the boundary of the fix.
- Inspect the repository and existing shared components before implementation. Extend the existing theme, localization, and component infrastructure where possible; do not create competing implementations.
- FE/BE ownership below is a suggested coordination boundary, not a claim about the current architecture. No framework, service, or library choice is prescribed.
- Keep IDs stable. Consolidation references related findings rather than silently deleting their requirements. Retain Arabic/English support throughout.
- Attachments use relative paths under `CleanShot/`. Share this Markdown file together with that folder, or use the accompanying ZIP package.

## Index and suggested work order

Investigate VIS-017 first. Establish the theme and shared primitives before migrating page-specific instances. Implement image processing and timezone/reporting work with frontend/backend coordination. The grouping below is organizational, not a renumbering.

| ID | Requirement | Priority | Suggested ownership |
|---|---|---|---|
| [VIS-017](#vis-017) | Unexpected sign-out during active use | High | FE + BE |
| [VIS-018](#vis-018) | Central typography and color theme | Medium | FE |
| [VIS-006](#vis-006) | Field borders and focus states | Low | FE |
| [VIS-005](#vis-005) | Shared styled dropdowns | Medium | FE |
| [VIS-024](#vis-024) | Clear, localized file-selection controls | Medium | FE |
| [VIS-025](#vis-025) | Application version on login and sidebar footer | Low | FE + release metadata owner |
| [VIS-007](#vis-007) | Thousands separators in amount/quantity inputs | Medium | FE; verify numeric contract |
| [VIS-010](#vis-010) | Fixed dialog header/footer; scrollable body | Medium | FE |
| [VIS-013](#vis-013) | Contained page action footer | Medium | FE |
| [VIS-015](#vis-015) | Remove vertical scrolling from tab strips | Low | FE |
| [VIS-011](#vis-011) | Table direction, alignment, and typography | Medium | FE |
| [VIS-012](#vis-012) | Shared table footer and pagination | Medium | FE |
| [VIS-014](#vis-014) | Visually separate table toolbar | Medium | FE |
| [VIS-002](#vis-002) | Grouped navigation and responsive drawer | Medium | FE |
| [VIS-004](#vis-004) | Independent scrolling, language setting, logout confirmation | Medium | FE; account preference integration |
| [VIS-003](#vis-003) | Focused home dashboard | Medium | FE; filtered data integration |
| [VIS-001](#vis-001) | Login layout and validation messages | Medium | FE; authentication error mapping |
| [VIS-019](#vis-019) | Localized permission names and descriptions | Medium | FE + permission metadata owner |
| [VIS-021](#vis-021) | Shared image editor; square brand images | Medium | FE; upload integration |
| [VIS-008](#vis-008) | Product images, bulk processing, deletion confirmation | Medium | FE + BE |
| [VIS-009](#vis-009) | Category image previews and editing | Medium | FE |
| [VIS-016](#vis-016) | Contextual guidance and store timezone | Medium | FE + BE |
| [VIS-020](#vis-020) | Consistent PDF export for all reports | Medium | FE + export/data service owner |
| [VIS-022](#vis-022) | Purchase-invoice product entry, editing, and removal | Medium | FE; invoice/draft integration |
| [VIS-023](#vis-023) | Arabic product search in purchase invoices | Medium | FE + search/API owner |

## 1. Session reliability

<a id="vis-017"></a>
### VIS-017 — Unexpected sign-out during active use

**Scope / priority / status:** Authenticated application; High; approved, root cause unresolved.

**Problem and evidence:** The reviewer reports being signed out repeatedly **while actively working and navigating**, not merely after inactivity. The interval and any accompanying message are unknown. It is not established whether session expiration, refresh failure, deployment activity, or another cause is responsible. Actual loss of unsaved data has not been confirmed. No screenshot captures the sign-out event.

**Required solution:** Maintain and renew the session according to the approved session policy during active use. Explain intentional expiration and avoid silent interruption or loss of unsaved work.

**Implementation guidance:** Correlate observed timestamps with authentication expiration/refresh failures and deployment events. Distinguish idle timeout, absolute lifetime, renewal failures, and session invalidation. Do not solve this by removing expiration controls or making sessions unlimited. Where expiration is predictable, warn beforehand and allow extension only when policy permits. Handle unsaved edits and provide a clear reason when redirecting to login.

**Acceptance criteria:**

- [ ] Reproduce or identify the cause with evidence; do not mark resolved solely by changing a timeout.
- [ ] Active navigation and saving remain stable beyond the previously observed failure interval, once measured.
- [ ] Idle and intentional-expiration cases are tested separately; policy remains enforced.
- [ ] Expiration messaging and handling of unsaved work are verified in both languages.

## 2. Shared design system and form components

<a id="vis-018"></a>
### VIS-018 — Centralize typography and colors

**Scope / priority / status:** All UI components and pages; Medium; approved, not implementation-verified.

**Problem and evidence:** The reviewer reports that typed text is larger in some inputs than in equivalent inputs elsewhere. Table typography has a related example in VIS-011. No source inspection establishes whether a theme already exists or local overrides cause the inconsistency.

**Required solution:** Use one central theme source for typography and colors. Equivalent elements must have equivalent styling across pages, while headings, body text, labels, and secondary text retain an intentional hierarchy.

**Implementation guidance:** Define shared font sizes, weights, line heights, and semantic colors for primary/secondary text, backgrounds, borders, brand actions, success, warning, error, disabled, focus, and hover states. Cover typed values, displayed values, placeholders, labels, inputs, numeric/date/search fields, textareas, dropdowns, tables, badges, buttons, cards, and dialogs. Extend the existing theme if present. Remove unjustified local values; represent legitimate variants centrally. VIS-006 and VIS-011 consume these same definitions.

**Acceptance criteria:**

- [ ] Changing a central token updates every relevant consumer without per-page edits.
- [ ] Equivalent controls have consistent typography in Arabic and English.
- [ ] Hierarchy, readability, contrast, and interaction states remain clear across screen sizes.

<a id="vis-006"></a>
### VIS-006 — Improve field borders and focus visibility

**Scope / priority / status:** All form fields, filters, and dialog inputs; Low; approved, not implementation-verified.

**Problem and evidence:** Login field borders appear faint. This is a global requirement, not a claim that every field has been individually inspected. [Login example](<CleanShot/CleanShot 2026-10-22 at 7.04.19 PM.png>).

**Required solution:** Use slightly darker, clearly visible normal-state borders and a distinct green focused-state outline consistent with the application identity.

**Implementation guidance:** Apply shared theme tokens to text, password, number, search, date, textarea, and select controls. Preserve distinct error and disabled states; the generic green focus treatment must not erase their meaning.

**Acceptance criteria:**

- [ ] Normal and focused fields remain distinguishable against page and dialog backgrounds.
- [ ] Equivalent fields use the same central rules, including the dropdown trigger in VIS-005.
- [ ] Error/disabled states and keyboard focus are clear in both languages.

<a id="vis-005"></a>
### VIS-005 — Standardize dropdown appearance and behavior

**Scope / priority / status:** All selection dropdowns; Medium; approved, not implementation-verified.

**Problem and evidence:** The category selector arrow is too close to its edge. The open options appear in platform-default styling that does not match the application. [Closed control](<CleanShot/CleanShot 2026-10-22 at 7.52.55 PM.png>), [open options](<CleanShot/CleanShot 2026-10-22 at 7.53.08 PM.png>). Keyboard and assistive-technology behavior has not been tested.

**Required solution:** Consistent padding, theme-based option styling, rounded corners, subtle shadow, comfortable option spacing, and clear selected/hover/focus states.

**Implementation guidance:** Mirror text/arrow placement for RTL/LTR; separate the arrow from both text and edge. Align the popup with its trigger, open below or above according to available space, and keep it inside the viewport. Scroll long option lists internally. If the existing primitive cannot meet the requirements, provide a shared reusable component and import it everywhere needed. Preserve arrow-key navigation, Enter selection, Escape/outside-click dismissal, and screen-reader support.

**Acceptance criteria:**

- [ ] Selection is identified with a checkmark and appropriate color, not ambiguous styling.
- [ ] Popup positioning and long lists work near viewport edges and on small screens.
- [ ] Keyboard interaction and accessible labeling work in Arabic and English.

<a id="vis-007"></a>
### VIS-007 — Add thousands grouping to monetary and suitable numeric inputs

**Scope / priority / status:** All amount fields and quantities that benefit from grouping; Medium; approved, not implementation-verified.

**Problem and evidence:** The reviewer requested a consistent readability rule. No dedicated screenshot or full field audit establishes current coverage.

**Required solution:** Display grouped values such as `1,000`, `150,000`, and `1,250,000`, preserving valid decimals such as `1,250.50`. Apply to prices, costs, payments, expenses, balances, and appropriate large quantities.

**Implementation guidance:** Format while editing without cursor jumps or broken deletion/paste. Accept supported pasted values with or without grouping. Distinguish grouping from decimal separators according to the interface locale. Preserve allowed precision and signs without rounding as a side effect. Keep storage/calculation values numerically correct; do not submit grouping characters as part of the numeric value. Exclude identifiers such as telephone numbers, barcodes, product codes, and document numbers. Use a shared formatter/input implementation.

**Acceptance criteria:**

- [ ] Typing, insertion, deletion, and paste remain usable with grouping enabled.
- [ ] Display, submitted value, persisted value, and calculations agree, including decimals and allowed negatives.
- [ ] Identifiers remain unchanged and both languages use unambiguous formatting.

<a id="vis-010"></a>
### VIS-010 — Keep dialog headers and action footers visible

**Scope / priority / status:** All dialogs and popup forms; Medium; approved, not implementation-verified.

**Problem and evidence:** The category dialog has a long body; its main save/cancel actions are absent from the visible area in the longer screenshot. Direct scrolling behavior was not tested. [Full dialog](<CleanShot/CleanShot 2026-10-22 at 8.17.21 PM.png>), [long image-editing state](<CleanShot/CleanShot 2026-10-22 at 8.18.17 PM.png>).

**Required solution:** A fixed header **within the dialog**, a scrollable body, and a fixed bottom action area **within the dialog**.

**Implementation guidance:** Header: title, concise primary context, and close control where present. Footer: main actions such as Save/Cancel. Only fields, images, and long content scroll vertically. Bound dialog height to the viewport, prevent overlap with fixed areas, and lock background-page scrolling. Use a shared dialog shell.

**Acceptance criteria:**

- [ ] Title and primary actions remain visible while scrolling a long body.
- [ ] Every field and validation message can be reached without being covered.
- [ ] Small screens and image-editing states retain usable headers/footers; background stays still.

<a id="vis-013"></a>
### VIS-013 — Contain and style page-level action footers

**Scope / priority / status:** Page/form action bars such as Save product; Medium; approved, not implementation-verified.

**Problem and evidence:** The product save bar extends beyond the alignment of the form cards and has abrupt, poorly defined side edges. Its actual positioning code and other pages have not been inspected. [Product action bar](<CleanShot/CleanShot 2026-10-22 at 8.40.53 PM.png>).

**Required solution:** A fully bordered, rounded action bar aligned exactly to its form container, remaining available at the bottom of the content area during long-form scrolling.

**Implementation guidance:** Include padding and margins in width calculations; do not span the viewport or extend under the sidebar. Use a matching background, subtle borders on all sides, and an optional light shadow. Keep the bar constrained to its container. Reserve enough content space so it cannot cover final inputs/errors. Allow buttons to wrap on narrow screens and respect bottom safe areas. Localize action ordering. Keep the page bar behind modal overlays. Centralize this pattern; dialog footers follow VIS-010 and table footers follow VIS-012.

**Acceptance criteria:**

- [ ] Both edges align with the form at desktop/mobile widths and after sidebar changes.
- [ ] All content remains reachable, and buttons are neither clipped nor overlapped.
- [ ] Opening a dialog never leaves the page save bar above its overlay.

<a id="vis-015"></a>
### VIS-015 — Remove unintended vertical scrollbars from tab strips

**Scope / priority / status:** All horizontal tab strips; Low; approved, not implementation-verified.

**Problem and evidence:** A vertical scrollbar appears at the left edge of the order tabs, marked by the reviewer. Root cause and prevalence are unverified. [Order tab strip](<CleanShot/CleanShot 2026-10-22 at 8.46.35 PM.png>).

**Required solution:** Fit labels, counts, active indicators, and focus outlines without vertical scrolling inside the strip. Allow horizontal scrolling when tabs exceed the available width.

**Implementation guidance:** Correct height, padding, borders, and overflow interactions rather than merely hiding clipped content. Keep horizontal overflow inside the strip, keep the selected tab visible, and preserve keyboard access and RTL/LTR behavior. Fix the shared component and audit its consumers.

**Acceptance criteria:**

- [ ] No vertical tab-strip scrollbar or clipped label/badge/indicator/focus ring.
- [ ] All tabs remain reachable at narrow widths and increased browser zoom.
- [ ] Tabs do not introduce horizontal overflow for the entire page.

<a id="vis-024"></a>
### VIS-024 — Standardize and localize general file-selection controls

**Scope / priority / status:** General file-upload/import controls throughout the application, including Excel imports and bulk-image ZIP uploads; Medium; approved, not implementation-verified. Individual product/category image-upload editors are excluded and continue to follow VIS-008, VIS-009, and VIS-021. Other individual-image slots already covered by VIS-021 retain that editor as well.

**Problem and evidence:** Arabic screens display the browser-style text “No file chosen Choose File” inside a field, with no clearly distinguished selection button. The language and presentation do not match the surrounding interface. [Excel import selector](<CleanShot/CleanShot 2026-10-22 at 9.40.11 PM.png>), [bulk ZIP selector](<CleanShot/CleanShot 2026-10-22 at 9.40.27 PM.png>).

**Required solution:** A clearly styled Choose file button and a separate readable selection-status area, both controlled by the application's locale. Use a shared component wherever this general file-selection pattern occurs.

| State/control | Arabic | English |
|---|---|---|
| Single-file selection button | اختيار ملف | Choose file |
| Multiple-file selection button, where supported | اختيار ملفات | Choose files |
| No selection | لم يتم اختيار أي ملف | No file selected |
| Selected file | Display the actual filename | Display the actual filename |
| Multiple files, where supported | Show a localized selected-file count | Show a localized selected-file count |

**Implementation guidance:**

- Provide a visible button with appropriate contrast, spacing, focus styling, and a clear click target. Keep selection status distinct from the button rather than showing a concatenated string inside a native-looking field.
- Use application translation resources for labels, empty states, counts, and errors; do not rely on the browser or operating-system language for the in-page control. The system file-picker dialog itself may retain the operating-system language.
- After selection, display the filename without translating or altering it. Handle long or mixed Arabic/Latin filenames without breaking layout; keep the full name accessible if visually shortened. Cancelling the picker must not unexpectedly clear an existing selection.
- Respect RTL/LTR in button/status placement and preserve correct filename reading order. Use the central theme and field styles in VIS-018 and VIS-006.
- Keep file selection separate from existing actions such as Inspect file, Import, or Upload images; choosing a file must not silently change the established submission workflow.
- Retain each destination's accepted file types, size limits, and single/multiple-file rules. This presentation change does not introduce multiple-file support where it does not exist.
- Wrap the native file input with a shared, accessible application control if necessary. Preserve keyboard activation, an accessible label, and screen-reader access to the selected-file status.
- Apply this component to Excel and ZIP selection and audit equivalent general-file controls across pages/dialogs. Do not replace the interactive image editor with this simpler control. Bulk ZIP remains in scope for file selection, while its image processing remains governed by VIS-008.

**Acceptance criteria:**

- [ ] Arabic interfaces show an explicit Arabic selection button and empty-state message; English interfaces show their English equivalents, independently of browser language.
- [ ] Selecting, replacing, or cancelling selection produces accurate status without an unintended upload or lost prior selection.
- [ ] Filenames, long names, and supported multiple-file counts remain readable in RTL/LTR and on narrow screens.
- [ ] Keyboard and assistive-technology users can activate the picker and identify its current state.
- [ ] Excel/ZIP constraints and processing behavior are preserved, and individual-image editors remain unchanged by this general-file control requirement.

## 3. Shared table / data-grid system

Treat table typography, alignment, toolbar, and pagination as one coordinated component family. Keep the four IDs below for traceability; do not implement four incompatible table variants.

<a id="vis-011"></a>
### VIS-011 — Standardize table direction, alignment, and typography

**Scope / priority / status:** Every table, including dialog tables; Medium; approved, not implementation-verified.

**Problem and evidence:** The reviewer reports inconsistent alignment and smaller text in some tables. Inventory movements is the supplied typography example; actual computed font sizes have not been measured. [Inventory movements](<CleanShot/CleanShot 2026-10-22 at 9.01.02 PM.png>).

**Required solution:** Arabic tables use RTL ordering and right-aligned headers/cells. English tables use LTR ordering and left-aligned headers/cells. A column heading must line up with its values. Equivalent text roles use consistent sizes across all tables.

**Implementation guidance:** Use logical alignment and matching header/cell padding, accounting for icons. Keep values under their correct headers when direction changes. Preserve the reading order of numbers, codes, and mixed text. Consume VIS-018 tokens for font size/weight/line height, badges, and actions. Remove unjustified local overrides. Do not shrink text simply to fit more columns; use suitable column layout, wrapping, or horizontal scrolling. Apply the same consistency to VIS-012 and VIS-014.

**Acceptance criteria:**

- [ ] Arabic/English column ordering, headings, values, and mixed-direction strings are correct.
- [ ] Equivalent tables compared at the same browser zoom have matching text styles.
- [ ] Essential data remains readable on smaller screens without automatic font reduction.

<a id="vis-012"></a>
### VIS-012 — Create a shared table footer and pagination component

**Scope / priority / status:** All table footers, including tables in dialogs; Medium; approved, not implementation-verified.

**Problem and evidence:** Footer controls look detached from the table. The one-record range is confusing in Arabic, and page count, jump field, and jump button are unnecessarily repetitive. The page-size label is vague. [Current table footer](<CleanShot/CleanShot 2026-10-22 at 8.35.37 PM.png>).

**Required solution:** A footer inside the table boundary, with a subtle background/top divider and three coherent groups.

| Group | Arabic placement | English placement |
|---|---|---|
| Record summary | Right | Left |
| Page navigation | Center | Center |
| Page-size selector | Left | Right |

Use the following state-aware copy; numbers are examples, not fixed values.

| State/control | Arabic | English |
|---|---|---|
| One record | سجل واحد | 1 record |
| All results visible | إجمالي السجلات: 12 | Total records: 12 |
| Multiple pages | عرض 21 إلى 40 من أصل 125 سجلاً | Showing 21 to 40 of 125 records |
| Empty result | لا توجد سجلات | No records |
| Page size | عدد السجلات في الصفحة | Records per page |
| Previous / next | السابق / التالي | Previous / Next |
| Page indicator | الصفحة 2 من 7 | Page 2 of 7 |

**Implementation guidance:**

- Disable unavailable Previous/Next actions; hide navigation for zero or one page. Keep the clear page-size selector.
- Remove the separate jump-to-page field/button from the default layout. If large datasets require direct navigation, integrate it into the page-number selector.
- Mirror groups and directional arrows for RTL/LTR without reversing numeric digits or range meaning. Isolate numeric runs when needed to avoid bidirectional-text reordering. Keep grouping and number formatting consistent.
- On small screens, wrap groups into readable rows inside the same footer without extra page-wide overflow.
- Extend an existing shared footer or create one central component. Import it in every applicable page/dialog. Pass record total, current page, page size, locale, and change callbacks; preserve each table's filtering and loading behavior.

**Acceptance criteria:**

- [ ] Empty, one-record, one-page, multi-page, and large-count states have correct copy and controls.
- [ ] Arabic numbers, ranges, arrows, and labels are correctly ordered; English is equally coherent.
- [ ] Footer looks attached to its table at wide and narrow widths.
- [ ] A shared-component change reaches all migrated consumers without per-page copies.

<a id="vis-014"></a>
### VIS-014 — Separate table-level tools from headers and row actions

**Scope / priority / status:** Tables/cards with title and tools above column headers; Medium; approved, not implementation-verified.

**Problem and evidence:** In Warehouses and locations, the warehouse title/status and Edit/Disable/Delete controls share the rows' white background. Similar row actions make the parent-level tools visually ambiguous. Other occurrences are not verified. [Warehouse toolbar](<CleanShot/CleanShot 2026-10-22 at 8.44.22 PM.png>).

**Required solution:** A distinct title/toolbar area inside the card, with a light contrasting background, full-width bottom border, and comfortable padding. Column headers and data rows remain separate below it.

**Implementation guidance:** Group title/status/context links separately from parent-level actions. Retain row actions inside their own rows. Respect the card's top corner radius and width. Mirror layout by language and wrap tools on small screens. Centralize in the table/card component family with VIS-011 and VIS-012.

**Acceptance criteria:**

- [ ] Users can distinguish warehouse actions from location-row actions without relying on proximity alone.
- [ ] Background/divider/padding clearly define the toolbar without overflow.
- [ ] RTL/LTR and wrapped small-screen layouts preserve action scope.

## 4. Navigation, application shell, and home

<a id="vis-025"></a>
### VIS-025 — Display the application version on login and in the sidebar footer

**Scope / priority / status:** Login page and shared sidebar, including its responsive drawer; Low; approved, not implementation-verified.

**Problem and evidence:** The reviewer requests a consistent, visible application version in both locations to identify the running release. The current version source and any existing display have not been inspected; no dedicated screenshot accompanies this request.

**Required solution:** Display the same application release version on the login page and in a dedicated footer at the bottom of the sidebar.

**Implementation guidance:**

- Read the version from one authoritative release/build metadata source appropriate to the existing application. Do not hard-code separate values in the two views or invent a version number.
- On the login page, place the version as a subtle but readable secondary label near the bottom, separate from the form's primary actions and validation messages.
- In the sidebar, use a compact footer anchored below the independently scrolling navigation items. Keep it visible while the items scroll and prevent it from covering the last navigation entry. Apply the same treatment to the responsive drawer.
- Use localized labeling: `الإصدار` in Arabic and `Version` in English, followed by the actual version identifier. Preserve the identifier's reading order within RTL text.
- Use shared theme typography and colors, with appropriate contrast and spacing. The version should remain legible without competing with navigation or sign-in actions.
- Identify the running application release consistently in both locations; coordinate the metadata source with the release process so future releases update the display centrally.

**Acceptance criteria:**

- [ ] Login and sidebar footer display the same actual application version from one source.
- [ ] The label is localized and the version identifier reads correctly in Arabic and English.
- [ ] Sidebar navigation scrolls independently without hiding the version footer or obscuring its final item.
- [ ] The version remains readable in the responsive drawer and at narrow login-page widths.
- [ ] Updating release metadata updates both displays without separate page-level edits.

<a id="vis-002"></a>
### VIS-002 — Group sidebar navigation and use a responsive side drawer

**Scope / priority / status:** Shared navigation; Medium; approved, not implementation-verified.

**Problem and evidence:** The flat sidebar extends beyond the viewport and mixes daily tasks with occasional settings. The reviewer also reports a top-down opening behavior when the permanent sidebar is hidden. Animation was not directly tested. [Upper navigation](<CleanShot/CleanShot 2026-10-22 at 7.27.09 PM.png>), [remaining navigation](<CleanShot/CleanShot 2026-10-22 at 7.27.26 PM.png>).

**Required solution:** Two levels only: collapsible functional groups and child pages. Preserve Home and Reports as direct links. The approved grouping is:

| Group (English / Arabic) | Child pages / treatment |
|---|---|
| Home / الرئيسية | Direct link |
| Products and catalog / المنتجات والكتالوج | Products, Categories, Brands, Excel import, Bulk images |
| Orders and delivery / الطلبات والتوصيل | Orders, Returns, Delivery providers, Delivery areas, Work numbers |
| Inventory and warehouses / المخزون والمستودعات | Inventory, Opening inventory, Inventory movements, Warehouses, Transfers, Stocktaking, Write-offs |
| Purchasing and suppliers / المشتريات والموردون | Suppliers, Purchase invoices, Supplier payments, Accounts payable and aging |
| Finance and accounting / المالية والمحاسبة | Cashboxes and bank accounts, Cash receipts, Expenses, Expense categories, Currencies and exchange rates, Accounting ledger, Periods and closing |
| Store and marketing / المتجر والتسويق | Store settings, Home banners, Automatic discounts |
| Users and permissions / المستخدمون والصلاحيات | Employees, Permission groups, Audit log |
| Reports / التقارير | Direct link; further subdivision requires content review |

“Work numbers” corresponds to the existing `أرقام العمل` page; grouping does not change its business meaning.

**Implementation guidance:**

- Make the full group row toggle expansion, with a clear state arrow. Keep the active page's group open; use green for the active child and a lighter parent treatment. Preserve expansion state while navigating.
- Show only pages available under existing permissions; hide empty groups. Do not change permission grants to achieve this.
- Keep the logo fixed above independently scrolling navigation items (VIS-004).
- On wide screens retain the permanent sidebar on the language-appropriate side. When hidden at a responsive width, use an overlaid, full-height drawer: enter from the right in Arabic and from the left in English; exit toward the same edge with smooth horizontal motion.
- Use approximately 280–320 px width, capped at 85% of viewport width. Do not occupy the entire width or push/reflow page content.
- Dim the page behind the drawer with a translucent dark overlay, blocking background interaction and scrolling. Scroll long drawer content internally.
- Close via a clear close button, overlay click, or Escape; restore background interaction afterward.

**Acceptance criteria:**

- [ ] All listed pages remain reachable in the correct group, with no deeper nesting.
- [ ] Active state, expansion persistence, and permission-based visibility work.
- [ ] Drawer motion mirrors by language, leaves visible background, and never shifts the page.
- [ ] Long navigation, overlay dismissal, and independent scrolling work across breakpoints.

<a id="vis-004"></a>
### VIS-004 — Independent scrolling, account language, and logout confirmation

**Scope / priority / status:** Shared authenticated shell; Medium; approved, not implementation-verified.

**Problem and evidence:** The sidebar logo/top region disappears after page scrolling while the account bar remains visible. The language switch has high prominence despite infrequent use. The reviewer reports immediate sign-out on clicking logout. [Before scrolling](<CleanShot/CleanShot 2026-10-22 at 7.47.01 PM.png>), [after scrolling](<CleanShot/CleanShot 2026-10-22 at 7.47.16 PM.png>).

**Required solution and implementation:**

1. Keep the account/notification bar fixed above content and the logo/name fixed above sidebar items. Main content and sidebar items scroll independently. Reaching the sidebar's scroll boundary must not scroll the page. A newly opened page starts at the top while preserving sidebar position and expansion. Retain VIS-002 drawer behavior on narrow screens.
2. Remove the language switch from the authenticated top bar. Place it under **Account settings → Language**, offering `العربية` and `English`. Persist the preference per user, without affecting other employees. Keep the pre-login language control from VIS-001.
3. Confirm logout before ending the session:

| Element | Arabic | English |
|---|---|---|
| Title | تسجيل الخروج | Sign out |
| Message | هل تريد تسجيل الخروج من حسابك؟ | Do you want to sign out of your account? |
| Actions | إلغاء · تسجيل الخروج | Cancel · Sign out |

Only confirmation ends the session. Cancel, dismissal, or Escape leaves it intact.

**Acceptance criteria:**

- [ ] Content scrolling does not move the sidebar or either fixed header.
- [ ] Account language persists for that user; login language remains accessible.
- [ ] Logout cancellation/dismissal does not terminate the session; confirmation does.

<a id="vis-003"></a>
### VIS-003 — Make the home page a focused operational dashboard

**Scope / priority / status:** Home; Medium; approved, not implementation-verified.

**Problem and evidence:** A large setup section and a long catalog of page-link cards dominate the dashboard, duplicating navigation. Separate daily/monthly sales cards repeat a metric for different periods. [Top of home](<CleanShot/CleanShot 2026-10-22 at 7.27.09 PM.png>), [duplicated link cards](<CleanShot/CleanShot 2026-10-22 at 7.27.26 PM.png>).

**Required solution:** Order the page as **compact setup → needs attention → performance summary → limited shortcuts**.

**Implementation guidance:**

- Setup: compact progress strip (e.g., “4 of 6 completed” based on actual state), next step, and Show steps action. Expand details on demand; allow hiding once setup is complete.
- Needs attention: pending-confirmation orders, overdue orders, low-stock items, and amounts due within seven days. Each card opens the relevant prefiltered records. Use alert styling only when attention is needed; zero states stay calm.
- Performance: one period selector (Today / This month / Custom range) for net sales, order count, and profit. Briefly explain the profit calculation. This filter does not redefine operational alerts such as the seven-day due window.
- Quick access: only 4–6 compact icon-and-label shortcuts, e.g., Orders, Products, Inventory, Purchase invoices. Remove the exhaustive set of large page-description cards. All pages remain in the sidebar.
- Respect user roles and existing permissions, especially for profit and financial information.

**Acceptance criteria:**

- [ ] Setup no longer dominates; completion state is real, not hard-coded.
- [ ] Alert cards lead to correctly filtered records.
- [ ] Performance metrics use one selected period while alert time semantics stay intact.
- [ ] Home no longer duplicates the full sidebar; sensitive cards respect permissions.

## 5. Login and permission presentation

<a id="vis-001"></a>
### VIS-001 — Simplify login and correct validation feedback

**Scope / priority / status:** Arabic and English login; Medium; approved, not implementation-verified.

**Problem and evidence:** The brand/admin text repeats, field borders are faint, and no password visibility control is visible. Apparently empty inputs receive generic format/length errors rather than required-field guidance. [Normal login](<CleanShot/CleanShot 2026-10-22 at 7.04.19 PM.png>), [Arabic errors](<CleanShot/CleanShot 2026-10-22 at 7.13.23 PM.png>), [English errors](<CleanShot/CleanShot 2026-10-22 at 7.14.07 PM.png>).

**Required solution and implementation:**

- Keep the logo and Shubayr name. Remove the redundant `لوحة إدارة Shubayr` / `Shubayr Admin` line below them. Use a short login heading, retaining the calm visual identity.
- Approved Arabic heading: `تسجيل الدخول`. Supporting copy: `أدخل بيانات حسابك للوصول إلى لوحة الإدارة`. Use equivalent concise English copy (e.g., “Sign in” and “Enter your account details to access the admin dashboard.”).
- Add password show/hide. Apply VIS-006 borders/focus. Present the pre-login language label/icon as a light, clearly clickable control with comfortable target spacing.
- Replace the current “الصيغة غير صحيحة.” / “This isn't the right format.” and “هذا قصير جداً.” / “This is too short.” with state-specific messages:

| Condition | Arabic | English |
|---|---|---|
| Empty username | أدخل اسم المستخدم. | Enter your username. |
| Empty password | أدخل كلمة المرور. | Enter your password. |
| Rejected credentials after submission | اسم المستخدم أو كلمة المرور غير صحيحة. | Incorrect username or password. |
| Connection failure | تعذّر الاتصال. حاول مرة أخرى. | Unable to connect. Please try again. |

Show required-field messages beneath their respective fields. Show rejected credentials once inside the card without identifying which credential failed. For login, validate password presence rather than applying password-creation length rules; keep creation/change requirements in their appropriate flows. The rejection and connection-failure rows define required behavior; their current implementations were not observed.

**Acceptance criteria:**

- [ ] Empty fields produce the correct localized messages and no misleading format/length feedback.
- [ ] Credential rejection and connection failures are distinguishable and correctly presented.
- [ ] Password visibility, keyboard navigation, focused states, and submission-loading behavior work.
- [ ] Branding is not repetitive. Do not add the previously excluded password-recovery/support proposal as part of this item.

<a id="vis-019"></a>
### VIS-019 — Localize permission names and descriptions

**Scope / priority / status:** Permission-group creation/editing and all permission displays; Medium; approved, not implementation-verified.

**Problem and evidence:** An Arabic group-creation screen displays technical permission keys and English descriptions. [Permission group](<CleanShot/CleanShot 2026-10-22 at 9.07.36 PM.png>).

**Required solution:** Show readable names and descriptions in the interface language. English should also use human-readable names rather than raw keys as the primary labels.

| Internal key (unchanged) | Arabic display name | English display name |
|---|---|---|
| `orders.accept` | قبول الطلبات | Accept orders |
| `orders.view` | عرض الطلبات | View orders |
| `catalog.brands` | إدارة العلامات التجارية | Manage brands |
| `prices.change` | تغيير أسعار البيع | Change sale prices |

**Implementation guidance:** Centralize translations for names/descriptions. Check wording against actual permission scope and explain relevant constraints; do not collapse distinct permissions into vague identical labels. Search must include translated names/descriptions. Preserve stored permission keys, grants, and authorization logic: this is a presentation change.

**Acceptance criteria:**

- [ ] Every permission has a readable localized name and description in both languages.
- [ ] Arabic searches find the displayed Arabic terms.
- [ ] Switching language preserves selections and underlying permission identities.

## 6. Image upload and editing

### Binding image-processing rules

The later shared-editor decision refines the earlier automatic-crop requirement. For **individual uploads**, centered cropping is the starting position; the user's final zoom/pan selection is authoritative. For **bulk ZIP uploads**, the backend performs automatic centered cropping. Do not re-center an individually approved crop afterward.

Products/materials, categories, and brands require square files and previews. Other image slots, such as banners, use the same editor with their own required aspect ratio; they are not automatically made square.

<a id="vis-021"></a>
### VIS-021 — Central image editor and square brand images

**Scope / priority / status:** Every individual-image upload/replacement flow; excludes bulk ZIP; Medium; approved, not implementation-verified.

**Problem and evidence:** The new-brand dialog shows a tall, non-square image preview without visible zoom/pan controls. The reviewer requests the category editor's flexibility everywhere. [Brand image](<CleanShot/CleanShot 2026-10-22 at 9.13.15 PM.png>).

**Required solution:** One shared editor imported wherever images are selected or replaced, allowing users to select the visible image area before saving. Process each image individually when multiple images are selected.

**Implementation guidance:**

- Configure aspect ratio per destination: 1:1 for products, categories, and brands; preserve other slot requirements.
- Start centered. The Image size slider starts at its midpoint and supports real zoom-out and zoom-in, with −/+ endpoints. Preserve image proportions and prevent unintended blank crop areas.
- Allow horizontal and vertical dragging so users can reveal side/top/bottom details. Update the preview live. Provide crop confirmation and cancellation.
- Generate the actual output file matching the confirmed crop before individual upload. Brand output must have equal width and height; CSS-only clipping is insufficient. Never discard the user's pan/zoom by applying another centered crop.
- Use theme, localization, and dialog primitives from VIS-018/VIS-010. Explain the destination ratio and available adjustment near upload.
- Bulk ZIP processing remains the backend path in VIS-008, with no per-image interactive editor requirement.

**Acceptance criteria:**

- [ ] The same editor is used across relevant upload flows, including brand images.
- [ ] Side/top/bottom selections and zoom changes produce matching output pixels and previews.
- [ ] Slider movement changes scale in both directions without distortion or accidental blank areas.
- [ ] Square destinations produce square files; other destinations retain their required ratios.

**Implementation detail to resolve:** The centered starting scale and minimum scale must permit useful zoom-out while keeping the crop covered. Confirm the supported range against representative source aspect ratios; do not merely place the slider thumb in the middle while one direction does nothing.

<a id="vis-008"></a>
### VIS-008 — Product image output, bulk processing, and removal confirmation

**Scope / priority / status:** Product/material image creation, editing, and bulk ZIP upload; Medium; approved, not implementation-verified.

**Problem and evidence:** Product images have tall rectangular previews without a square-crop notice. Actual uploaded file dimensions were not inspected. The reviewer reports that image removal is committed only when the product is saved. [Product images](<CleanShot/CleanShot 2026-10-22 at 8.08.06 PM.png>), [bulk ZIP page](<CleanShot/CleanShot 2026-10-22 at 8.58.21 PM.png>).

**Required solution:** Square preview areas and actual square product image files, with processing appropriate to each upload path and clear pending-removal feedback.

**Individual upload:**

- Use VIS-021. Place reorder/delete controls below, outside the square preview area.
- Start with a centered crop, allow zoom/pan, and upload the exact approved square output. With no adjustments, remove excess equally from left/right for a landscape source or top/bottom for a portrait source. An already-square source needs no automatic crop, but editing remains available.
- Show the approved guidance near image selection, translated for English:

> تُحفظ صور المواد والمنتجات مربعة. يبدأ القص من المنتصف، ويمكنك تكبير الصورة أو تصغيرها وسحبها لتحديد الجزء الظاهر قبل اعتمادها.

Suggested English equivalent: “Product images are saved as squares. Cropping starts at the center; zoom and drag to choose the visible area before confirming.”

**Removing an uploaded image:**

| Element | Arabic | English |
|---|---|---|
| Title | حذف الصورة؟ | Delete image? |
| Message | هل تريد حذف هذه الصورة؟ لن يُطبّق الحذف فعلياً إلا بعد الضغط على «حفظ المنتج». | Do you want to delete this image? Deletion is applied only after you save the product. |
| Actions | إلغاء · تأكيد الحذف | Cancel · Confirm deletion |

Confirmation removes it from the preview and marks a pending change. It must not independently commit deletion. Apply removal only after a successful product save. Cancel/dismiss leaves the image unchanged.

**Bulk ZIP processing — backend:**

- Receive the ZIP, extract images, and map filenames to products/variants using the existing SKU convention.
- Center-crop every non-square source, removing equal excess from the longer dimension without stretching. Leave square sources uncropped.
- Save and associate **actual 1:1 output files** with the products; use those files in admin/mobile display. Do not substitute the original non-square image if processing fails.
- Identify failed images in the import result. Verify mapping and output dimensions for portrait, landscape, and square sources.
- Show near ZIP selection: `ستُقتص صور المنتجات غير المربعة تلقائياً من المنتصف لتصبح مربعة قبل حفظها.` English: “Non-square product images will be center-cropped automatically before saving.”

**Acceptance criteria:**

- [ ] Individual output dimensions and pixels match the user's confirmed square preview.
- [ ] Image-removal confirmation does not commit deletion until product save succeeds.
- [ ] Bulk images are square on disk/storage, correctly SKU-mapped, and failures are visible without non-square fallback.
- [ ] Each upload path explains its processing before upload; banners are outside this square-product rule.

<a id="vis-009"></a>
### VIS-009 — Square category previews and consistent editing

**Scope / priority / status:** Category creation/editing; Medium; approved, not implementation-verified.

**Problem and evidence:** Arabic preview is above English; the child-category preview crowds the English row. Image areas within cards do not appear consistently square. The crop slider is labeled Zoom and shown at an endpoint. Dragging is reported to work and must remain. [Preview layout](<CleanShot/CleanShot 2026-10-22 at 8.17.21 PM.png>), [crop editor](<CleanShot/CleanShot 2026-10-22 at 8.18.17 PM.png>).

**Required solution and implementation:** Use VIS-021 for editing and real 1:1 output. Show square image areas in every category preview. Put Arabic and English previews side by side at equal dimensions when space allows; stack only on narrow screens. Give the child-category preview its own clear space without displacing one language preview. Retain drag positioning, a centered initial Image size slider with real bidirectional scale adjustment, and the exact approved output. Use VIS-010 for the surrounding dialog.

**Acceptance criteria:**

- [ ] Both language previews align in one row at suitable widths; child preview does not disrupt them.
- [ ] Preview image areas and saved image files are square.
- [ ] Pan/zoom remain available through the shared editor; dialog actions remain visible.

## 7. Guidance, dates, and report export

<a id="vis-016"></a>
### VIS-016 — Contextual guidance and one store-timezone policy

**Scope / priority / status:** Helper text throughout the app; dates/times in all displays, filters, and reports; Medium; approved, not implementation-verified.

**Problem and evidence:** Orders shows a detached picking-list instruction and a technical note stating that the server currently uses UTC. The actual time-filter implementation was not inspected. [Page context](<CleanShot/CleanShot 2026-10-22 at 8.46.35 PM.png>), [both guidance texts visible](<CleanShot/CleanShot 2026-10-22 at 8.51.18 PM.png>).

**A. Required solution — guidance:** Attach concise, useful instructions to the action/field they explain. Audit similar text without assuming every page has the same problem.

- Review `حدّد طلبات قيد التجهيز لطباعة قوائم التقاطها معاً.` and place it with row-selection/bulk-printing controls, not as an orphan between filters and data.
- Confirm actual eligibility and workflow before final wording. Match the action's visible label; explain “picking list” briefly if needed as the items required to prepare orders.
- Do not invite selection of unavailable records in empty/ineligible states. Hide the instruction or explain the applicable state. Explain a disabled print action nearby; after selection, show selected count when appropriate.
- Remove redundant or unhelpful copy, keeping useful guidance near its target in both languages.

**B. Required solution — store timezone:** The **store's configured timezone** is authoritative for all displayed timestamps, date-filter boundaries, period calculations, and reports. Do not use device timezone, server timezone, or UTC as a substitute for user-facing business dates.

- Interpret From/To dates, start/end of day, Today, and This month in store time. Use the same basis for report grouping and totals.
- Remove `نطاق التاريخ بالتوقيت العالمي (UTC) كما يطبّقه الخادم حاليًا.` If clarification is useful, place `التواريخ والأوقات حسب توقيت المتجر` near date controls, with the configured zone name if needed. Otherwise omit redundant copy.
- Fix behavior, not merely text. Internal UTC storage may remain, with correct conversion at query/display boundaries and no alteration of recorded instants.
- Changing interface language must not change the store timezone. Read the configured store zone rather than inferring it from a screenshot or reviewer location.

**Acceptance criteria:**

- [ ] Guidance is tied to actionable controls and is appropriate to empty/ineligible/selected states.
- [ ] The same period selects matching records in the table and report, including around midnight and month boundaries.
- [ ] Displayed timestamps, filter boundaries, and export metadata consistently use store time in both languages.
- [ ] The server-oriented UTC note is removed or replaced with relevant store-time guidance.

<a id="vis-020"></a>
### VIS-020 — Add consistent PDF export to every report

**Scope / priority / status:** All report pages; Medium; approved, not implementation-verified.

**Problem and evidence:** Purchases shows CSV and XLSX export but no visible PDF action. Other report implementations have not been inspected. [Purchase report](<CleanShot/CleanShot 2026-10-22 at 9.09.09 PM.png>).

**Required solution:** A readable, shareable PDF with report identity, applied filters, export metadata, page numbers, and selectable portrait/landscape layout.

**Implementation guidance:**

1. Add Export PDF (`تصدير PDF`). Open an export dialog with Portrait (`طولي`) / Landscape (`عرضي`) options and Cancel/Export actions. Use VIS-010. Re-layout columns and pagination for the chosen orientation rather than simply rotating or shrinking unreadable content.
2. Header: Shubayr logo/name at a suitable size, report title, and an organized summary of **actually applied** filters, date range, and grouping. Use readable labels rather than technical IDs; wrap long filter values.
3. Place **Exported by: user name** beside **Export date/time** near the top metadata. Use store timezone (VIS-016). The timestamp represents file generation, not the time someone later physically prints the PDF.
4. Export all matching report results, relevant summaries, and totals, not only the currently visible table page. Preserve meaningful caveats, such as an open accounting period whose totals can still change.
5. Footer: localized Page X of Y in a reserved area on every page. Repeat table column headings on subsequent pages; use a compact report header if needed, keeping full filters/metadata on the first page.
6. Wrap cell text and increase row height. Handle page breaks without lost content or overlap with headers/footers. Keep margins and type readable. Support Arabic shaping/RTL, English/LTR, mixed strings, and consistent numeric/currency formatting.
7. Reuse a central PDF report template receiving report title, filters, metadata, and data. Determine generation ownership from the existing architecture; no specific PDF library or backend framework is mandated.

**Acceptance criteria:**

- [ ] Every report exposes the shared export workflow and respects the selected orientation.
- [ ] PDF filters/totals match the applied report state and complete filtered dataset.
- [ ] Logo/title/user/export time/page numbers are present, readable, and correctly localized.
- [ ] Long text, many columns, and multi-page output remain readable and uncut in both languages and orientations.

## 8. Purchase-invoice entry and product search

<a id="vis-022"></a>
### VIS-022 — Replace repeated purchase-line forms with one editor and a compact list

**Scope / priority / status:** Purchase-invoice product entry and draft editing; Medium; approved, not implementation-verified.

**Problem and evidence:** Each invoice line repeats a full set of input fields, including an empty line, consuming substantial vertical space. The labels `الأسطر` and `الصنف` are inconsistent with the preferred product terminology. The reviewer also reports immediate removal when the delete icon is clicked; the exact draft-persistence behavior has not been inspected. [Purchase-invoice entry](<CleanShot/CleanShot 2026-10-22 at 9.29.46 PM.png>).

**Required solution:** One product-entry editor above a compact invoice-products table. Adding a product creates a summary row; editing reloads that same row into the shared editor. Removal requires confirmation identifying the selected product.

**Approved terminology:** Use “product” consistently in this workflow. The selector chooses a product/variant, not merely a free-text name.

| UI element | Arabic | English |
|---|---|---|
| Section currently labeled `الأسطر` | منتجات الفاتورة | Invoice products |
| Editor in add mode | إضافة منتج إلى الفاتورة | Add product to invoice |
| Field currently labeled `الصنف` | المنتج | Product |
| Search placeholder | ابحث باسم المنتج أو رمز SKU | Search by product name or SKU |
| Add action | إضافة إلى الفاتورة | Add to invoice |
| Editor in edit mode | تعديل منتج الفاتورة | Edit invoice product |
| Save edited row | حفظ التعديلات | Save changes |
| Cancel editing | إلغاء التعديل | Cancel editing |
| Row actions | تعديل · إزالة | Edit · Remove |

**A. Single editor and add behavior:**

- Include the existing product/variant, quantity in packs, pack size, pack cost, location, batch number, and optional expiry fields. Preserve applicable units, validation, and current business rules.
- Add the explicit Add to invoice action. Validate the editor before inserting a row; show errors beside the relevant fields and do not create incomplete rows.
- After a successful addition, show the new product in the table and return the editor to a clean add state ready for the next product. Do not append another full blank form to the table.
- Product results show the name, distinguishing variant attributes, and SKU so similar variants can be selected confidently; search behavior is addressed in VIS-023.

**B. Compact invoice-products list:**

Use one logical row per added invoice product. The row may contain two lines or grouped card-like details within cells; it must not become another permanently expanded input form.

| Information group | Content |
|---|---|
| Product identity | Product name, relevant variant attributes, SKU |
| Quantity and cost | Quantity, pack size, pack cost, line total |
| Derived details | Base quantity, base-unit cost, allocated landed costs, landed unit cost |
| Receiving details | Location, batch number, expiry date when present |
| Actions | Edit and Remove |

Group related values rather than forcing every value into a separate narrow column. Wrap text with clear labels and readable typography. Apply the shared table/theme/alignment requirements in VIS-011, VIS-012 where pagination is needed, and VIS-018; apply VIS-007 to suitable numeric inputs.

**C. Edit behavior:**

- Edit loads the selected row into the top editor, changes the editor heading and primary action to the approved edit labels, and exposes Cancel editing.
- Visually identify the row being edited and bring the editor into view when necessary.
- Save changes updates that row in place; it must not append a duplicate. Cancel editing leaves the previous row values intact.
- Do not silently replace unsaved editor input when another row is selected for editing. Provide a clear opportunity to retain or discard those edits before switching.

**D. Removal confirmation:**

| Element | Arabic | English |
|---|---|---|
| Title | إزالة المنتج من الفاتورة؟ | Remove product from invoice? |
| Message | هل تريد إزالة «اسم المنتج» من هذه الفاتورة؟ | Do you want to remove “product name” from this invoice? |
| Actions | إلغاء · إزالة المنتج | Cancel · Remove product |

Substitute the actual product name and enough variant context to identify the row. Cancel or dismissal leaves the row unchanged. Confirm removes the invoice entry, not the product from the catalog. Verify the actual autosave/draft behavior before stating when removal is persisted; do not reuse the product-image claim that removal waits for Save product unless the invoice workflow truly behaves that way.

**E. Preserve invoice semantics:**

- Do not automatically merge repeated products: entries can legitimately differ by batch, location, or cost.
- Recalculate line totals, invoice totals, and landed-cost allocation after add/edit/remove according to existing calculation rules. Do not alter financial formulas as part of a layout change.
- Adding or editing an invoice entry is distinct from reviewing/posting the invoice. Preserve the existing draft/review/posting workflow; a row action must not itself post the invoice or update inventory.

**Acceptance criteria:**

- [ ] Only one product editor is shown, above the list; blank repeated line forms are eliminated.
- [ ] Add creates one valid summary row and prepares the editor for the next product; invalid input creates no row.
- [ ] Edit updates the same row, Cancel preserves it, and switching rows does not silently lose editor input.
- [ ] Summary rows expose the existing input and derived data clearly without tiny text or excessive height.
- [ ] Removal identifies the correct product, requires confirmation, and leaves catalog records intact.
- [ ] Duplicate products with different line details remain distinct; totals and cost allocation update correctly.
- [ ] Terminology is consistent in both languages, and row operations remain separate from invoice posting.

<a id="vis-023"></a>
### VIS-023 — Make purchase-invoice product search work with Arabic names

**Scope / priority / status:** Product/variant search in purchase-invoice entry; Medium; approved, root cause unresolved.

**Problem and evidence:** The reviewer reports that searching with an Arabic product name does not return the expected product. The screenshot shows a no-match state in a product-entry field, but it does not establish which product should match or why it is excluded. [Purchase-invoice search context](<CleanShot/CleanShot 2026-10-22 at 9.29.46 PM.png>).

**Required solution:** Search by Arabic name, English name, or SKU and return clearly identifiable eligible products/variants. Use the Product label and search placeholder specified in VIS-022.

**Implementation guidance:**

- Reproduce with a known existing product and verify purchasing eligibility and active filters before concluding that language alone causes the failure.
- Check that the query actually searches the Arabic-name field and that frontend query handling and the search/API implementation agree.
- Review whitespace, Arabic diacritics, and relevant letter-form handling where needed. Choose normalization appropriate to the actual search requirements; do not change stored product names or collapse distinct identifiers as a side effect.
- Show product name, variant attributes, and SKU in results. Selection must bind the correct product/variant identity to the invoice editor.
- Distinguish no matches from loading/search failure. Use `لا توجد منتجات مطابقة` / “No matching products” only for a successful query with no matches; show an appropriate localized error when results cannot be loaded.
- Do not bypass eligibility rules or unrelated filters merely to make a product appear; explain any valid exclusion when appropriate to the workflow.

**Acceptance criteria:**

- [ ] A known eligible product can be found by its Arabic name, English name, and SKU.
- [ ] Relevant whitespace/Arabic-text cases are verified against the agreed matching behavior.
- [ ] Similar variants remain distinguishable and selection uses the correct identifier.
- [ ] Successful empty results and failed queries show different, correctly localized states.
- [ ] The diagnosed cause and any legitimate filtering exclusions are documented rather than assumed.

## 9. Open decision retained from the discussion

### Trial-balance date wording and default dates — not part of the approved findings

The reviewer identified the label `كما في تاريخ` and an empty date input on Trial balance, then suggested today's date as a default for all date fields. A narrower alternative was proposed, but the final defaulting scope was not confirmed before the review moved on. Preserve this request for a decision; do not silently treat a blanket default as approved.

**Evidence:** [Trial balance date field](<CleanShot/CleanShot 2026-10-22 at 9.03.38 PM.png>).

**Proposed wording:** Label `تاريخ التقرير` (“Report date”); description `أرصدة الحسابات بالعملة الأساسية حتى التاريخ المحدد. للاطلاع فقط.` (“Account balances in the base currency through the selected date. Read-only.”). Confirm that this accurately describes the report cutoff semantics.

**Proposed defaulting policy to confirm:**

- Use today in the store timezone for a new report/transaction date where appropriate.
- Preserve existing stored dates when editing records.
- Choose date-range defaults by report purpose; setting both endpoints to today could hide older records.
- Do not automatically set due dates, expiry dates, or optional dates to today when that would imply false information.

**Decision needed:** Approve the context-aware policy or explicitly define alternatives per field category before changing defaults globally. The store-timezone rule in VIS-016 is already approved regardless of this decision.

## 10. Implementation handoff and completion evidence

Use this brief as a scoped backlog, not as proof of diagnosed defects or completed fixes.

1. Map each ID to existing components/routes/services after repository inspection. Record uncertain behavior and reproduce user-reported failures before assigning a root cause.
2. Implement shared foundations first, then migrate consumers. Keep the image-processing distinction, store-timezone policy, and permission identifiers consistent across frontend/backend boundaries.
3. Validate representative instances and every affected shared-component consumer. Include Arabic/English, wide/narrow screens, long/empty data, keyboard interaction, and state transitions relevant to each finding.
4. For each completed ID, report changed areas, verification performed, screenshots or output evidence where useful, and any unresolved limitation. Do not mark an ID complete solely because code was changed.
5. Treat production data from the review as real data until the owner identifies otherwise. This document supplies no authorization for deployment, production cleanup, database migrations, access changes, or reboots; follow the environment's approval requirements for those actions.

### Consistency checks that must not be lost during implementation

- Authenticated language control moves to account settings; the login language control remains.
- Three separate patterns exist: dialog action footer (VIS-010), page action footer (VIS-013), and table pagination footer (VIS-012).
- Product/category/brand image files are square. Individual crop positioning is user-controlled; bulk ZIP cropping is backend-centered. Other image slots retain their own ratios.
- UTC may remain an internal storage representation; store time governs displayed dates, filters, reports, and export metadata.
- Permission localization does not change permission keys or grants.
- Theme consolidation does not flatten every text role to one size.
- Purchase-invoice row edits/removals preserve draft and posting semantics; do not apply product-image save timing to invoices without checking their actual persistence behavior.
- Do not reintroduce the excluded login password-recovery/support suggestion or treat the unconfirmed global date default as approved.

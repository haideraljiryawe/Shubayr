# Category and product media — Mock implementation / contract gaps

> Historical record of the former Mobile admin-media prototype. Mobile now
> targets API 11 and has no photo-selection workflow. C22 removed the unused
> `image_picker` dependency and iOS photo-library permission description; the
> implementation and dependency references below describe that earlier phase.

Scope: category metadata, category icons/photos and product photo management only.
Contract inspected: repository-root `api/openapi.yaml` (unchanged), specifically
`Category`, `CategoryInput`, `Product`, `ProductInput`, `GET /categories` and the
existing admin category/product create and patch operations. No backend code or
other project was changed.

## Closure verification — 2026-09-14

Ahmed completed the manual visual review and accepted this phase. The earlier
handoff/checklist sections below record the implementation rounds; final visual
acceptance is no longer pending.

- Full suite: `flutter test --dart-define=DATA_SOURCE=mock --reporter expanded`
  completed with **856 tests passed** and no failures.
- `flutter analyze`: **No issues found**. Formatting of all changed Dart files and
  `git diff --check` passed.
- The first full run exposed six outdated expectations in two existing test files:
  Home's explicitly selected furniture icon, and the product toolbar's wrapped Add
  action after category filters were added. Only these task-related test
  expectations were updated; no application cleanup or extra UI changes were made.
- Scope review confirms all task changes stay within `mobile/`; external task
  documents were not added. Backend/OpenAPI and deferred media persistence remain
  unchanged. No team updates were pulled or merged during closure.

## What Mobile / Mock implements

- Categories remain repository data, editable by the store owner. Fixture category
  names are initial Mock content, not a fixed taxonomy or icon selection rule.
- Existing `name_ar` / `name_en`, `parent_id`, `sort_order`, `is_active` and child
  relationships remain. Main categories additionally carry required bilingual
  short descriptions. Both levels carry a semantic `iconKey` and independent image.
- Mock-only map keys are explicitly named `mock_description_ar/en`, `mock_icon_key`,
  `mock_image`, `mock_image_managed`, and product `mock_images`. They are in-memory
  adapter details, **not proposed API field names**. `fromMock` / `toMock` preserve
  them; `fromJson` / `toJson` continue using the existing contract only.
- `CatalogImage` has distinct `UrlCatalogImage` and `LocalCatalogImage` variants.
  The latter owns selected file bytes and a filename, never a local-path URL.
  Product `images` remains the contract's URL list; optional `mockImages` is the
  complete ordered display selection (including retained URL images). Null means
  use legacy URLs; an empty list means deliberately remove all images.
- Selection uses `image_picker 1.2.3`, resolved as the newest compatible stable
  version with Flutter 3.47.4 / Dart 3.13.3. Category selection is single-image;
  product selection supports multiple images. Add, replace, remove and move
  earlier/later preserve the draft and image order. Cancel/errors leave it intact.
- The source is the device library/file selector. No camera workflow or camera /
  microphone permissions. iOS has the required photo-library usage description;
  `requestFullMetadata: false` avoids requesting unnecessary metadata access.
- **Session-only:** selected bytes and catalog edits live in the current Mock
  process. They are not written to preferences, secure storage, or a file store.
  Restart, hot restart, process death (including Android killing the app while a
  picker is open), or browser refresh can discard them. There is no restoration
  promise, media server, upload simulation or durable local-media migration.
- Explicitly managed category images override Picsum. Removing one shows a neutral
  image placeholder. Picsum is limited to legacy Mock categories without managed
  image data; it is not used for Remote categories or newly created categories.
- Home uses semantic keys resolved to Material glyphs (filled where available).
  Main category cards use photos + localized name + description. Subcategory tiles
  keep icons + name; their stored photos are available for later uses.
- Admin reads include hidden nodes. Customer category discovery recursively removes
  inactive parents and their descendants without changing child flags or deleting
  products. All three customer surfaces share explicit `sortOrder`, with ID as a
  deterministic tie-breaker; Mock mutation rebuilds the tree in that order.
- Remote rejects any input containing Mock extension keys before making HTTP calls.
  Its photo area previews existing URLs and states that upload awaits backend
  support. No unsupported remote persistence is represented as successful.

## Backend contract gap table

| Feature | Mobile/Mock behavior | Current OpenAPI support | Missing Backend capability | Proposed contract direction |
| --- | --- | --- | --- | --- |
| Main category short description + localization | Required Arabic and English values on create/edit; rendered under the localized name | Only `name_ar`, `name_en`; no category description | Localized description reads, writes, required validation and errors | Follow existing paired `_ar` / `_en` naming and name fallback conventions; agree actual field names with backend; require both for roots |
| Main category image | Independent single photo, used by CategoryCard | No category image property | Durable media association and readable image representation | Align with existing `image_url`/URI conventions or a shared media reference agreed by backend |
| Subcategory image | Same independent photo storage, tile remains icon-based | Shared Category schema has no image | Image association at any category level | Use the same representation as main categories, nullable for no image |
| Semantic `icon_key` for both levels | 116 owned keys resolve through one Material catalog | Nullable string `icon` exists, semantics unspecified | Agreement on stable semantic vocabulary and unknown-key behavior | Clarify whether current `icon` can carry owned keys or introduce a dedicated snake_case field; do not store Flutter glyph codes |
| Visibility | Uses existing `is_active`; effective visibility propagates through ancestors without editing child flags | `is_active` on reads/writes; public tree behavior is unspecified | Explicit discovery filtering plus an authorized management read that includes hidden nodes | Retain `is_active`; document ancestor semantics and ensure a management read can retrieve hidden records (no new route invented here) |
| Display order | Uses existing integer `sort_order` on both levels, explicit sorting in Home/categories/subcategories | `sort_order` exists; tree ordering and tie behavior unspecified | Defined ordering guarantee for siblings | Retain `sort_order`, define ascending order and deterministic tie behavior |
| Category image upload/change/remove | Device selection, replacement, removal and preview in-session | No upload endpoint or image write field | Upload lifecycle, association replacement and disassociation semantics | Define media upload response and category association separately; agree null/clear semantics and cleanup responsibility |
| Product image upload | Selected local bytes render in card, details and zoom gallery | `Product.images` / `ProductInput.images` are arrays of URI strings; no upload | Conversion of selected files into durable backend media references | Upload returns a durable representation usable by the existing URL gallery or an agreed media DTO |
| Multiple product images | Multi-selection and mixed legacy URL/local display list | URI arrays on read and write already support multiple references | File-upload support; validation limits and media metadata rules | Preserve array semantics; document accepted formats, count/size limits and returned URLs/references |
| Product add/remove/replace images | Modify the complete Mock display list; empty list intentionally clears it | Existing product patch accepts `images` | Explicit array replacement/empty-list semantics and uploaded-asset lifecycle | Specify whether PATCH replaces the image list, how clearing works and who owns unused-asset cleanup; avoid assuming independent image endpoints |
| Product image ordering / primary | Explicit “Make primary” moves the image to index 0; the first image is always primary; confirmed removal promotes the first remaining image; gallery retains all remaining images | Arrays have sequence, but primary-image and persistence guarantees are not stated | Preservation of submitted order; one agreed primary rule; order in every read response and after removal | Prefer persisted ordered list with first = primary; do not introduce a separate flag/ID unless backend has a concrete need |
| Image constraints / processing | Product guidance is square 1:1; main category crop is responsive; no invented byte/resolution limit | No supported file dimensions, byte limits, formats, variants or crop policy specified | Real upload validation limits, structured errors, original/variant policy and processing ownership | Agree limits and validation errors in the media contract; guidance is not a new mandatory server aspect ratio |
| Product category scope + management reads | Main scope includes descendant products in Mock; child scope, search and pagination compose; archived products disappear while hidden ones stay manageable | GET /products has category_id and q with pagination; descendant semantics and management visibility guarantees are unspecified | Define exact-category versus subtree filtering, total/page consistency and authorized access to hidden products/categories | Reuse existing category identity; agree subtree and admin-read semantics without inventing query fields or routes |

## Icon catalog and description limits

`lib/features/catalog/presentation/widgets/category_icon_catalog.dart` contains
116 entries in 20 groups: electronics, phones, computers, audio, cameras, gaming,
fashion, accessories, home/furniture, kitchen, cleaning, food/grocery, drinks,
health/beauty, sport, kids, auto, books/stationery, pets/garden/tools, gifts/general.
Every entry has a stable semantic key, Material glyph, group, and Arabic/English
search terms. Visible labels use the existing ARBs. Search handles Arabic diacritics
and alef variants; group filtering combines with search. The picker uses a lazy
`GridView.builder`, selected preview and selected state. Unknown keys resolve to
`Icons.category`. Existing explicit legacy `icon` tokens remain compatible; an
explicit semantic key always takes precedence over any legacy fallback.

`lib/features/catalog/data/category_description_limits.dart` defines **6 words and
36 Unicode code points** after edge trimming (internal whitespace counts toward
characters). Both limits apply independently to both language values. Blank or
whitespace-only content is invalid. Subcategories do not require descriptions.

At 320 logical pixels, existing 8px page insets leave 304px; the unchanged 0.42
image fraction leaves 176.32px for text before 32px inner padding, or **144.32px**.
Cairo `bodySmall` remains 12px / weight 600 / line-height 1.45, giving 34.8px for
two description lines. The chosen conservative limits support brief Arabic and
English phrases at this width; targeted TextPainter checks use the bundled font.
Word/character limits cannot guarantee exact wrapping for arbitrary glyphs or text
scaling, so the existing `maxLines: 2` and ellipsis remain as rendering safeguards.
No calibrated card dimensions, image fraction or typography were changed.

## Refinement decisions (2026-09-13)

### Primary image and image-only confirmation

The existing URL array already used its first entry for single-image presentation.
The ordered display list now makes this rule explicit with `primaryDisplayImage`:
“Make primary” moves that image to index zero, preserving the relative order of the
others. No `isPrimary`, duplicate primary flag, or temporary media ID is introduced.
Moving images earlier/later also updates the primary; replacing index zero retains
that role. Empty selection has no primary. `primaryImage` remains URL-only and
returns the effective first URL, or null for a local primary, never a fabricated
URL or an unrelated legacy image. Contract `images` still contains URLs only.

The shared editor uses the existing AlertDialog pattern for image removal at both
category levels and for products. Copy explicitly keeps the category/product;
primary removal explains automatic promotion. Cancel/back leaves the draft intact.
Confirmation changes the draft only; Save persists the edit within this Mock
session. The save action is blocked while selection or confirmation is pending.

### Guidance derived from current rendering

| Surface | Existing geometry | Admin guidance / consequences |
| --- | --- | --- |
| Product card | `AspectRatio(1)` | Prefer a square (1:1) image with a clear original for zoom |
| Product detail gallery | `_ratio = 1.0`; full-screen zoom starts contained | Same 1:1 recommendation; all images remain available; non-square originals retain proportions |
| Main category card | Image width = `0.42 × card width`; height is at least 100 logical px and grows with text | Prefer landscape artwork with the subject centered; there is no single fixed crop ratio across phone and desktop |
| Subcategory tile | Icon and name, no photo slot | No photo aspect ratio imposed; the independently selected photo is retained in this session for later uses |

At a 320px viewport, the current page insets leave a 304px card: its image width is
127.68px. With the minimum 100px height the slot is about **1.28:1**. At 390px the
same calculation gives 157.08px, about **1.57:1**. At 1920px, 16px side insets leave
1888px, so the image can be 792.96px wide, about **7.93:1** at minimum height. These
are examples at minimum height, not guaranteed ratios: long names/descriptions or
larger text increase height. No calibrated card dimensions were changed.

A fixed recommended pixel resolution cannot responsibly cover all these widths,
device pixel ratios, and full-screen zoom. No numeric resolution or maximum file
size is therefore claimed. Current display uses `BoxFit.cover` (proportional scaling
and edge crop), and full-screen zoom starts contained; it never stretches one axis.
The existing square admin thumbnail is a selection preview, not an exact preview
of the responsive category crop. A future crop preview should preserve proportions
and preview the actual target (including narrow/wide category slots), with agreed
crop/focal-point metadata if needed. No crop/resize dependency was added.

Flutter owns device selection, draft ordering/primary choice, removal confirmation,
preview and proportional rendering, and presenting contract-defined validation
errors. The Backend/Media pipeline should own durable upload/association, real
format/byte/dimension limits, original retention, orientation/metadata policy,
optimized variants/compression and delivery, and unused-asset cleanup. Cropping or
optimization must not become a temporary local storage/media architecture.

### Hierarchical administration and product scope

- Category management uses a lazy main list plus the selected branch. Wide windows
  show both panes; narrow windows show one with a back action. The split follows
  the shared 900px breakpoint adjusted for text scaling. All category records are
  loaded before grouping so a later-page child is not presented as an unrelated
  root. Children remain grouped under the selected parent, including hidden nodes.
- Each main/child card shows the existing numeric display order; sibling ordering
  stays ascending `sort_order` with the existing deterministic ID tie-breaker.
- “Add main category” opens the existing form with parent null, without a parent
  dropdown. “Add subcategory” from the branch sets the parent explicitly and shows
  that context. Main-category editing also hides the parent control. Subcategory editing retains the existing reparenting control/cycle protection.
  Form category choices use hierarchy paths to disambiguate repeated child names.
- Products keep the existing route and paginated list. Two responsive main/child
  selectors establish scope; a visible path describes it. Whole-category scope
  includes descendants in Mock. Search combines with the scope in the repository
  before page slicing, without downloading every product for client-side filters.
  “All products” is always available; “Search all products” clears scope and retains
  the typed search. New product forms inherit the selected subcategory as a default; a main-category scope requires choosing a subcategory.
- Product deletion already archived the Mock record and refreshed its provider,
  but `fetch` returned archived records again. It now excludes archived products
  before search, scope and pagination totals. Hidden products remain manageable;
  archive semantics and the existing confirmation/CRUD flow remain unchanged.

No new category operation endpoint is needed merely for grouping or separate create
buttons: the current parent_id/create/edit operations express those actions. The
real gaps are complete management reads (including hidden records) and defined
subtree/filter/order semantics. Remote filtering uses only the existing category_id,
q and pagination parameters; it does not assume an undocumented descendant flag.
Mock subtree behavior is not a claim about future Remote results.

Known local-photo visibility/restart issues are intentionally deferred. Cart/order
snapshots still accept URL strings and do not render session bytes; no such UI,
authentication, persistence, upload or server work was added in this refinement.

## Additional visual-review refinements

- Product Add/Edit uses Flutter's existing SafeArea pattern at the bottom of the
  shared form, plus the existing `AppLayout.pageInsets` spacing (16 logical px).
  Device insets are respected without a fixed compensation gap or duplicate
  keyboard padding. Other resource forms keep their existing spacing.
- New product assignments offer subcategories only, labeled by the full category
  path. A main-category browsing scope does not preselect a valid assignment.
  An existing product assigned directly to a root retains that reference on
  unrelated saves: its current category is displayed as a disabled retained
  option with explanatory copy. Choosing a subcategory removes that legacy option.
  No migration or repository/API rule was added. Whether the future Backend allows
  direct root assignment remains explicitly undecided for reconciliation.
- Main-category Add/Edit never exposes the parent field. Contextual child creation
  continues to set its known parent; existing child editing is preserved.
- Main cards use an extra `AppSpacing.md` gap so separate groups are easier to scan;
  wide layouts also use a theme-controlled VerticalDivider between the main list
  and selected branch. The hierarchy and responsive composition stay the same.
- Card surfaces no longer open branches. The explicit action is “عرض الفروع” /
  “View subcategories”; Edit and Delete retain their separate actions.

Latest visual-review refinement verification (2026-09-13): **112 targeted tests
passed**, including 26 new tests for the restricted product picker, retained legacy
assignment, main/child forms, explicit branch actions, and bottom safe-area behavior
with/without device insets and keyboard. `flutter analyze` reports no issues;
formatting and `git diff --check` pass. No full suite or simulator was run.

Latest focused command (from `mobile/`):

```sh
flutter test --dart-define=DATA_SOURCE=mock \
  test/features/admin/admin_visual_refinement_test.dart \
  test/features/admin/admin_screen_test.dart \
  test/features/admin/category_media_widgets_test.dart \
  test/features/admin/category_media_refinement_widgets_test.dart
flutter analyze
```

For this visual pass, check product Add/Edit Save spacing on a device with a bottom
system inset, including keyboard open/closed; subcategory-only options and retained
legacy root assignment; absence of a parent field in main Add/Edit; group separation;
and that only “View subcategories” opens branches while card-surface taps do not.

## Technical verification and visual handoff

Focused tests cover model and repository behavior, contract isolation, image editor
cancel/failure and save retry, picker search/groups/selection, the customer surfaces,
local-image gallery zoom, and RTL/LTR + light/dark + responsive widths around
600/900/1200/1536 and at 320/1920. Test pickers return real PNG bytes without invoking
the OS UI. Native library/file selection and platform permission UI require the
final visual review. No full test suite or Simulator/Emulator is run automatically.

Refinement final technical results (2026-09-13):

- **227 targeted tests passed** across the command below, including 36 new
  refinement tests. Coverage includes primary selection/fallback/removal,
  category creation intent and hierarchy, display order, complete-tree reads,
  scoped search/pagination/global search, immediate disappearance after product
  archive, image-only confirmations, and loading/error/empty states.
- The new layout checks cover Arabic/English, large text, light/dark combinations,
  phone/tablet/desktop widths and both sides of the relevant shared breakpoints.
- `flutter analyze`: **No issues found**. Dart formatting and `git diff --check`
  pass. All changes remain inside `mobile/`. No full suite, native simulator,
  commit, push, Backend/OpenAPI change or new dependency in this refinement.
- Native picker use and final visual acceptance remain Ahmed's manual check.

Initial implementation technical results (before refinement, 2026-09-13):

- **191 targeted tests passed**, across the three new admin media test files and
  existing admin repository/form/controller, categories, Home, gallery/stream,
  product detail, category scope and product grid tests. The complete Flutter
  test suite was not run.
- `flutter analyze`: **No issues found**.
- Changed Dart files: formatting verified with no remaining changes;
  `git diff --check` passed. All tracked changes are inside `mobile/`.
- `pod install` succeeded and the lockfile adds `image_picker_ios`; existing pods
  retain their locked versions. CocoaPods reported the existing custom Profile
  configuration warning: Profile references `Flutter/Release.xcconfig`, which
  includes the release Pods configuration. This configuration was left unchanged;
  native build/runtime verification is pending the visual review.
- No Simulator/Emulator was launched, no commit or push was made, and the external
  task-reference document was not copied into the repository.

Focused command (run from `mobile/`):

```sh
flutter test --dart-define=DATA_SOURCE=mock \
  test/features/admin/category_media_refinement_test.dart \
  test/features/admin/category_media_refinement_widgets_test.dart \
  test/features/admin/category_media_repository_test.dart \
  test/features/admin/category_media_widgets_test.dart \
  test/features/admin/store_image_picker_test.dart \
  test/features/admin/admin_repository_test.dart \
  test/features/admin/admin_screen_test.dart \
  test/features/admin/admin_controller_test.dart \
  test/features/catalog/categories_screen_test.dart \
  test/features/catalog/home_screen_test.dart \
  test/features/catalog/product_gallery_test.dart \
  test/features/catalog/product_gallery_stream_test.dart \
  test/features/catalog/product_detail_test.dart \
  test/features/catalog/catalog_category_scope_test.dart \
  test/features/catalog/product_grid_test.dart
flutter analyze
```

Manual refinement review after launching `flutter run --dart-define=DATA_SOURCE=mock`
from `mobile/`, signing in with the existing Mock staff account, and opening store
management:

1. Categories: “Add main category” has explicit intent with no parent dropdown.
   Open a main category, then “Add subcategory”; check the prefilled parent context,
   child grouping and displayed order on both levels. Edit/reorder/hide a child;
   confirm the selected branch updates and hidden records remain manageable.
2. Product edit: select several library/files images, use “Make primary”, reorder,
   save and reopen. Check the primary marker, product card and complete gallery.
   Remove the primary: cancel first (unchanged), then confirm (first remaining
   becomes primary). Remove the last image and check the empty placeholder.
3. Main/child image edit: read the different guidance; cancel then confirm removal.
   Only the photo draft changes; the category remains. Save/reopen within the same
   running Mock session. Non-square images must crop proportionally without stretch.
4. Products: choose a main category and then a child; confirm the visible scope,
   combined search and results. “Search all products” must retain the typed query
   and include matches from other categories. Add should preselect the current subcategory; a main scope requires
   choosing a subcategory. Confirm product deletion and verify it disappears immediately, even
   after refreshing or switching to All products.
5. Repeat representative interactions in Arabic/English and light/dark, at a
   narrow phone width and a wide desktop window, with larger text. The hierarchy
   changes from one pane/back action to two panes, with no clipping or overflow.
   Check actual OS picker selection/cancellation and dialog scrolling.

Do not use logout/restart as a persistence acceptance test: local images and Mock
edits remain session-only and are not guaranteed to survive restart. Known local
image visibility limitations in other customer views are outside this refinement.

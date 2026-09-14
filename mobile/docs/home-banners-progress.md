# R3 — Customer home banners

Implemented and refined to an image carousel on 2026-09-11; final visual/interactive acceptance is pending.
Scope: `mobile/`, guest/customer home only. Admin banner management remains a
separate unimplemented phase-3 task. No API contract changes, commit or push.

## Contract and data

- `BannerRepositoryRemote` reads the public `GET /banners` array, with no
  pagination or language query. It preserves the server's returned order.
- `HomeBanner` maps the existing `Banner` fields: title, nullable subtitle,
  image URL, nullable CTA/link, display order, active state, optional start/end
  and creation timestamp. No localized content fields or internal action IDs
  were invented. Missing/null titles now normalize to an empty string so an
  image-only banner can render; no other model/repository semantics changed.
  Campaign copy is shown as supplied in either app locale;
  navigation controls and failure feedback use Arabic/English localization.
- Mock reads evaluate `is_active` and the current clock on every load/refresh.
  Missing bounds are open; start/end instants are inclusive, and timestamp
  offsets compare as instants. Results sort by `sort_order ASC`; ties retain
  fixture order because the contract specifies no additional tie-breaker.
- Default mock fixtures include two visible banners plus disabled, future and
  expired examples. “تسوّق واكتشف العروض” comes first. Tapping its image deliberately opens
  `https://example.com/`, a demo destination, not the product-offers route.
  Images are demo network images with a loading skeleton and failure fallback.
- Scheduling is evaluated when the list is fetched, not by background polling
  or automatic expiry while the screen is idle. Remote scheduling remains the
  server's responsibility.

## Image carousel and refresh

- Home banners fill their own inset rounded rectangle, not the screen edges,
  with `BoxFit.cover` (crop to fill, never stretch). No white card, CTA button,
  visible text counter or previous/next arrows remain. Title/subtitle overlay
  the top-start corner (right in RTL, left in LTR), using existing typography.
  A dark gradient from the semantic `imageScrim` token and `onDark` text keeps
  copy readable over images and loading/failure placeholders.
- `AppLayout.homeBannerAspectRatio` uses 2.25:1 for phone-size artwork and
  interpolates smoothly to 4.5:1 between the shared tablet/desktop width
  thresholds. There is no fixed minimum banner height. At 390 px, the image is
  about 159 px high instead of 320 px; at 1920 px it is 320 px high. The existing
  1440 detail-width constraint applies to each image, not the carousel viewport.
  Copy is measured at the current width/text scale, increasing the common slide
  height only when necessary to avoid clipping. Text sizes, gradient and crop
  behavior remain unchanged. The loading skeleton matches the new
  image-only area. The department heading is removed from Home only, with an
  `AppSpacing.sm` gap before department chips. Filtering, products and bottom
  navigation are unchanged.
- The `PageView` spans the full viewport with `viewportFraction: 1.0`. Each
  full-width page owns its horizontal `AppSpacing.screenH` padding, content width
  constraint and rounded image clip. Only screen edges clip the moving pages;
  adjacent banners appear during dragging, with no permanent neighbor peek.
- Flutter SDK `PageView`/`PageController` provide horizontal swiping. For two or
  more banners, the finite page list has a duplicate last image before the first
  real page and a duplicate first image after the last. Once scrolling settles,
  the controller jumps to the identical real page after the frame; users can
  continue in either direction without seeing a boundary. No carousel package.
- A tiny centered indicator sits directly below the image: the active short pill
  uses the brand `primary` token; inactive shorter marks use reduced opacity.
  `onPageChanged` updates logical selection during a drag, including sentinel
  pages, without waiting for release. The semantic counter is still available
  without visible text. The indicator is separate from the image action area.
  One banner has no indicator or active paging; zero banners hide the section.
- A cancellable one-shot timer advances with `AppMotion.slow`/`standard` after
  five idle seconds. Touch/pointer down and scrolling cancel it; release/cancel
  and settled scrolling restart a full idle interval. Autoplay cannot compete
  with an active drag. Mouse hovering and keyboard focus pause it, as do app
  backgrounding, an inactive route and disabled ticker mode. Mouse dragging,
  trackpad scrolling and direction-aware left/right keyboard keys are supported
  locally by the carousel without changing global scroll behavior.
- `dispose` cancels the timer and releases the controller/observer. No periodic
  callback or unawaited animation completion chain is used. List ID/order changes
  replace the controller at the selected ID (or first item if removed), dispose
  the old controller after detachment, and ignore obsolete scroll notifications
  by generation. This also handles refresh during an animation and 0/1/many
  transitions. Content-only refresh retains the controller/page.
- Pull-to-refresh still reloads banners and products independently. Existing
  banners remain visible while refreshing; stale responses cannot win. The
  banner section has its own loading/error/retry/empty states. Failed or slow
  images retain copy and the banner action.
- Every part of a banner with a usable HTTP(S) link opens the same external
  action through the already approved `url_launcher` 6.3.2. CTA text is no longer
  displayed; absent/invalid/non-web links are inert. Launch stays directly within
  the tap, and false/exception results show the shared localized snackbar only
  while the originating context is mounted.

## Files changed by the carousel refinement

- `lib/features/banners/presentation/widgets/home_banners.dart`: image layout,
  paging, interaction, lifecycle/timer/controller handling and matching skeleton.
- `lib/features/banners/data/home_banner.dart` and generated `home_banner.g.dart`:
  empty-title fallback only.
- `lib/core/layout/app_layout.dart`, `lib/core/theme/app_colors.dart`: banner
  sizing and image-scrim tokens; no change to other layouts or theme values.
- `lib/core/l10n/arb/app_ar.arb`, `app_en.arb` and generated localization files:
  remove unused previous/next button labels; retain semantic position/failure copy.
- `test/features/banners/home_banners_test.dart`: replace arrow/button tests with
  swipe/image actions and add looping/autoplay/lifecycle/refresh regressions.
- `ROADMAP.md`, this record and `docs/contract-sync-log.md`: current status,
  technical evidence and manual checklist.

## Technical verification

- Dart formatting: passed.
- `flutter analyze --no-pub`: no issues found.
- Focused banner/home/theme/catalog/customer-admin orders suite: all **97 tests passed**.
- `flutter test --no-pub`: all **481 tests passed**.
- `flutter build web --no-pub --dart-define=DATA_SOURCE=mock`: succeeded.
- `pod install`: succeeded; only the new URL launcher dependency was added
  to the tracked iOS lockfile.
- Diff whitespace and scope review: passed; all changes stay within `mobile/`.

Tests cover schedule boundaries/time offsets, sorting and empty active sets,
remote payloads, link validation, launch success/failure/disposal, loading/retry,
bidirectional looping, animated five-second autoplay, interruption/cancel, mouse
and keyboard input, background/ticker suspension, disposal and refresh mid-animation,
empty and shrinking/reordered refreshes, stale responses and independent catalog
refresh. Banner widget checks use Arabic/light and English/dark with 2× text
at 320/390/600/900/1200/1536/1920 px. The existing full screen matrix also covers
both sides of responsive breakpoints at normal scale. Navigation tests use
controlled banner responses so network image loading cannot determine results.
Slow-drag regression tests at 390/1920 px in Arabic/English measure both images
moving exactly with incremental pointer movement after Flutter recognizes the
drag, appearing inside the screen margins, switching the indicator before
pointer-up, staying still while held, and settling at the original image bounds.

No Simulator/Emulator or live backend was used. Native browser integration and
actual network image appearance still require manual verification. CocoaPods
installation succeeded; it emitted existing-project platform/custom-config
notices. No iOS compilation or release-readiness claim is made.

## Ahmed's manual checklist

Restart the app fully after installing the new plugin (hot reload alone does
not register a native plugin), with `DATA_SOURCE=mock`.

1. Open Home as guest/customer: image-only banners should appear above departments,
   with title/subtitle at top-right in Arabic and top-left in English. Check real
   images, gradient readability, rounded corners and height at phone/Web widths,
   in light/dark mode and with enlarged text.
2. Drag slowly and hold before releasing: both rounded images should move with
   the finger across their resting margins toward the screen edges. The next
   image must settle in the same inset position; check the pill switches during
   the drag. Swipe repeatedly both ways on iOS/Android, including last-to-first and
   first-to-last. Try a fast swipe as autoplay begins; it should follow your
   gesture without opening the link. With Web, also try mouse drag/trackpad and
   left/right keys after focusing the carousel with Tab.
3. Leave the carousel idle for five seconds: it should slide smoothly. Hold a
   finger, or hover/focus on Web, to pause. Release/leave the carousel and confirm
   autoplay resumes after a fresh idle interval. Background/return to the app.
4. Tap any part of the first campaign image: the demo page
   should open. The indicator below it must not open the link. Return to Home.
   The second default banner has no action. No CTA
   button, visible counter or arrows should remain.
5. Pull to refresh on the second slide; selection should remain stable. Check
   image loading with a slow/disconnected network: copy/action should remain
   usable. Empty/single/reordered lists and failed reads are covered by controlled
   tests; no debug/admin interface has been added for these cases.

## Full-viewport paging correction — 2026-09-11

Moved horizontal padding/content constraints and rounded clipping into each
page. The PageView now spans the viewport; images retain their resting width,
height and margins. Replaced overlay dots with a centered brand-color pill
indicator below the image. Only the banner widget, its tests and R3 documentation
changed in this correction; data, actions, timer and looping semantics remain.
Analysis, all 51 focused tests, all 475 tests and mock Web build passed. Manual
acceptance remains pending; no Simulator/Emulator, commit or push.

## Wide proportions and centralized chips — 2026-09-11

Ahmed requested a shorter, responsive horizontal banner, removal of Home's
shop-by-department heading, and a shared selectable/filter chip appearance.
The carousel controller, paging, autoplay, indicator, action and data semantics
are unchanged by this refinement.

`NavigationThemes.chip` remains the single theme source; no screen-specific
selection styling or new wrapper was needed. Current ChoiceChip/FilterChip uses
were reviewed in Home departments, customer/admin order status, product offers
and sorting, variant selection and the design gallery. They all inherit the
new outline/shape/shadow. Status icon colors, hidden checkmarks on order chips,
variant availability/strike-through, selection callbacks and scrolling remain.

The shared corner radius now uses `AppRadii.xs` (6 instead of 10). Backgrounds
remain `surfaceAlt`/`primarySoft`. Enabled selection adds a 1.25-pixel primary
border and a very light primary-family shadow. RawChip's selected-shadow hook
keeps unselected/informational shadows transparent; no display chip is converted
into a selector. Text/checkmarks use `textPrimary`, with muted disabled labels.
No dependency was added.

Changed source: `core/layout/app_layout.dart`, `core/theme/components/navigation_themes.dart`,
`features/banners/presentation/widgets/home_banners.dart` and
`features/catalog/presentation/screens/home_screen.dart`. Focused regressions
cover compact proportions and skeleton geometry, heading removal with category
filtering, shared ChoiceChip/FilterChip selection/disabled states and contrast.

Manual follow-up: inspect the shorter banner and the small indicator-to-department
spacing at phone/tablet/Web widths. Compare selected/unselected chips in Home,
customer/admin orders, offers/sort and product variants in light/dark mode. Confirm
subtle primary borders/shadows, readable labels/icons and unchanged filtering.

Verification for this refinement: formatting and diff checks passed; analysis
clean; all 97 focused tests and all 481 Flutter tests passed; mock Web build
succeeded. Final visual acceptance is pending. No Simulator/Emulator, commit
or push was performed.

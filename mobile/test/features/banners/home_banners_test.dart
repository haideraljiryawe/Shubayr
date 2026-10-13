import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'dart:async';
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:shubayr/core/widgets/skeleton.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:shubayr/features/banners/data/home_banner.dart';
import 'package:shubayr/features/banners/domain/banner_repository.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/banners/presentation/widgets/home_banners.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';

const first = HomeBanner(
  id: 'a',
  title: 'عنوان البانر الأول First campaign',
  subtitle:
      'وصف طويل للعرض يظهر كما جاء من الخادم دون تغيير محتوى النص. A readable campaign description.',
  imageUrl: '',
  ctaText: 'فتح العرض Open offer',
  linkUrl: 'https://example.com/',
);
const second = HomeBanner(id: 'b', title: 'Second banner', imageUrl: '');

class _Repo implements BannerRepository {
  int reads = 0;
  Future<List<HomeBanner>> Function()? onRead;
  @override
  Future<List<HomeBanner>> fetchBanners() {
    reads++;
    return onRead?.call() ?? Future.value([first, second]);
  }
}

Widget _host(
  Widget child, {
  String lang = 'ar',
  bool dark = false,
  double scale = 1,
  _Repo? repo,
  Future<bool> Function(Uri)? launch,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    if (repo != null) bannerRepositoryProvider.overrideWithValue(repo),
    if (launch != null) bannerLinkLauncherProvider.overrideWithValue(launch),
  ],
  child: MaterialApp(
    locale: Locale(lang),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: Scaffold(body: SingleChildScrollView(child: child)),
  ),
);
double _bannerScale(WidgetTester tester, int page) => tester
    .widget<Transform>(
      find
          .descendant(
            of: find.byKey(ValueKey('banner-page-$page')),
            matching: find.byType(Transform),
          )
          .first,
    )
    .transform
    .entry(0, 0);

Rect _paintedBannerRect(WidgetTester tester, int page) {
  final box = tester.renderObject<RenderBox>(
    find.byKey(ValueKey('banner-artwork-$page')),
  );
  return MatrixUtils.transformRect(
    box.getTransformTo(null),
    Offset.zero & box.size,
  );
}

void _expectVisibleGaps(WidgetTester tester, int page) {
  final artwork = [
    for (final index in [page - 1, page, page + 1])
      _paintedBannerRect(tester, index),
  ]..sort((a, b) => a.left.compareTo(b.left));
  expect(artwork[1].left - artwork[0].right, closeTo(6, .001));
  expect(artwork[2].left - artwork[1].right, closeTo(6, .001));
}

// Verify layout slots as well as the transformed artwork visible at each edge.
void _expectPeeks(WidgetTester tester, double width, int count) {
  final pager = find.byType(PageView);
  final view = tester.getRect(pager);
  final controller = tester.widget<PageView>(pager).controller!;
  final page = controller.page!.round();
  final cards = [
    for (final index in [page - 1, page, page + 1])
      tester.getRect(find.byKey(ValueKey('banner-page-$index'))),
  ]..sort((a, b) => a.left.compareTo(b.left));
  final fraction = width < 600 ? 0.88 : 0.86;
  const gap = 6.0;
  final peek = width * (1 - fraction) / 2 - gap / 2;
  expect(view.left, 0);
  expect(view.width, width);
  expect(controller.viewportFraction, fraction);
  expect(cards[1].center.dx, closeTo(view.center.dx, 0.001));
  expect(cards[1].width, closeTo(width * fraction - gap, 0.001));
  expect(cards[1].left - cards[0].right, closeTo(gap, 0.001));
  expect(cards[2].left - cards[1].right, closeTo(gap, 0.001));
  expect(cards[0].intersect(view).width, closeTo(peek, 0.001));
  expect(cards[2].intersect(view).width, closeTo(peek, 0.001));
  expect(peek, greaterThanOrEqualTo(width < 600 ? 12 : 24 - 0.001));
  for (final index in [page - 1, page, page + 1]) {
    final scale = index == page ? 1.00 : 0.96;
    expect(_bannerScale(tester, index), closeTo(scale, .000001));
    final artwork = _paintedBannerRect(tester, index);
    final slot = tester.getRect(find.byKey(ValueKey('banner-page-$index')));
    if (index == page) {
      expect(artwork.center.dx, closeTo(slot.center.dx, .001));
    } else {
      // Neighbors move inward by exactly the extra inset created by scaling.
      final inward = (view.center.dx - slot.center.dx).sign;
      expect(
        artwork.center.dx,
        closeTo(slot.center.dx + inward * slot.width * (1 - scale) / 2, .001),
      );
    }
    expect(artwork.center.dy, closeTo(slot.center.dy, .001));
    expect(artwork.width, closeTo(slot.width * scale, .001));
    expect(artwork.height, closeTo(slot.height * scale, .001));
    expect(artwork.intersect(view).width, greaterThan(0));
  }
  _expectVisibleGaps(tester, page);
  expect(
    find.byKey(ValueKey('banner-dot-${page % count}-true')),
    findsOneWidget,
  );
}

void main() {
  const third = HomeBanner(id: 'c', title: 'Third campaign', imageUrl: '');
  for (final lang in ['ar', 'en']) {
    for (final width in [390.0, 834.0]) {
      testWidgets(
        'scale follows drag without shifting layout or resetting on rebuild $width $lang',
        (tester) async {
          tester.view.physicalSize = Size(width, 1500);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
          Widget host() => _host(
            const HomeBannerDeck(banners: [first, second, third]),
            lang: lang,
          );
          await tester.pumpWidget(host());
          await tester.pumpAndSettle();
          final pager = find.byType(PageView);
          final controller = tester.widget<PageView>(pager).controller!;
          final initial = controller.page!.round();
          final height = tester.getSize(pager).height;
          double dotTop() => tester
              .getTopLeft(
                find
                    .byWidgetPredicate(
                      (w) =>
                          w.key is ValueKey<String> &&
                          (w.key! as ValueKey<String>).value.startsWith(
                            'banner-dot-',
                          ),
                    )
                    .first,
              )
              .dy;
          final initialDotTop = dotTop();
          final gesture = await tester.startGesture(tester.getCenter(pager));
          final direction = lang == 'ar' ? 1.0 : -1.0;
          await gesture.moveBy(Offset(direction * 40, 0));
          await tester.pump();
          var previousScale = 1.0;
          for (var step = 0; step < 3; step++) {
            await gesture.moveBy(Offset(direction * width * .12, 0));
            await tester.pump(const Duration(milliseconds: 16));
            final position = controller.page!;
            expect(
              position,
              inExclusiveRange(initial.toDouble(), initial + 1.0),
            );
            final scale = _bannerScale(tester, initial);
            expect(scale, closeTo(1 - .04 * (position - initial), .000001));
            expect(scale, lessThan(previousScale));
            expect(
              _bannerScale(tester, initial + 1),
              closeTo(.96 + .04 * (position - initial), .000001),
            );
            // The pair crossing the center retains the actual 6dp painted gap
            // throughout the drag, including fractional controller positions.
            final pair = [
              _paintedBannerRect(tester, initial),
              _paintedBannerRect(tester, initial + 1),
            ]..sort((a, b) => a.left.compareTo(b.left));
            expect(pair[1].left - pair[0].right, closeTo(6, .001));
            expect(tester.getSize(pager).height, height);
            expect(dotTop(), initialDotTop);
            // An ordinary parent rebuild must preserve fractional position and scale.
            await tester.pumpWidget(host());
            await tester.pump();
            expect(tester.widget<PageView>(pager).controller, same(controller));
            expect(controller.page, position);
            expect(_bannerScale(tester, initial), scale);
            previousScale = scale;
          }
          await gesture.moveBy(Offset(direction * width * .3, 0));
          await gesture.up();
          await tester.pumpAndSettle();
          _expectPeeks(tester, width, 3);
          expect(
            find.byKey(const ValueKey('banner-dot-1-true')),
            findsOneWidget,
          );
          expect(tester.getSize(pager).height, height);
          expect(dotTop(), initialDotTop);
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      'system reduced motion removes scaling and keeps every banner reachable $lang',
      (tester) async {
        tester.platformDispatcher.accessibilityFeaturesTestValue =
            const FakeAccessibilityFeatures(disableAnimations: true);
        addTearDown(
          tester.platformDispatcher.clearAccessibilityFeaturesTestValue,
        );
        addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
        final semantics = tester.ensureSemantics();
        try {
          await tester.pumpWidget(
            _host(
              const HomeBannerDeck(banners: [first, second, third]),
              lang: lang,
            ),
          );
          await tester.pumpAndSettle();
          final pager = find.byType(PageView);
          final controller = tester.widget<PageView>(pager).controller!;
          final height = tester.getSize(pager).height;
          for (var step = 0; step < 4; step++) {
            final page = controller.page!.round();
            for (final index in [page - 1, page, page + 1]) {
              expect(_bannerScale(tester, index), 1.0);
            }
            _expectVisibleGaps(tester, page);
            expect(
              find.byKey(ValueKey('banner-dot-${step % 3}-true')),
              findsOneWidget,
            );
            final gesture = await tester.startGesture(tester.getCenter(pager));
            final direction = lang == 'ar' ? 1.0 : -1.0;
            await gesture.moveBy(Offset(direction * 40, 0));
            await tester.pump();
            await gesture.moveBy(Offset(direction * 250, 0));
            await tester.pump(const Duration(milliseconds: 16));
            expect(_bannerScale(tester, page), 1.0);
            expect(_bannerScale(tester, page + 1), 1.0);
            await gesture.moveBy(Offset(direction * 350, 0));
            await gesture.up();
            await tester.pumpAndSettle();
            expect(tester.getSize(pager).height, height);
            expect(tester.takeException(), isNull);
          }
          // A live settings change updates the effect without replacing the pager.
          final position = controller.page;
          tester.platformDispatcher.accessibilityFeaturesTestValue =
              const FakeAccessibilityFeatures(disableAnimations: false);
          await tester.pumpAndSettle();
          expect(tester.widget<PageView>(pager).controller, same(controller));
          expect(controller.page, position);
          expect(_bannerScale(tester, position!.round()), 1.0);
          expect(_bannerScale(tester, position.round() + 1), .96);
        } finally {
          semantics.dispose();
        }
      },
    );
  }

  for (final lang in ['ar', 'en']) {
    for (final count in [2, 3]) {
      testWidgets(
        'centered bilateral peek at every responsive boundary: $count $lang',
        (tester) async {
          addTearDown(tester.view.reset);
          addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
          tester.view.devicePixelRatio = 1;
          final semantics = tester.ensureSemantics();
          try {
            for (final width in [
              320.0,
              390.0,
              599.0,
              600.0,
              601.0,
              834.0,
              1194.0,
              1920.0,
            ]) {
              tester.view.physicalSize = Size(width, 2000);
              await tester.pumpWidget(
                _host(
                  HomeBannerDeck(
                    banners: [first, second, if (count == 3) third],
                    onOpen: (_) async {},
                  ),
                  lang: lang,
                ),
              );
              await tester.pumpAndSettle();
              _expectPeeks(tester, width, count);
              // Decorative copies do not repeat buttons or labels for screen readers.
              expect(
                find.bySemanticsLabel(RegExp(RegExp.escape(first.title))),
                findsOneWidget,
              );
              expect(
                find.bySemanticsLabel(RegExp(RegExp.escape(second.title))),
                findsNothing,
              );
              expect(tester.takeException(), isNull);
            }
          } finally {
            semantics.dispose();
          }
        },
      );

      testWidgets(
        'both neighbors survive manual and automatic cycles: $count $lang',
        (tester) async {
          tester.view.physicalSize = const Size(390, 1400);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
          await tester.pumpWidget(
            _host(
              HomeBannerDeck(banners: [first, second, if (count == 3) third]),
              lang: lang,
            ),
          );
          await tester.pumpAndSettle();
          var index = 0;
          for (final direction in [1, 1, 1, 1, -1, -1, -1, -1]) {
            await tester.drag(
              find.byType(PageView),
              Offset((lang == 'ar' ? 280 : -280) * direction.toDouble(), 0),
            );
            await tester.pumpAndSettle();
            index = (index + direction) % count;
            expect(
              find.byKey(ValueKey('banner-dot-$index-true')),
              findsOneWidget,
            );
            _expectPeeks(tester, 390, count);
          }
          for (var step = 0; step < count * 2; step++) {
            await tester.pump(const Duration(seconds: 5));
            await tester.pumpAndSettle();
            index = (index + 1) % count;
            expect(
              find.byKey(ValueKey('banner-dot-$index-true')),
              findsOneWidget,
            );
            _expectPeeks(tester, 390, count);
          }
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      'resize retains selection, resumes autoplay and detaches controllers in $lang',
      (tester) async {
        tester.view.physicalSize = const Size(390, 1600);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
        await tester.pumpWidget(
          _host(
            const HomeBannerDeck(banners: [first, second, third]),
            lang: lang,
          ),
        );
        await tester.pumpAndSettle();
        PageController controller() =>
            tester.widget<PageView>(find.byType(PageView)).controller!;
        final phoneController = controller();
        await tester.drag(
          find.byType(PageView),
          Offset(lang == 'ar' ? 280 : -280, 0),
        );
        await tester.pumpAndSettle();
        tester.view.physicalSize = const Size(834, 1194);
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('banner-dot-1-true')), findsOneWidget);
        expect(phoneController.hasClients, isFalse);
        _expectPeeks(tester, 834, 3);
        final tabletController = controller();
        tester.view.physicalSize = const Size(1194, 834);
        await tester.pumpAndSettle();
        expect(controller(), same(tabletController));
        _expectPeeks(tester, 1194, 3);
        await tester.pump(const Duration(seconds: 5));
        await tester.pump(const Duration(milliseconds: 200));
        // Resize during the animation, retaining the currently selected entity.
        final selected = controller().page!.round() % 3;
        tester.view.physicalSize = const Size(390, 1600);
        await tester.pumpAndSettle();
        expect(
          find.byKey(ValueKey('banner-dot-$selected-true')),
          findsOneWidget,
        );
        expect(tabletController.hasClients, isFalse);
        _expectPeeks(tester, 390, 3);
        await tester.pump(const Duration(seconds: 5));
        await tester.pumpAndSettle();
        expect(
          find.byKey(ValueKey('banner-dot-${(selected + 1) % 3}-true')),
          findsOneWidget,
        );
        final lastController = controller();
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(seconds: 30));
        expect(lastController.hasClients, isFalse);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'fraction is based on the local slot, independent of window width',
    (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      await tester.pumpWidget(
        _host(
          const Center(
            child: SizedBox(
              width: 320,
              child: HomeBannerDeck(banners: [first, second]),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final pager = tester.widget<PageView>(find.byType(PageView));
      expect(tester.getSize(find.byType(PageView)).width, 320);
      expect(
        pager.controller!.viewportFraction,
        AppLayout.homeBannerCompactFraction,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'banner proportions stay horizontal across viewport sizes with matching loading geometry',
    (tester) async {
      addTearDown(tester.view.reset);
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      for (final width in [
        320.0,
        390.0,
        599.0,
        600.0,
        601.0,
        899.0,
        900.0,
        901.0,
        1199.0,
        1200.0,
        1201.0,
        1535.0,
        1536.0,
        1537.0,
        1920.0,
      ]) {
        tester.view.physicalSize = Size(width, 1600);
        tester.view.devicePixelRatio = 1;
        await tester.pumpWidget(
          _host(
            const HomeBannerDeck(
              banners: [HomeBanner(id: 'image', imageUrl: '')],
            ),
          ),
        );
        await tester.pumpAndSettle();
        final size = tester.getSize(
          find.byKey(const ValueKey('banner-page-0')),
        );
        // Narrower wide artwork retains the previous container height.
        final heightFraction = width < 600 ? 0.88 : 0.90;
        final oldHeight = (width * heightFraction - (width < 600 ? 8 : 12)) / 2;
        expect(size.height, closeTo(oldHeight, .001));
        expect(_bannerScale(tester, 0), 1.00);
        final fraction = width < 600 ? 0.88 : 0.86;
        const gap = 6.0;
        expect(size.width, closeTo(width * fraction - gap, 0.001));
        expect(
          tester.getCenter(find.byKey(const ValueKey('banner-page-0'))).dx,
          closeTo(width / 2, 0.001),
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(_host(const HomeBannerSkeleton()));
        await tester.pump();
        expect(tester.getSize(find.byType(Skeleton)), size);
      }
    },
  );

  for (final width in [390.0, 1920.0]) {
    for (final lang in ['ar', 'en']) {
      testWidgets(
        'full viewport slow drag tracks both peek images before release at $width $lang',
        (tester) async {
          tester.view.physicalSize = Size(width, 1600);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
          await tester.pumpWidget(
            _host(const HomeBanners(), repo: _Repo(), lang: lang),
          );
          await tester.pumpAndSettle();
          final pager = find.byType(PageView);
          final viewport = tester.getRect(pager);
          final controller = tester.widget<PageView>(pager).controller!;
          final initialPage = controller.page!.round();
          final current = find.byKey(ValueKey('banner-page-$initialPage'));
          final adjacent = find.byKey(
            ValueKey('banner-page-${initialPage + 1}'),
          );
          final initial = tester.getRect(current);
          expect(viewport.center.dx, width / 2);
          expect(viewport.width, width);
          expect(
            tester.widget<PageView>(pager).controller!.viewportFraction,
            width < 600 ? 0.88 : 0.86,
          );
          expect(
            initial.width,
            closeTo(width * controller.viewportFraction - 6, 0.001),
          );
          expect(initial.center.dx, closeTo(viewport.center.dx, 0.001));
          expect(
            tester.getRect(adjacent).intersect(viewport).width,
            greaterThan(12),
          );
          final direction = lang == 'ar' ? 1.0 : -1.0;
          final gesture = await tester.startGesture(viewport.center);
          // Cross Flutter's normal touch slop to win the drag gesture, then
          // measure frame-by-frame motion while the finger is still down.
          await gesture.moveBy(Offset(direction * 40, 0));
          await tester.pump(const Duration(milliseconds: 16));
          await gesture.moveBy(Offset(direction * viewport.width * 0.3, 0));
          await tester.pump(const Duration(milliseconds: 100));
          final before = tester.getRect(current);
          expect(before.left, isNot(closeTo(initial.left, 1)));
          expect(
            tester.getRect(adjacent).intersect(viewport).width,
            greaterThan(0),
          );
          // Both images extend into the pager margins during the drag.
          // No rounded clip outside PageView can hide those moving edges.
          expect(
            find.ancestor(of: pager, matching: find.byType(ClipRRect)),
            findsNothing,
          );
          for (final entry in [
            (current, lang == 'ar' ? viewport.right - 4 : viewport.left + 4),
            (adjacent, lang == 'ar' ? viewport.left + 4 : viewport.right - 4),
          ]) {
            expect(
              tester
                  .getRect(entry.$1)
                  .intersect(viewport)
                  .contains(Offset(entry.$2, viewport.center.dy)),
              isTrue,
            );
          }
          final neighborBefore = tester.getRect(adjacent);
          await gesture.moveBy(Offset(direction * 30, 0));
          await tester.pump(const Duration(milliseconds: 16));
          expect(
            tester.getRect(current).left - before.left,
            closeTo(direction * 30, 0.1),
          );
          expect(
            tester.getRect(adjacent).left - neighborBefore.left,
            closeTo(direction * 30, 0.1),
          );
          await gesture.moveBy(Offset(direction * viewport.width * 0.3, 0));
          await tester.pump(const Duration(milliseconds: 100));
          // The logical indicator changes during the drag, before pointer-up.
          final active = find.byKey(const ValueKey('banner-dot-1-true'));
          final inactive = find.byKey(const ValueKey('banner-dot-0-false'));
          expect(active, findsOneWidget);
          expect(
            tester.getSize(active).width,
            greaterThan(tester.getSize(inactive).width),
          );
          expect(tester.getRect(active).top, greaterThan(viewport.bottom));
          final held = tester.getRect(adjacent);
          await tester.pump(const Duration(seconds: 10));
          expect(tester.getRect(adjacent), held);
          await gesture.up();
          await tester.pumpAndSettle();
          expect(tester.getRect(adjacent).left, closeTo(initial.left, 0.001));
          expect(tester.getRect(adjacent).size, initial.size);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('indicator below the image does not trigger the banner action', (
    tester,
  ) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    var opens = 0;
    await tester.pumpWidget(
      _host(
        HomeBannerDeck(
          banners: const [first, second],
          onOpen: (_) async {
            opens++;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    final dot = find.byKey(const ValueKey('banner-dot-0-true'));
    expect(
      tester.getRect(dot).top,
      greaterThan(tester.getRect(find.byType(PageView)).bottom),
    );
    await tester.tap(dot);
    await tester.pumpAndSettle();
    expect(opens, 0);
  });

  testWidgets(
    'a swipe interrupts autoplay without opening a link or fighting the gesture',
    (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      var opens = 0;
      await tester.pumpWidget(
        _host(
          HomeBannerDeck(
            banners: const [first, second],
            onOpen: (_) async {
              opens++;
            },
          ),
          lang: 'en',
        ),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.drag(find.byType(PageView), const Offset(600, 0));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
      expect(opens, 0);
      await tester.pump(const Duration(seconds: 4));
      expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('banner-dot-1-true')), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  for (final lang in ['ar', 'en']) {
    testWidgets('loops in both directions through two banners in $lang', (
      tester,
    ) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      await tester.pumpWidget(
        _host(const HomeBannerDeck(banners: [first, second]), lang: lang),
      );
      await tester.pumpAndSettle();
      var index = 0;
      for (final direction in [1, 1, 1, -1, -1, -1, -1]) {
        await tester.drag(
          find.byType(PageView),
          Offset((lang == 'ar' ? 600 : -600) * direction.toDouble(), 0),
        );
        await tester.pumpAndSettle();
        index = (index + direction) % 2;
        expect(find.byKey(ValueKey('banner-dot-$index-true')), findsOneWidget);
        expect(
          find.text(index == 0 ? first.title : second.title).hitTestable(),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      }
    });
  }

  testWidgets('autoplay waits five seconds and animates through the loop', (
    tester,
  ) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    await tester.pumpWidget(
      _host(const HomeBannerDeck(banners: [first, second]), lang: 'en'),
    );
    await tester.pumpAndSettle();
    final controller = tester
        .widget<PageView>(find.byType(PageView))
        .controller!;
    final initialPage = controller.page!;
    await tester.pump(const Duration(seconds: 4));
    expect(controller.page, initialPage);
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 100));
    expect(controller.page, greaterThan(initialPage));
    expect(controller.page, lessThan(initialPage + 1));
    expect(
      _bannerScale(tester, initialPage.round()),
      inExclusiveRange(.96, 1.0),
    );
    expect(
      _bannerScale(tester, initialPage.round() + 1),
      inExclusiveRange(.96, 1.0),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner-dot-1-true')), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
    expect(controller.page, initialPage); // Invisible cycle recenter completed.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 30));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'holding and cancelling touch pauses then restarts the idle interval',
    (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      await tester.pumpWidget(
        _host(const HomeBannerDeck(banners: [first, second]), lang: 'en'),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 4));
      final gesture = await tester.startGesture(
        tester.getCenter(find.byType(PageView)),
      );
      await tester.pump(const Duration(seconds: 10));
      expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
      await gesture.cancel();
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 4));
      expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('banner-dot-1-true')), findsOneWidget);
    },
  );

  testWidgets('background and disabled ticker pause autoplay until resumed', (
    tester,
  ) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    var enabled = true;
    late StateSetter rebuild;
    await tester.pumpWidget(
      _host(
        StatefulBuilder(
          builder: (context, setState) {
            rebuild = setState;
            return TickerMode(
              enabled: enabled,
              child: const HomeBannerDeck(banners: [first, second]),
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 12));
    expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    rebuild(() => enabled = false);
    await tester.pump();
    await tester.pump(const Duration(seconds: 12));
    expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
    rebuild(() => enabled = true);
    await tester.pump();
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner-dot-1-true')), findsOneWidget);
  });

  testWidgets('leaving the route pauses autoplay and returning resumes it', (
    tester,
  ) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    await tester.pumpWidget(
      _host(const HomeBannerDeck(banners: [first, second]), lang: 'en'),
    );
    await tester.pumpAndSettle();
    final controller = tester
        .widget<PageView>(find.byType(PageView))
        .controller!;
    final initialPage = controller.page;
    final navigator = Navigator.of(tester.element(find.byType(HomeBannerDeck)));
    unawaited(
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Another page')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 12));
    expect(controller.page, initialPage);
    navigator.pop();
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner-dot-1-true')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mouse hover pauses, mouse dragging and keyboard can navigate', (
    tester,
  ) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    await tester.pumpWidget(
      _host(const HomeBannerDeck(banners: [first, second]), lang: 'en'),
    );
    await tester.pumpAndSettle();
    final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
    await mouse.addPointer(location: tester.getCenter(find.byType(PageView)));
    await tester.pump(const Duration(seconds: 12));
    expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
    await mouse.removePointer();
    await tester.drag(
      find.byType(PageView),
      const Offset(-600, 0),
      kind: PointerDeviceKind.mouse,
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner-dot-1-true')), findsOneWidget);
    final listener = tester.element(
      find
          .descendant(
            of: find.byType(HomeBannerDeck),
            matching: find.byType(Listener),
          )
          .first,
    );
    Focus.of(listener).requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
  });

  testWidgets(
    'list changes during animation preserve identity and safely handle zero and one',
    (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      List<HomeBanner> banners = [first, second];
      late StateSetter rebuild;
      await tester.pumpWidget(
        _host(
          StatefulBuilder(
            builder: (context, setState) {
              rebuild = setState;
              return HomeBannerDeck(banners: banners);
            },
          ),
          lang: 'en',
        ),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 200));
      rebuild(
        () => banners = [
          second,
          first,
          const HomeBanner(id: 'c', title: 'Third', imageUrl: ''),
        ],
      );
      await tester.pumpAndSettle();
      expect(find.text(second.title).hitTestable(), findsOneWidget);
      expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
      rebuild(() => banners = [second]);
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 15));
      expect(find.byKey(const ValueKey('banner-dot-0-true')), findsNothing);
      expect(find.text(second.title), findsOneWidget);
      rebuild(() => banners = []);
      await tester.pumpAndSettle();
      expect(find.byType(PageView), findsNothing);
      rebuild(() => banners = [first, second]);
      await tester.pumpAndSettle();
      expect(find.text(first.title).hitTestable(), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      expect(find.text(second.title).hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'image-only banner is inert without an action and has no controls',
    (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      var opens = 0;
      await tester.pumpWidget(
        _host(
          HomeBannerDeck(
            banners: [
              HomeBanner.fromJson({
                'id': 'empty',
                'title': null,
                'image_url': '',
              }),
            ],
            onOpen: (_) async {
              opens++;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(PageView));
      await tester.drag(find.byType(PageView), const Offset(-600, 0));
      await tester.pump(const Duration(seconds: 15));
      expect(opens, 0);
      expect(find.byType(Text), findsNothing);
      expect(find.byIcon(Icons.image_outlined), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'entire image including its lower edge opens the current action',
    (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      var opens = 0;
      await tester.pumpWidget(
        _host(
          HomeBannerDeck(
            banners: const [first, second],
            onOpen: (_) async {
              opens++;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final bounds = tester.getRect(find.byType(PageView));
      await tester.tapAt(bounds.bottomCenter - const Offset(0, 20));
      await tester.pumpAndSettle();
      expect(opens, 1);
      expect(find.text(first.ctaText!), findsNothing);
    },
  );

  for (final outcome in ['success', 'false', 'exception']) {
    testWidgets('external action handles $outcome', (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      Uri? opened;
      await tester.pumpWidget(
        _host(
          const HomeBanners(),
          repo: _Repo(),
          lang: 'en',
          launch: (uri) async {
            opened = uri;
            if (outcome == 'exception') throw StateError('unavailable');
            return outcome == 'success';
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text(first.title).hitTestable());
      await tester.tap(find.text(first.title).hitTestable());
      await tester.pumpAndSettle();
      expect(opened, Uri.parse(first.linkUrl!));
      expect(
        find.text('Could not open this link. Please try again.'),
        outcome == 'success' ? findsNothing : findsOneWidget,
      );
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('link without CTA opens from the image', (tester) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    Uri? opened;
    final repo = _Repo()
      ..onRead = () async => const [
        HomeBanner(
          id: 'linked',
          title: 'Open linked banner',
          imageUrl: '',
          linkUrl: 'https://example.com/campaign',
        ),
      ];
    await tester.pumpWidget(
      _host(
        const HomeBanners(),
        repo: repo,
        launch: (uri) async {
          opened = uri;
          return true;
        },
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open linked banner'));
    await tester.pumpAndSettle();
    expect(opened, Uri.parse('https://example.com/campaign'));
  });

  testWidgets('pending launch failure after leaving does not show feedback', (
    tester,
  ) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    final result = Completer<bool>();
    await tester.pumpWidget(
      _host(const HomeBanners(), repo: _Repo(), launch: (_) => result.future),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text(first.title).hitTestable());
    await tester.tap(find.text(first.title).hitTestable());
    await tester.pumpWidget(const SizedBox.shrink());
    result.completeError(StateError('unavailable'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('new refresh wins over a late previous request', (tester) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    final old = Completer<List<HomeBanner>>();
    final newer = Completer<List<HomeBanner>>();
    final repo = _Repo()..onRead = () => old.future;
    await tester.pumpWidget(_host(const HomeBanners(), repo: repo));
    final container = ProviderScope.containerOf(
      tester.element(find.byType(HomeBanners)),
    );
    repo.onRead = () => newer.future;
    container.invalidate(homeBannersProvider);
    await tester.pump();
    newer.complete([second]);
    await tester.pumpAndSettle();
    old.complete([first]);
    await tester.pumpAndSettle();
    expect(find.text(second.title), findsOneWidget);
    expect(find.text(first.title), findsNothing);
    expect(repo.reads, 2);
  });

  testWidgets('refresh reordering retains selected banner identity', (
    tester,
  ) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    final repo = _Repo();
    await tester.pumpWidget(_host(const HomeBanners(), repo: repo, lang: 'en'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(PageView), const Offset(-600, 0));
    await tester.pumpAndSettle();
    repo.onRead = () async => [second, first];
    ProviderScope.containerOf(
      tester.element(find.byType(HomeBanners)),
    ).invalidate(homeBannersProvider);
    await tester.pumpAndSettle();
    expect(find.text(second.title), findsOneWidget);
    expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
    expect(find.text('1 of 2'), findsNothing);
  });

  testWidgets('banner failure does not block catalog or escape pull refresh', (
    tester,
  ) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    final repo = _Repo()..onRead = () async => throw StateError('offline');
    var feedReads = 0;
    await tester.pumpWidget(
      ProviderScope(
        retry: (retryCount, error) => null,
        overrides: [
          notificationSyncProvider.overrideWith((ref) {}),
          unreadCountProvider.overrideWith((ref) async => 0),
          dataSourceProvider.overrideWithValue(DataSource.mock),
          bannerRepositoryProvider.overrideWithValue(repo),
          brandProvider.overrideWithValue(const Brand.bundled()),
          categoriesProvider.overrideWith((ref) async => []),
          homeOffersProvider.overrideWith((ref) async {
            feedReads++;
            return const ProductPage();
          }),
        ],
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const HomeScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.search), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    final refresh = tester
        .state<RefreshIndicatorState>(find.byType(RefreshIndicator))
        .show();
    await tester.pumpAndSettle();
    await refresh;
    expect(repo.reads, 2);
    expect(feedReads, 2);
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 390.0, 600.0, 900.0, 1200.0, 1536.0, 1920.0]) {
    for (final lang in ['ar', 'en']) {
      testWidgets(
        'banners fit $width $lang with enlarged text and functional controls',
        (tester) async {
          addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
          tester.view.physicalSize = Size(width, 1600);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          Uri? opened;
          await tester.pumpWidget(
            _host(
              HomeBannerDeck(
                banners: const [first, second],
                onOpen: (uri) async {
                  opened = uri;
                },
              ),
              lang: lang,
              dark: lang == 'en',
              scale: 2,
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.ensureVisible(find.text(first.title).hitTestable());
          await tester.pumpAndSettle();
          await tester.tap(find.text(first.title).hitTestable());
          await tester.pumpAndSettle();
          expect(opened, Uri.parse(first.linkUrl!));
          await tester.drag(
            find.byType(PageView),
            Offset(
              tester.getSize(find.byType(PageView)).width *
                  (lang == 'ar' ? 0.8 : -0.8),
              0,
            ),
          );
          await tester.pumpAndSettle();
          expect(find.text('Second banner').hitTestable(), findsOneWidget);
          expect(find.text(first.title).hitTestable(), findsNothing);
          expect(find.byType(IconButton), findsNothing);
          expect(find.text(first.ctaText!), findsNothing);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
  testWidgets(
    'refresh shrink keeps a valid selection; one banner hides controls',
    (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      final repo = _Repo();
      await tester.pumpWidget(
        _host(const HomeBanners(), repo: repo, lang: 'en'),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(PageView), const Offset(-600, 0));
      await tester.pumpAndSettle();
      repo.onRead = () async => [first];
      final container = ProviderScope.containerOf(
        tester.element(find.byType(HomeBanners)),
      );
      container.invalidate(homeBannersProvider);
      await tester.pumpAndSettle();
      expect(find.text(first.title), findsOneWidget);
      expect(find.byType(IconButton), findsNothing);
    },
  );
  testWidgets(
    'loading skeleton, retry and empty result remain local to banners',
    (tester) async {
      addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
      final pending = Completer<List<HomeBanner>>();
      final repo = _Repo()..onRead = () => pending.future;
      await tester.pumpWidget(
        _host(const HomeBanners(), repo: repo, lang: 'en'),
      );
      await tester.pump();
      expect(find.byType(HomeBannerSkeleton), findsOneWidget);
      pending.completeError(StateError('offline'));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      repo.onRead = () async => [];
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(repo.reads, 2);
      expect(find.byType(HomeBannerDeck), findsNothing);
      expect(find.byType(HomeBannerSkeleton), findsNothing);
    },
  );
  testWidgets('invalid link cannot run a supplied opener', (tester) async {
    addTearDown(() => tester.pumpWidget(const SizedBox.shrink()));
    var opens = 0;
    await tester.pumpWidget(
      _host(
        HomeBannerDeck(
          banners: const [
            HomeBanner(
              id: 'bad',
              title: 'No action',
              imageUrl: '',
              ctaText: 'Open',
              linkUrl: 'javascript:bad',
            ),
          ],
          onOpen: (_) async {
            opens++;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Open'), findsNothing);
    await tester.tap(find.text('No action'));
    expect(opens, 0);
  });
}

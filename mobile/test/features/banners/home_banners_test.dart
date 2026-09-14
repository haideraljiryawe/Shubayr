import 'package:shubayr/core/theme/tokens/app_spacing.dart';
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
void main() {
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
        // Current artwork starts at 2:1 and becomes panoramic on wider layouts.
        final aspectRatio = size.width / size.height;
        expect(aspectRatio, inInclusiveRange(2.0, 4.0));
        if (width <= 390) expect(aspectRatio, closeTo(2.0, 0.001));
        if (width <= 390) {
          expect(size.height, (width - AppSpacing.screenMobileH * 2) / 2);
        }
        // The current wide layout caps artwork at 1440px with a 4:1 ratio.
        if (width == 1920) expect(size, const Size(1440, 360));
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
        'full viewport slow drag tracks both inset images before release at $width $lang',
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
          final current = find.byKey(const ValueKey('banner-page-1'));
          final adjacent = find.byKey(const ValueKey('banner-page-2'));
          final initial = tester.getRect(current);
          expect(viewport.left, 0);
          expect(viewport.width, width);
          expect(
            tester.widget<PageView>(pager).controller!.viewportFraction,
            1,
          );
          expect(
            initial.width,
            width == 390 ? width - AppSpacing.screenMobileH * 2 : 1440,
          );
          expect(initial.center.dx, viewport.center.dx);
          expect(adjacent.hitTestable(), findsNothing);
          final direction = lang == 'ar' ? 1.0 : -1.0;
          final gesture = await tester.startGesture(viewport.center);
          // Cross Flutter's normal touch slop to win the drag gesture, then
          // measure frame-by-frame motion while the finger is still down.
          await gesture.moveBy(Offset(direction * 40, 0));
          await tester.pump(const Duration(milliseconds: 16));
          await gesture.moveBy(Offset(direction * width * 0.3, 0));
          await tester.pump(const Duration(milliseconds: 100));
          final before = tester.getRect(current);
          expect(before.left, isNot(closeTo(initial.left, 1)));
          expect(
            tester.getRect(adjacent).intersect(viewport).width,
            greaterThan(0),
          );
          // Both images extend into the screen margins during the drag.
          // No rounded clip outside PageView can hide those moving edges.
          expect(
            find.ancestor(of: pager, matching: find.byType(ClipRRect)),
            findsNothing,
          );
          for (final entry in [
            (current, lang == 'ar' ? width - 4 : 4.0),
            (adjacent, lang == 'ar' ? 4.0 : width - 4),
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
          await gesture.moveBy(Offset(direction * width * 0.3, 0));
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
          expect(tester.getRect(adjacent), initial);
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
    await tester.pump(const Duration(seconds: 4));
    expect(controller.page, 1);
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 100));
    expect(controller.page, greaterThan(1));
    expect(controller.page, lessThan(2));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner-dot-1-true')), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('banner-dot-0-true')), findsOneWidget);
    expect(controller.page, 1); // Invisible sentinel recenter completed.
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
            Offset(lang == 'ar' ? width * 0.8 : -width * 0.8, 0),
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

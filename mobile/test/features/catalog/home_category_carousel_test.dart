import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/presentation/widgets/home_category_carousel.dart';

final _categories = [
  for (var i = 0; i < 8; i++)
    Category(id: '$i', nameEn: 'Home\nTools $i', nameAr: 'لوازم\nالمنزل $i'),
];
Widget _app({
  List<Category>? categories,
  String language = 'en',
  TargetPlatform platform = TargetPlatform.android,
  double width = 320,
  double scale = 1,
  bool reduced = false,
  bool accessible = false,
  bool enabled = true,
  ValueChanged<Category>? onSelected,
  ScrollController? vertical,
  GlobalKey<NavigatorState>? navigatorKey,
  Widget? sibling,
}) => MaterialApp(
  navigatorKey: navigatorKey,
  // Isolate carousel scheduling from MaterialApp theme transitions.
  themeAnimationDuration: Duration.zero,
  locale: Locale(language),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  theme: AppTheme.light(const Brand.bundled()).copyWith(platform: platform),
  home: Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        disableAnimations: reduced,
        accessibleNavigation: accessible,
        textScaler: TextScaler.linear(scale),
      ),
      child: Scaffold(
        body: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: width,
            child: SingleChildScrollView(
              controller: vertical,
              child: Column(
                children: [
                  TickerMode(
                    enabled: enabled,
                    child: HomeCategoryCarousel(
                      categories: categories ?? _categories,
                      onSelected: onSelected ?? (_) {},
                    ),
                  ),
                  sibling ?? const SizedBox(height: 2000),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  ),
);
final _ring = find.byType(CustomScrollView);
Finder _item(int id) => find.byKey(ValueKey('home-category-$id'));
ScrollPosition _position(WidgetTester tester) => tester
    .state<ScrollableState>(
      find.descendant(of: _ring, matching: find.byType(Scrollable)),
    )
    .position;
Future<void> _start(WidgetTester tester, Widget app) async {
  await tester.pumpWidget(app);
  await tester.pump();
}

// Counts framework work, not CPU/GPU time or device frame performance.
class _RenderWork extends SingleChildRenderObjectWidget {
  const _RenderWork(this.counts) : super(child: const SizedBox(height: 2000));
  final List<int> counts;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderWorkBox(counts);
}

class _RenderWorkBox extends RenderProxyBox {
  _RenderWorkBox(this.counts);
  final List<int> counts;

  @override
  void performLayout() {
    counts[0]++;
    super.performLayout();
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    counts[1]++;
    super.paint(context, offset);
  }
}

void main() {
  for (final hz in [60, 90, 120]) {
    testWidgets(
      'time-based movement at simulated $hz Hz isolates sibling work',
      (tester) async {
        final counts = [0, 0];
        var siblingBuilds = 0;
        await _start(
          tester,
          _app(
            sibling: Builder(
              builder: (_) {
                siblingBuilds++;
                return _RenderWork(counts);
              },
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));
        final beforeWork = List<int>.of(counts);
        final beforeBuilds = siblingBuilds;
        final start = _position(tester).pixels;
        var previousMicros = 0;
        for (var frame = 1; frame <= hz; frame++) {
          final micros = (frame * 1000000 / hz).round();
          await tester.pump(Duration(microseconds: micros - previousMicros));
          previousMicros = micros;
        }
        expect(_position(tester).pixels - start, closeTo(12, .001));
        expect(siblingBuilds, beforeBuilds);
        expect(
          counts,
          beforeWork,
          reason: 'The moving viewport must isolate sibling layout and paint.',
        );
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'repeated stop/resume has one frame callback and no stopped frames',
    (tester) async {
      final vertical = ScrollController();
      addTearDown(vertical.dispose);
      Widget app({bool enabled = true, bool reduced = false}) =>
          _app(vertical: vertical, enabled: enabled, reduced: reduced);
      await _start(tester, app());
      final controller = tester.widget<CustomScrollView>(_ring).controller!;
      Future<void> expectStopped() async {
        // Let one-shot framework layout/theme updates settle; a leaked
        // continuous ticker would exceed this bounded wait.
        await tester.pumpAndSettle(
          const Duration(milliseconds: 100),
          EnginePhase.sendSemanticsUpdate,
          const Duration(seconds: 2),
        );
        await tester.pump(const Duration(seconds: 1));
        expect(tester.binding.transientCallbackCount, 0);
        expect(tester.binding.hasScheduledFrame, isFalse);
      }

      for (var i = 0; i < 10; i++) {
        await _start(tester, app(enabled: false));
        await expectStopped();
        await _start(tester, app());
        expect(tester.binding.transientCallbackCount, 1);
        expect(
          tester.widget<CustomScrollView>(_ring).controller,
          same(controller),
        );
        vertical.jumpTo(700);
        await expectStopped();
        vertical.jumpTo(0);
        await tester.pump();
        await tester.pump();
        expect(tester.binding.transientCallbackCount, 1);
        await _start(tester, app(reduced: true));
        await expectStopped();
        await _start(tester, app());
        expect(tester.binding.transientCallbackCount, 1);
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
        await expectStopped();
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        await tester.pump();
        expect(tester.binding.transientCallbackCount, 1);
      }
      await tester.pumpWidget(const SizedBox());
      await expectStopped();
      expect(() => controller.addListener(() {}), throwsFlutterError);
    },
  );

  testWidgets(
    'controller replacements and pending resume are disposed across repeated mounts',
    (tester) async {
      for (var i = 0; i < 12; i++) {
        await _start(tester, _app());
        final controller = tester.widget<CustomScrollView>(_ring).controller!;
        final position = controller.position;
        await tester.tap(_item(1));
        await tester.pump();
        // Replace the controller while a five-second resume timer is pending.
        await _start(
          tester,
          _app(scale: 1.5, categories: _categories.reversed.toList()),
        );
        expect(controller.hasClients, isFalse);
        expect(() => controller.addListener(() {}), throwsFlutterError);
        expect(() => position.addListener(() {}), throwsFlutterError);
        final replacement = tester.widget<CustomScrollView>(_ring).controller!;
        await tester.pumpWidget(const SizedBox());
        expect(() => replacement.addListener(() {}), throwsFlutterError);
        await tester.pump(const Duration(seconds: 6));
        expect(tester.binding.transientCallbackCount, 0);
        expect(tester.binding.hasScheduledFrame, isFalse);
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        expect(tester.takeException(), isNull);
      }
    },
  );

  testWidgets(
    'a large catalog builds a bounded visible set without image widgets',
    (tester) async {
      final categories = [
        for (var i = 0; i < 1000; i++)
          Category(
            id: '$i',
            nameEn: 'Category $i',
            nameAr: 'قسم $i',
            imageUrl: 'https://example.invalid/category.png',
          ),
      ];
      await _start(tester, _app(categories: categories));
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(seconds: 10));
        expect(
          find
              .descendant(of: _ring, matching: find.byType(InkWell))
              .evaluate()
              .length,
          lessThanOrEqualTo(6),
        );
        expect(
          find.descendant(of: _ring, matching: find.byType(Image)),
          findsNothing,
        );
      }
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );

  for (final language in ['en', 'ar']) {
    testWidgets('linear 12px/s, seamless wrap and logical order $language', (
      tester,
    ) async {
      await _start(tester, _app(language: language));
      final initial = tester.getRect(_item(1));
      await tester.pump(const Duration(seconds: 1));
      final first = tester.getRect(_item(1));
      final motionSign = language == 'ar' ? 1 : -1;
      expect(first.left - initial.left, closeTo(motionSign * 12, .001));
      await tester.pump(const Duration(milliseconds: 250));
      expect(
        tester.getRect(_item(1)).left - first.left,
        closeTo(motionSign * 3, .001),
      );
      // Approach the end of the ring, then cross its normalization boundary.
      // 1.25s + 56.383333s places the offset 6px before a complete cycle.
      await tester.pump(const Duration(microseconds: 56383333));
      final last = tester.getRect(_item(7));
      final zero = tester.getRect(_item(0));
      expect((zero.center.dx - last.center.dx).abs(), closeTo(87.2, .001));
      expect(
        (tester.getRect(_item(1)).center.dx - zero.center.dx) * -motionSign,
        closeTo(87.2, .001),
      );
      final beforeSeam = tester.getRect(_item(0));
      await tester.pump(const Duration(seconds: 1));
      expect(_position(tester).pixels, closeTo(6, .001));
      expect(
        tester.getRect(_item(0)).left - beforeSeam.left,
        closeTo(motionSign * 12, .001),
      );
      final before = tester.getRect(_item(1));
      await tester.pump(const Duration(microseconds: 58133333));
      expect(tester.getRect(_item(1)).left, closeTo(before.left, .001));
      expect(_position(tester).pixels, inInclusiveRange(0, 697.6));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
  testWidgets(
    'touch freezes immediately, taps once, resets five-second delay',
    (tester) async {
      final selected = <String>[];
      await _start(
        tester,
        _app(onSelected: (category) => selected.add(category.id)),
      );
      await tester.pump(const Duration(seconds: 1));
      final gesture = await tester.startGesture(tester.getCenter(_item(1)));
      final stopped = _position(tester).pixels;
      await tester.pump(const Duration(seconds: 2));
      expect(_position(tester).pixels, stopped);
      await gesture.up();
      await tester.pump();
      expect(selected, ['1']);
      await tester.pump(const Duration(seconds: 4));
      expect(_position(tester).pixels, stopped);
      await tester.tap(_item(1));
      await tester.pump();
      expect(selected, ['1', '1']);
      await tester.pump(const Duration(milliseconds: 4999));
      expect(_position(tester).pixels, stopped);
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump(const Duration(seconds: 1));
      expect(_position(tester).pixels, closeTo(stopped + 12, .001));
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'native drag in both directions loops, cancels taps and waits for ballistic end',
    (tester) async {
      var taps = 0;
      await _start(tester, _app(onSelected: (_) => taps++));
      for (final distance in [-1800.0, 1800.0]) {
        await tester.fling(_ring, Offset(distance, 0), 1800);
        for (
          var i = 0;
          i < 60 && _position(tester).isScrollingNotifier.value;
          i++
        ) {
          await tester.pump(const Duration(milliseconds: 100));
        }
        await tester.pump();
        expect(_position(tester).isScrollingNotifier.value, isFalse);
        expect(taps, 0);
        final stopped = _position(tester).pixels;
        expect(stopped, inInclusiveRange(0, 697.6));
        expect(
          find
              .descendant(of: _ring, matching: find.byType(InkWell))
              .hitTestable(),
          findsWidgets,
        );
        await tester.pump(const Duration(seconds: 4));
        expect(_position(tester).pixels, stopped);
        await tester.pump(const Duration(seconds: 1));
        await tester.pump(const Duration(seconds: 1));
        expect(_position(tester).pixels, closeTo((stopped + 12) % 697.6, .001));
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('reduced motion keeps manual scrolling and taps available', (
    tester,
  ) async {
    var taps = 0;
    await _start(tester, _app(reduced: true, onSelected: (_) => taps++));
    final start = _position(tester).pixels;
    await tester.pump(const Duration(seconds: 20));
    expect(_position(tester).pixels, start);
    await tester.tap(_item(1));
    expect(taps, 1);
    await tester.drag(_ring, const Offset(-150, 0));
    await tester.pumpAndSettle();
    expect(_position(tester).pixels, isNot(start));
    final stopped = _position(tester).pixels;
    await tester.pump(const Duration(seconds: 10));
    expect(_position(tester).pixels, stopped);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'screen readers receive one labeled actionable copy of each category',
    (tester) async {
      final semantics = tester.ensureSemantics();
      var taps = 0;
      await _start(tester, _app(accessible: true, onSelected: (_) => taps++));
      expect(_ring, findsNothing);
      for (var i = 0; i < 8; i++) {
        expect(_item(i), findsOneWidget);
        expect(find.text('Home\nTools $i'), findsOneWidget);
      }
      expect(
        tester.getSemantics(find.text('Home\nTools 1')),
        matchesSemantics(
          label: 'Home\nTools 1',
          isFocusable: true,
          hasTapAction: true,
          hasFocusAction: true,
        ),
      );
      await tester.tap(_item(1));
      expect(taps, 1);
      await tester.pumpAndSettle();
      expect(tester.binding.hasScheduledFrame, isFalse);
      semantics.dispose();
    },
  );
  testWidgets('many revolutions keep offsets and built children bounded', (
    tester,
  ) async {
    await _start(tester, _app());
    var elapsedMicros = 0;
    for (var i = 0; i < 120; i++) {
      final micros = i.isEven ? 16000 : 58133333;
      elapsedMicros += micros;
      await tester.pump(Duration(microseconds: micros));
      expect(
        _position(tester).pixels,
        closeTo((12 * elapsedMicros / 1000000) % 697.6, .001),
      );
      expect(
        find
            .descendant(of: _ring, matching: find.byType(InkWell))
            .evaluate()
            .length,
        lessThanOrEqualTo(6),
      );
      expect(tester.takeException(), isNull);
    }
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('motion preferences can change while mounted', (tester) async {
    await _start(tester, _app());
    await tester.pump(const Duration(seconds: 1));
    await _start(tester, _app(reduced: true));
    final stopped = _position(tester).pixels;
    await tester.pump(const Duration(seconds: 10));
    expect(_position(tester).pixels, stopped);
    await _start(tester, _app());
    await tester.pump(const Duration(seconds: 1));
    expect(_position(tester).pixels, closeTo(stopped + 12, .001));
    await _start(tester, _app(accessible: true));
    expect(_ring, findsNothing);
    await _start(tester, _app());
    expect(_ring, findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    testWidgets('ring geometry and native gestures on $platform', (
      tester,
    ) async {
      await _start(
        tester,
        _app(platform: platform, categories: _categories.take(4).toList()),
      );
      for (var step = 0; step < 30; step++) {
        await tester.pump(const Duration(seconds: 1));
        final circles = find.descendant(
          of: _ring,
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration! as BoxDecoration).shape == BoxShape.circle,
          ),
        );
        final rectangles =
            circles
                .evaluate()
                .map((element) => tester.getRect(find.byWidget(element.widget)))
                .toList()
              ..sort((a, b) => a.left.compareTo(b.left));
        for (var i = 0; i < rectangles.length; i++) {
          expect(rectangles[i].width, closeTo(67.2, .001));
          expect(rectangles[i].height, closeTo(67.2, .001));
          if (i > 0) {
            expect(
              rectangles[i].left - rectangles[i - 1].right,
              closeTo(20, .001),
            );
          }
        }
        for (final icon in tester.widgetList<Icon>(
          find.descendant(of: _ring, matching: find.byType(Icon)),
        )) {
          expect(icon.size, closeTo(38.4, .001));
        }
        expect(tester.takeException(), isNull);
      }
      await tester.fling(_ring, const Offset(250, 0), 800);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('empty, single and fitting lists stay still', (tester) async {
    for (final count in [0, 1, 2, 3]) {
      await _start(tester, _app(categories: _categories.take(count).toList()));
      expect(_ring, findsNothing);
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 20));
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.takeException(), isNull);
    }
  });
  testWidgets(
    'pauses offscreen, in background, behind routes and in inactive branches',
    (tester) async {
      final vertical = ScrollController();
      addTearDown(vertical.dispose);
      final navigator = GlobalKey<NavigatorState>();
      Widget app({bool enabled = true}) =>
          _app(vertical: vertical, navigatorKey: navigator, enabled: enabled);
      await _start(tester, app());
      await tester.pump(const Duration(seconds: 1));
      vertical.jumpTo(700);
      await tester.pump();
      final hidden = _position(tester).pixels;
      await tester.pump(const Duration(seconds: 20));
      expect(_position(tester).pixels, hidden);
      vertical.jumpTo(0);
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(_position(tester).pixels, isNot(hidden));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final paused = _position(tester).pixels;
      await tester.pump(const Duration(seconds: 20));
      expect(_position(tester).pixels, paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(_position(tester).pixels, closeTo((paused + 12) % 697.6, .001));
      navigator.currentState!.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Other')),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      final state = tester.state<ScrollableState>(
        find.descendant(
          of: find.byType(CustomScrollView, skipOffstage: false),
          matching: find.byType(Scrollable, skipOffstage: false),
        ),
      );
      final covered = state.position.pixels;
      await tester.pump(const Duration(seconds: 20));
      expect(state.position.pixels, covered);
      navigator.currentState!.pop();
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));
      expect(_position(tester).pixels, isNot(covered));
      await _start(tester, app(enabled: false));
      final inactive = _position(tester).pixels;
      await tester.pump(const Duration(seconds: 20));
      expect(_position(tester).pixels, inactive);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 20));
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'API updates, resize, text scale and locale retain valid layout and anchor',
    (tester) async {
      await _start(tester, _app());
      await tester.pump(const Duration(seconds: 1));
      final anchor = tester.getRect(_item(0));
      await _start(
        tester,
        _app(
          categories: [
            ..._categories,
            const Category(id: '8', nameEn: 'New', nameAr: 'جديد'),
          ],
        ),
      );
      expect(tester.getRect(_item(0)).left, closeTo(anchor.left, .001));
      for (final language in ['ar', 'en']) {
        for (final width in [280.0, 320.0, 600.0, 800.0]) {
          for (final scale in [1.0, 1.5, 2.0]) {
            await _start(
              tester,
              _app(language: language, width: width, scale: scale),
            );
            await tester.pump(const Duration(milliseconds: 100));
            expect(tester.takeException(), isNull);
          }
        }
      }
      await _start(tester, _app(categories: []));
      await _start(tester, _app(categories: _categories.reversed.toList()));
      await tester.tap(
        find
            .descendant(of: _ring, matching: find.byType(InkWell))
            .hitTestable()
            .first,
      );
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 10));
      expect(tester.takeException(), isNull);
    },
  );
}

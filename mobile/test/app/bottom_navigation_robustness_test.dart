import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/components/navigation_themes.dart';

List<CustomerNavigationDestination> _destinations(int count) => [
  for (var i = 0; i < count; i++)
    (
      id: i,
      icon: Icons.home_outlined,
      selectedIcon: Icons.home,
      label: 'Tab $i',
      badge: 0,
    ),
];

final _surface = find.byKey(const ValueKey('bottom-nav-surface'));
final _capsule = find.byKey(const ValueKey('bottom-nav-capsule'));
final _tabs = find.byType(InkWell);

void main() {
  for (final direction in TextDirection.values) {
    testWidgets('fixed slots shrink with tab count across windows $direction', (
      tester,
    ) async {
      addTearDown(() => tester.binding.setSurfaceSize(null));
      // Measured five-tab reference before the change on a 390dp phone.
      const referenceSlot = 71.808;
      const naturalWidths = [71.808, 143.616, 215.424, 287.232, 359.04];
      for (final width in [320.0, 360.0, 390.0, 430.0, 599.0, 600.0, 1024.0]) {
        await tester.binding.setSurfaceSize(Size(width, 844));
        for (final count in [1, 2, 3, 4, 5, 4, 3, 2, 1]) {
          var selected = count - 1;
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light(const Brand.bundled()),
              home: Directionality(
                textDirection: direction,
                child: StatefulBuilder(
                  builder: (context, setState) => Scaffold(
                    bottomNavigationBar: CustomerBottomNavigation(
                      destinations: _destinations(count),
                      selectedIndex: selected,
                      onSelected: (value) => setState(() => selected = value),
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final surface = tester.getRect(_surface);
          final compressed = count == 5 && width < 390;
          final expectedWidth = compressed
              ? width - 16
              : naturalWidths[count - 1];
          expect(surface.width, closeTo(expectedWidth, .001));
          expect(surface.width, lessThanOrEqualTo(359.04));
          expect(surface.height, 64);
          expect(surface.center.dx, closeTo(width / 2, .001));
          expect(surface.bottom, 840);
          expect(_tabs, findsNWidgets(count));
          for (var i = 0; i < count; i++) {
            final target = tester.getRect(_tabs.at(i));
            expect(
              target.width,
              closeTo(compressed ? expectedWidth / count : referenceSlot, .001),
            );
            expect(target.width, greaterThanOrEqualTo(48));
            // Keep the existing vertical hit area and system-bar clearance.
            expect(target.height, 44);
            expect(surface.contains(target.center), isTrue);
            await tester.tap(_tabs.at(i));
            await tester.pumpAndSettle();
            expect(selected, i);
            final selectedCenter = tester.getCenter(_capsule);
            expect(selectedCenter.dx, closeTo(target.center.dx, .001));
            expect(selectedCenter.dy, closeTo(target.center.dy, .001));
          }
          if (!compressed) {
            expect(tester.getSize(_capsule).width, closeTo(59.808, .001));
            expect(tester.getSize(_capsule).height, 52);
          }
          expect(tester.takeException(), isNull);
        }
      }
    });
  }

  test('approved design tokens and bounded visual capsules', () {
    expect(NavigationThemes.bottomBarMinDestinations, 1);
    expect(NavigationThemes.bottomBarMaxDestinations, 5);
    expect(NavigationThemes.bottomBarHeight, 64);
    expect(NavigationThemes.bottomBarMaxWidth, 359.04);
    expect(NavigationThemes.bottomBarMinimumInteractiveHeight, 44);
    expect(NavigationThemes.bottomBarIconSize, 28);
    expect(NavigationThemes.bottomBarSelectedScale, 1.11);
    for (final count in [1, 2, 3, 4, 5]) {
      final minimum = NavigationThemes.bottomBarMinimumSafeWidth(count);
      for (final width in [minimum, 264.0, 560.0, 1024.0]) {
        final geometry = NavigationThemes.bottomBarGeometry(width, count);
        expect(geometry.barWidth, lessThanOrEqualTo(359.04));
        expect(geometry.slotWidth, greaterThanOrEqualTo(44));
        for (final size in [geometry.selected, geometry.pressed]) {
          expect(size.width.isFinite && size.height.isFinite, isTrue);
          expect(size.width, inInclusiveRange(size.height, geometry.slotWidth));
          expect(size.width / size.height, lessThanOrEqualTo(2.2));
          expect(
            size.height,
            lessThanOrEqualTo(NavigationThemes.bottomBarHeight),
          );
        }
      }
      for (final width in [
        -1.0,
        0.0,
        minimum - .01,
        double.infinity,
        double.nan,
      ]) {
        expect(
          () => NavigationThemes.bottomBarGeometry(width, count),
          throwsA(
            isA<FlutterError>().having(
              (error) => error.toString(),
              'message',
              contains('safe available width'),
            ),
          ),
        );
      }
    }
    final tablet = NavigationThemes.bottomBarGeometry(1024, 2);
    expect(tablet.slotWidth, closeTo(71.808, .001));
    expect(tablet.selected.width, closeTo(59.808, .001));
    expect(tablet.pressed.width, closeTo(67.608, .001));
  });

  for (final count in [0, 6, 7, 64, 1000]) {
    test('$count destinations are invalid configuration, never truncated', () {
      expect(
        () => CustomerBottomNavigation(
          destinations: _destinations(count),
          selectedIndex: 0,
          onSelected: (_) {},
        ),
        throwsA(
          isA<AssertionError>().having(
            (error) => error.toString(),
            'message',
            contains('1–5 top-level destinations'),
          ),
        ),
      );
      // Geometry also enforces the contract when assertions are disabled.
      expect(
        () => NavigationThemes.bottomBarGeometry(1024, count),
        throwsA(
          isA<FlutterError>().having(
            (error) => error.toString(),
            'message',
            contains('1–5 top-level destinations'),
          ),
        ),
      );
    });
  }

  testWidgets(
    'empty runtime fallback disposes gestures without supporting zero tabs',
    (tester) async {
      var destinations = _destinations(5);
      var callbacks = 0;
      Future<void> pumpBar() => tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(const Brand.bundled()),
          home: Scaffold(
            bottomNavigationBar: CustomerBottomNavigation(
              destinations: destinations,
              selectedIndex: destinations.length - 1,
              onSelected: (_) => callbacks++,
            ),
          ),
        ),
      );
      await pumpBar();
      for (final nextCount in [1, 2, 3, 4, 5]) {
        final press = await tester.startGesture(tester.getCenter(_tabs.last));
        await tester.pump(const Duration(milliseconds: 120));
        // Bypass construction validation only to exercise the release safeguard:
        // zero remains an invalid configuration, tested separately above.
        destinations.clear();
        tester.element(find.byType(CustomerBottomNavigation)).markNeedsBuild();
        await tester.pump();
        expect(_surface, findsNothing);
        expect(_tabs, findsNothing);
        await press.up();
        await tester.pumpAndSettle();
        expect(callbacks, 0);
        destinations = _destinations(nextCount);
        await pumpBar();
        await tester.pumpAndSettle();
        expect(_tabs, findsNWidgets(nextCount));
        expect(
          tester.getCenter(_capsule).dx,
          closeTo(tester.getCenter(_tabs.last).dx, .01),
        );
        for (final tab in tester.widgetList<InkWell>(_tabs)) {
          expect(
            tab.statesController!.value,
            isNot(contains(WidgetState.pressed)),
          );
        }
        expect(tester.takeException(), isNull);
      }
    },
  );

  for (final count in [1, 2, 3, 4, 5]) {
    testWidgets('$count tabs reject insufficient parent width and recover', (
      tester,
    ) async {
      final minimum = NavigationThemes.bottomBarMinimumSafeWidth(count);
      Future<void> pumpWidth(double safeWidth) => tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(const Brand.bundled()),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(800, 600)),
            child: Center(
              child: SizedBox(
                width: safeWidth + 16, // Fixed navigation gutters, 8 per side.
                child: CustomerBottomNavigation(
                  destinations: _destinations(count),
                  selectedIndex: 0,
                  onSelected: (_) {},
                ),
              ),
            ),
          ),
        ),
      );
      await pumpWidth(minimum - 1);
      expect(
        tester.takeException(),
        isA<FlutterError>().having(
          (error) => error.toString(),
          'message',
          contains('44×44 touch targets'),
        ),
      );
      expect(_tabs, findsNothing);
      await pumpWidth(minimum + .01);
      await tester.pumpAndSettle();
      expect(_tabs, findsNWidgets(count));
      for (var i = 0; i < count; i++) {
        final size = tester.getSize(_tabs.at(i));
        expect(size.width, greaterThanOrEqualTo(44));
        expect(size.height, greaterThanOrEqualTo(44));
      }
      expect(tester.takeException(), isNull);
    });
  }

  for (final direction in TextDirection.values) {
    testWidgets('rapid retarget, cancel and keyboard actions $direction', (
      tester,
    ) async {
      var selected = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(const Brand.bundled()),
          home: Directionality(
            textDirection: direction,
            child: StatefulBuilder(
              builder: (context, setState) => Scaffold(
                bottomNavigationBar: CustomerBottomNavigation(
                  destinations: _destinations(5),
                  selectedIndex: selected,
                  onSelected: (value) => setState(() => selected = value),
                ),
              ),
            ),
          ),
        ),
      );
      for (final index in [4, 1, 3, 0, 4, 2, 2]) {
        await tester.tap(_tabs.at(index));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 30));
        expect(selected, index);
      }
      await tester.pumpAndSettle();
      expect(tester.getCenter(_capsule).dx, tester.getCenter(_tabs.at(2)).dx);
      final press = await tester.startGesture(tester.getCenter(_tabs.last));
      await tester.pump(const Duration(milliseconds: 120));
      await press.cancel();
      await tester.pumpAndSettle();
      expect(selected, 2);
      for (final tab in tester.widgetList<InkWell>(_tabs)) {
        expect(
          tab.statesController!.value,
          isNot(contains(WidgetState.pressed)),
        );
      }
      // Logical tab traversal follows destination order in either direction.
      FocusManager.instance.primaryFocus?.unfocus();
      for (var index = 0; index < 5; index++) {
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pump();
        expect(
          tester.widget<InkWell>(_tabs.at(index)).statesController!.value,
          contains(WidgetState.focused),
        );
        await tester.sendKeyEvent(LogicalKeyboardKey.enter);
        await tester.pumpAndSettle();
        expect(selected, index);
      }
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.takeException(), isNull);
    });

    for (final count in [1, 2, 3, 4, 5]) {
      testWidgets(
        '$count landscape tabs retain safe margins and adjacent hit edges $direction',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(1024, 390);
          addTearDown(tester.view.reset);
          final selections = <int>[];
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.dark(const Brand.bundled()),
              home: MediaQuery(
                data: const MediaQueryData(
                  size: Size(1024, 390),
                  padding: EdgeInsets.only(left: 44, right: 24),
                  viewPadding: EdgeInsets.only(left: 44, right: 24, bottom: 21),
                  systemGestureInsets: EdgeInsets.only(
                    left: 16,
                    right: 16,
                    bottom: 34,
                  ),
                  textScaler: TextScaler.linear(3),
                ),
                child: Directionality(
                  textDirection: direction,
                  child: Scaffold(
                    bottomNavigationBar: CustomerBottomNavigation(
                      destinations: _destinations(count),
                      selectedIndex: 0,
                      onSelected: selections.add,
                    ),
                  ),
                ),
              ),
            ),
          );
          final bar = tester.getRect(_surface);
          expect(bar.width, closeTo(71.808 * count, .01));
          expect(bar.center.dx, (44 + 1024 - 24) / 2);
          expect(bar.left, greaterThanOrEqualTo(44));
          expect(bar.right, lessThanOrEqualTo(1000));
          for (var i = 0; i < count; i++) {
            final rect = tester.getRect(_tabs.at(i));
            expect(rect.width, greaterThanOrEqualTo(44));
            expect(rect.height, greaterThanOrEqualTo(44));
            expect(rect.bottom, lessThanOrEqualTo(390 - 34));
            await tester.tapAt(Offset(rect.left + .1, rect.center.dy));
            await tester.tapAt(Offset(rect.right - .1, rect.center.dy));
            expect(selections.sublist(i * 2), [i, i]);
            if (i > 0) {
              final previous = tester.getRect(_tabs.at(i - 1));
              expect(
                direction == TextDirection.ltr ? previous.right : previous.left,
                closeTo(
                  direction == TextDirection.ltr ? rect.left : rect.right,
                  .01,
                ),
              );
            }
          }
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}

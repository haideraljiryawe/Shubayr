import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/components/navigation_themes.dart';

void main() {
  for (final scenario in [
    (
      name: 'Android three-button',
      platform: TargetPlatform.android,
      inset: 48.0,
      gesture: 0.0,
      offset: 52.0,
    ),
    (
      name: 'Android gestures',
      platform: TargetPlatform.android,
      inset: 24.0,
      gesture: 24.0,
      offset: 28.0,
    ),
    (
      name: 'Android larger gesture exclusion',
      platform: TargetPlatform.android,
      inset: 21.0,
      gesture: 32.0,
      offset: 36.0,
    ),
    (
      name: 'Android without bottom inset',
      platform: TargetPlatform.android,
      inset: 0.0,
      gesture: 0.0,
      offset: 4.0,
    ),
    (
      name: 'iOS home indicator',
      platform: TargetPlatform.iOS,
      inset: 34.0,
      gesture: 0.0,
      offset: 24.0,
    ),
    (
      name: 'iOS landscape indicator',
      platform: TargetPlatform.iOS,
      inset: 21.0,
      gesture: 0.0,
      offset: 11.0,
    ),
  ]) {
    testWidgets(
      '${scenario.name} preserves content height and applies one bottom inset',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(402, 874));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        for (final keyboard in [0.0, 300.0, 0.0]) {
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light(
                const Brand.bundled(),
              ).copyWith(platform: scenario.platform),
              home: MediaQuery(
                data: MediaQueryData(
                  size: const Size(402, 874),
                  padding: EdgeInsets.only(
                    bottom: keyboard == 0 ? scenario.inset : 0,
                  ),
                  viewPadding: EdgeInsets.only(bottom: scenario.inset),
                  systemGestureInsets: EdgeInsets.only(
                    bottom: scenario.gesture,
                  ),
                  viewInsets: EdgeInsets.only(bottom: keyboard),
                ),
                child: Scaffold(
                  extendBody: true,
                  body: const SizedBox.expand(),
                  bottomNavigationBar: CustomerBottomNavigation(
                    destinations: [
                      for (var i = 0; i < 3; i++)
                        (
                          id: i,
                          icon: Icons.home_outlined,
                          selectedIcon: Icons.home,
                          label: 'Destination $i',
                          badge: 0,
                        ),
                    ],
                    selectedIndex: 0,
                    onSelected: (_) {},
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final surface = tester.getRect(
            find.byKey(const ValueKey('bottom-nav-surface')),
          );
          final bar = tester.getRect(find.byType(CustomerBottomNavigation));
          expect(surface.height, 64);
          expect(surface.bottom, 874 - scenario.offset);
          expect(bar.height, 64 + scenario.offset);
          expect(bar.bottom, 874);
          final tabs = find.descendant(
            of: find.byType(CustomerBottomNavigation),
            matching: find.byType(InkWell),
          );
          for (var i = 0; i < 3; i++) {
            final target = tester.getRect(tabs.at(i));
            expect(target.height, 44);
            expect(target.center.dy, surface.center.dy);
            expect(
              target.bottom,
              lessThanOrEqualTo(
                874 - math.max(scenario.inset, scenario.gesture),
              ),
            );
          }
          expect(tester.takeException(), isNull);
        }
      },
    );
  }

  for (final count in [2, 3, 4, 5]) {
    for (final width in [
      280.0,
      320.0,
      360.0,
      390.0,
      402.0,
      430.0,
      600.0,
      800.0,
    ]) {
      testWidgets(
        '$count destinations width=$width keep taps above both system exclusions',
        (tester) async {
          await tester.binding.setSurfaceSize(Size(width, 844));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          final semantics = tester.ensureSemantics();
          try {
            for (final viewInset in [
              0.0,
              8.0,
              16.0,
              21.0,
              24.0,
              34.0,
              48.0,
              60.0,
            ]) {
              for (final gestureInset in [
                0.0,
                8.0,
                16.0,
                21.0,
                24.0,
                34.0,
                48.0,
                60.0,
              ]) {
                final selections = <int>[];
                await tester.pumpWidget(
                  MaterialApp(
                    theme: AppTheme.light(const Brand.bundled()),
                    home: MediaQuery(
                      data: MediaQueryData(
                        size: Size(width, 844),
                        viewPadding: EdgeInsets.only(bottom: viewInset),
                        systemGestureInsets: EdgeInsets.only(
                          bottom: gestureInset,
                        ),
                      ),
                      child: Scaffold(
                        extendBody: true,
                        body: const SizedBox.expand(),
                        bottomNavigationBar: CustomerBottomNavigation(
                          destinations: [
                            for (var i = 0; i < count; i++)
                              (
                                id: i,
                                icon: Icons.home_outlined,
                                selectedIcon: Icons.home,
                                label: 'Destination $i',
                                badge: 0,
                              ),
                          ],
                          selectedIndex: 0,
                          onSelected: selections.add,
                        ),
                      ),
                    ),
                  ),
                );
                await tester.pumpAndSettle();
                final bar = tester.getRect(
                  find.byKey(const ValueKey('bottom-nav-surface')),
                );
                final safeBoundary = 844 - math.max(viewInset, gestureInset);
                expect(
                  bar.height,
                  closeTo(NavigationThemes.bottomBarHeight, .01),
                );
                expect(bar.bottom, lessThanOrEqualTo(844));
                expect(bar.top, greaterThanOrEqualTo(0));
                // Android leaves a 4px gap above the full system exclusion.
                expect(bar.bottom, closeTo(safeBoundary - 4, .01));
                for (var i = 0; i < count; i++) {
                  final destination = find.bySemanticsLabel('Destination $i');
                  final target = tester.getRect(destination);
                  expect(
                    target.height,
                    closeTo(
                      NavigationThemes.bottomBarMinimumInteractiveHeight,
                      .01,
                    ),
                  );
                  expect(target.width, closeTo(bar.width / count, .01));
                  expect(target.width, greaterThanOrEqualTo(44));
                  expect(target.center.dy, closeTo(bar.center.dy, .01));
                  expect(
                    target.top - bar.top,
                    closeTo(NavigationThemes.bottomBarSafeVisualOverlap, .01),
                  );
                  expect(
                    bar.bottom - target.bottom,
                    closeTo(NavigationThemes.bottomBarSafeVisualOverlap, .01),
                  );
                  expect(target.bottom, lessThanOrEqualTo(safeBoundary + .01));
                  expect(
                    tester.getSemantics(destination).rect.height,
                    closeTo(
                      NavigationThemes.bottomBarMinimumInteractiveHeight,
                      .01,
                    ),
                  );
                }
                final last = tester.getRect(
                  find.bySemanticsLabel('Destination ${count - 1}'),
                );
                // Both visual margins reject touches. No navigation callback
                // is emitted outside the centered interactive strip.
                await tester.tapAt(Offset(last.center.dx, bar.bottom - 1));
                await tester.tapAt(Offset(last.center.dx, bar.top + 1));
                await tester.pump();
                expect(selections, isEmpty);
                // The lowest safe point and the horizontal slot edge still work.
                await tester.tapAt(Offset(last.center.dx, last.bottom - 1));
                await tester.tapAt(Offset(last.left + 1, last.center.dy));
                await tester.pumpAndSettle();
                expect(selections, [count - 1, count - 1]);
                expect(tester.takeException(), isNull);
              }
            }
          } finally {
            semantics.dispose();
          }
        },
      );
    }
  }
}

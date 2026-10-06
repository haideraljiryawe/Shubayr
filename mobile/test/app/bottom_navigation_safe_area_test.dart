import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';

void main() {
  for (final count in [1, 2, 3, 4, 5, 6]) {
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
            for (final viewInset in [0.0, 8.0, 21.0, 34.0, 48.0]) {
              for (final gestureInset in [0.0, 8.0, 21.0, 34.0, 48.0]) {
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
                expect(bar.height, closeTo(67.6, .01));
                expect(bar.bottom, lessThanOrEqualTo(844));
                expect(bar.top, greaterThanOrEqualTo(0));
                // The visible overlap is limited to decoration, never more than
                // 11.8px, and cannot move the surface outside a zero-inset screen.
                expect(bar.bottom - safeBoundary, inInclusiveRange(0, 11.8 + .01));
                for (var i = 0; i < count; i++) {
                  final destination = find.bySemanticsLabel('Destination $i');
                  final target = tester.getRect(destination);
                  expect(target.height, closeTo(44, .01));
                  expect(target.width, closeTo(bar.width / count, .01));
                  expect(target.width, greaterThanOrEqualTo(28 * 1.10));
                  expect(target.center.dy, closeTo(bar.center.dy, .01));
                  expect(target.top - bar.top, closeTo(11.8, .01));
                  expect(bar.bottom - target.bottom, closeTo(11.8, .01));
                  expect(target.bottom, lessThanOrEqualTo(safeBoundary + .01));
                  expect(
                    tester.getSemantics(destination).rect.height,
                    closeTo(44, .01),
                  );
                }
                final last = tester.getRect(
                  find.bySemanticsLabel('Destination ${count - 1}'),
                );
                // Both visual margins reject touches, including the lower margin
                // overlapping the system area. No navigation callback is emitted.
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

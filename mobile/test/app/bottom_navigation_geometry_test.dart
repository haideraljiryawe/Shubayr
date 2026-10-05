import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/layout/app_layout.dart';

Rect _paintedRect(WidgetTester tester, Finder finder) {
  final box = tester.renderObject<RenderBox>(finder);
  return MatrixUtils.transformRect(
    box.getTransformTo(null),
    Offset.zero & box.size,
  );
}

void main() {
  setUpAll(() async {
    final fonts = FontLoader('Cairo');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Cairo-$weight.ttf'));
    }
    await fonts.load();
  });
  for (final count in [3, 4, 5]) {
    for (final rtl in [false, true]) {
      for (final dark in [false, true]) {
        for (final width in [
          320.0,
          360.0,
          390.0,
          430.0,
          600.0,
          800.0,
          1200.0,
        ]) {
          testWidgets(
            '$count destinations rtl=$rtl dark=$dark width=$width retain capsule clearance',
            (tester) async {
              await tester.binding.setSurfaceSize(Size(width, 844));
              addTearDown(() => tester.binding.setSurfaceSize(null));
              for (final scale in [1.0, 1.5, 2.0]) {
                for (final inset in [0.0, 8.0, 21.0, 34.0, 48.0]) {
                  var selected = 0;
                  await tester.pumpWidget(
                    MaterialApp(
                      theme: dark
                          ? AppTheme.dark(const Brand.bundled())
                          : AppTheme.light(const Brand.bundled()),
                      home: MediaQuery(
                        data: MediaQueryData(
                          size: Size(width, 844),
                          textScaler: TextScaler.linear(scale),
                          viewPadding: EdgeInsets.only(bottom: inset),
                        ),
                        child: Directionality(
                          textDirection: rtl
                              ? TextDirection.rtl
                              : TextDirection.ltr,
                          child: StatefulBuilder(
                            builder: (context, setState) => Scaffold(
                              extendBody: true,
                              body: const SizedBox.expand(),
                              bottomNavigationBar: CustomerBottomNavigation(
                                destinations: [
                                  for (var i = 0; i < count; i++)
                                    (
                                      id: i,
                                      icon: Icons.home_outlined,
                                      selectedIcon: Icons.home,
                                      label: rtl
                                          ? [
                                              'الرئيسية',
                                              'الأقسام',
                                              'السلة',
                                              'طلباتي',
                                              'حسابي',
                                            ][i]
                                          : [
                                              'Home',
                                              'Categories',
                                              'Cart',
                                              'Orders',
                                              'Account',
                                            ][i],
                                      badge: 0,
                                    ),
                                ],
                                selectedIndex: selected,
                                onSelected: (value) =>
                                    setState(() => selected = value),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                  await tester.pumpAndSettle();
                  final surface = tester.getRect(
                    find.byKey(const ValueKey('bottom-nav-surface')),
                  );
                  final tabs = find.descendant(
                    of: find.byType(CustomerBottomNavigation),
                    matching: find.byType(InkWell),
                  );
                  expect(tabs, findsNWidgets(count));
                  expect(surface.bottom, 844 - inset - 4);
                  final gutter = width < 600 ? 8.0 : 16.0;
                  expect(
                    surface.width,
                    closeTo((width - 2 * gutter).clamp(0, 760), .01),
                  );
                  expect(surface.center.dx, closeTo(width / 2, .01));
                  for (final index in {0, count ~/ 2, count - 1}) {
                    await tester.tap(tabs.at(index));
                    await tester.pumpAndSettle();
                    final slot = tester.getRect(tabs.at(index));
                    final capsuleFinder = find.byKey(
                      const ValueKey('bottom-nav-capsule'),
                    );
                    final capsule = tester.getRect(capsuleFinder);
                    expect(slot.width, closeTo(surface.width / count, .01));
                    expect(capsule.left - slot.left, closeTo(4, .01));
                    expect(slot.right - capsule.right, closeTo(4, .01));
                    expect(capsule.top - slot.top, closeTo(4, .01));
                    expect(slot.bottom - capsule.bottom, closeTo(4, .01));
                    final decoration =
                        tester.widget<DecoratedBox>(capsuleFinder).decoration
                            as BoxDecoration;
                    final shape = decoration.borderRadius!
                        .resolve(TextDirection.ltr)
                        .toRRect(capsule);
                    expect(shape.tlRadiusX, 22);
                    for (final type in [Icon, Text]) {
                      final content = _paintedRect(
                        tester,
                        find.descendant(
                          of: tabs.at(index),
                          matching: find.byType(type),
                        ),
                      );
                      expect(
                        content.left - capsule.left,
                        greaterThanOrEqualTo(7.99),
                      );
                      expect(
                        capsule.right - content.right,
                        greaterThanOrEqualTo(7.99),
                      );
                      expect(
                        content.top - capsule.top,
                        greaterThanOrEqualTo(5.99),
                      );
                      expect(
                        capsule.bottom - content.bottom,
                        greaterThanOrEqualTo(5.99),
                      );
                      for (final point in [
                        content.topLeft,
                        content.topRight,
                        content.bottomLeft,
                        content.bottomRight,
                      ]) {
                        expect(
                          shape.contains(point),
                          isTrue,
                          reason: '$type: $content in $shape',
                        );
                      }
                    }
                    expect(
                      tester.getRect(
                        find.byKey(const ValueKey('bottom-nav-surface')),
                      ),
                      surface,
                    );
                    expect(tester.takeException(), isNull);
                  }
                }
              }
            },
          );
        }
      }
    }
  }
  for (final count in [3, 4, 5]) {
    testWidgets(
      '$count tabs respect parent constraints and consumed/unconsumed side insets',
      (tester) async {
        for (final width in [
          320.0,
          360.0,
          390.0,
          430.0,
          600.0,
          800.0,
          1200.0,
        ]) {
          await tester.binding.setSurfaceSize(Size(width, 844));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          for (final (safeLeft, safeRight) in [
            (0.0, 0.0),
            (44.0, 0.0),
            (0.0, 48.0),
            (24.0, 34.0),
          ]) {
            for (final consumed in [false, true]) {
              for (final direction in [TextDirection.ltr, TextDirection.rtl]) {
                var selected = 0;
                await tester.pumpWidget(
                  MaterialApp(
                    theme: AppTheme.light(const Brand.bundled()),
                    home: MediaQuery(
                      data: MediaQueryData(
                        size: Size(width, 844),
                        // Test viewPadding independently: it can exceed padding.
                        padding: consumed
                            ? EdgeInsets.only(left: safeLeft, right: safeRight)
                            : EdgeInsets.zero,
                        viewPadding: EdgeInsets.only(
                          left: safeLeft,
                          right: safeRight,
                        ),
                      ),
                      child: Directionality(
                        textDirection: direction,
                        child: SafeArea(
                          top: false,
                          bottom: false,
                          left: consumed,
                          right: consumed,
                          child: StatefulBuilder(
                            builder: (context, setState) => Scaffold(
                              body: Padding(
                                padding: AppLayout.pageInsets(context),
                                child: const ResponsiveContent(
                                  child: SizedBox(
                                    key: ValueKey('reference-content'),
                                    width: double.infinity,
                                    height: 80,
                                  ),
                                ),
                              ),
                              bottomNavigationBar: CustomerBottomNavigation(
                                destinations: [
                                  for (var i = 0; i < count; i++)
                                    (
                                      id: i,
                                      icon: Icons.home_outlined,
                                      selectedIcon: Icons.home,
                                      label: 'Tab $i',
                                      badge: 0,
                                    ),
                                ],
                                selectedIndex: selected,
                                onSelected: (index) =>
                                    setState(() => selected = index),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                );
                await tester.pumpAndSettle();
                final bar = tester.getRect(
                  find.byKey(const ValueKey('bottom-nav-surface')),
                );
                final gutter = width < 600 ? 8.0 : 16.0;
                final left = consumed
                    ? safeLeft + gutter
                    : math.max(safeLeft, gutter);
                final right = consumed
                    ? safeRight + gutter
                    : math.max(safeRight, gutter);
                expect(
                  bar.width,
                  closeTo(math.min(width - left - right, 760), .01),
                );
                expect(bar.center.dx, closeTo((left + width - right) / 2, .01));
                expect(bar.left, greaterThanOrEqualTo(safeLeft));
                expect(bar.right, lessThanOrEqualTo(width - safeRight));
                if (consumed) {
                  // The actual app consumes device insets above the Navigator:
                  // page gutters and the floating bar must then align exactly.
                  final content = tester.getRect(
                    find.byKey(const ValueKey('reference-content')),
                  );
                  expect(bar.left, closeTo(content.left, .01));
                  expect(bar.right, closeTo(content.right, .01));
                }
                final tabs = find.descendant(
                  of: find.byType(CustomerBottomNavigation),
                  matching: find.byType(InkWell),
                );
                for (var i = 0; i < count; i++) {
                  expect(
                    tester.getSize(tabs.at(i)).width,
                    greaterThanOrEqualTo(48),
                  );
                  expect(
                    tester.getSize(tabs.at(i)).height,
                    greaterThanOrEqualTo(48),
                  );
                  await tester.tap(tabs.at(i));
                  await tester.pumpAndSettle();
                  expect(
                    tester
                        .getCenter(
                          find.byKey(const ValueKey('bottom-nav-capsule')),
                        )
                        .dx,
                    closeTo(tester.getCenter(tabs.at(i)).dx, .01),
                  );
                }
                expect(tester.takeException(), isNull);
              }
            }
          }
        }
      },
    );
  }

  testWidgets('bar follows a narrow parent inside a wide window', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(1200, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(const Brand.bundled()),
        home: Center(
          child: SizedBox(
            width: 390,
            child: CustomerBottomNavigation(
              destinations: [
                for (var i = 0; i < 4; i++)
                  (
                    id: i,
                    icon: Icons.home_outlined,
                    selectedIcon: Icons.home,
                    label: 'Tab $i',
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
    final bar = tester.getRect(
      find.byKey(const ValueKey('bottom-nav-surface')),
    );
    // A wide window uses the shared 16px gutter, but width comes from its parent.
    expect(bar.width, 358);
    expect(bar.center.dx, 600);
    expect(tester.takeException(), isNull);
  });
}

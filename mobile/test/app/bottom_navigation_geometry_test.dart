import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/components/navigation_themes.dart';
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
    final fonts = FontLoader('Zain');
    for (final weight in ['Regular', 'Bold', 'ExtraBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Zain-$weight.ttf'));
    }
    await fonts.load();
  });
  for (final count in [2, 3, 4, 5]) {
    for (final rtl in [false, true]) {
      for (final dark in [false, true]) {
        for (final width in [
          280.0,
          320.0,
          360.0,
          375.0,
          390.0,
          402.0,
          430.0,
          480.0,
          600.0,
          768.0,
          800.0,
          1024.0,
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
                                              'المفضلة',
                                            ][i]
                                          : [
                                              'Home',
                                              'Categories',
                                              'Cart',
                                              'Orders',
                                              'Account',
                                              'Wishlist',
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
                  expect(
                    surface.bottom,
                    closeTo(
                      844 -
                          math.max(
                            0,
                            inset - NavigationThemes.bottomBarSafeVisualOverlap,
                          ),
                      .01,
                    ),
                  );
                  final gutter = width < 600 ? 8.0 : 16.0;
                  final geometry = NavigationThemes.bottomBarGeometry(
                    width - 2 * gutter,
                    count,
                  );
                  expect(surface.width, closeTo(geometry.barWidth, .01));
                  expect(surface.width, lessThanOrEqualTo(560));
                  expect(surface.center.dx, closeTo(width / 2, .01));
                  expect(
                    surface.height,
                    closeTo(NavigationThemes.bottomBarHeight, .01),
                  );
                  final material = tester.widget<Material>(
                    find.byKey(const ValueKey('bottom-nav-surface')),
                  );
                  final context = tester.element(
                    find.byKey(const ValueKey('bottom-nav-surface')),
                  );
                  expect(
                    material.color,
                    dark
                        ? Color.alphaBlend(
                            Colors.white.withValues(alpha: .08),
                            Theme.of(context).colorScheme.surface,
                          )
                        : Colors.white,
                  );
                  expect(material.color!.a, 1);
                  expect(find.byType(BackdropFilter), findsNothing);
                  final outer = (material.shape! as RoundedRectangleBorder)
                      .borderRadius
                      .resolve(TextDirection.ltr)
                      .toRRect(surface);
                  expect(outer.tlRadiusX, closeTo(surface.height / 2, .01));
                  expect(
                    find.descendant(of: tabs, matching: find.byType(Text)),
                    findsNothing,
                  );
                  for (var index = 0; index < count; index++) {
                    await tester.tap(tabs.at(index));
                    await tester.pumpAndSettle();
                    final slot = tester.getRect(tabs.at(index));
                    final capsuleFinder = find.byKey(
                      const ValueKey('bottom-nav-capsule'),
                    );
                    final capsule = tester.getRect(capsuleFinder);
                    final stateLayer = find.descendant(
                      of: tabs.at(index),
                      matching: find.byKey(
                        const ValueKey('bottom-nav-state-layer'),
                      ),
                    );
                    final stateBounds = tester.getRect(stateLayer);
                    expect(stateBounds.width, greaterThan(capsule.width));
                    expect(stateBounds.height, greaterThan(capsule.height));
                    expect(stateBounds.width, lessThanOrEqualTo(slot.width));
                    expect(
                      stateBounds.height,
                      lessThanOrEqualTo(surface.height),
                    );
                    expect(
                      stateBounds.left - slot.left,
                      greaterThanOrEqualTo(2.1 - .01),
                    );
                    expect(
                      slot.right - stateBounds.right,
                      greaterThanOrEqualTo(2.1 - .01),
                    );
                    expect(
                      stateBounds.height,
                      closeTo(math.min(59, stateBounds.width), .01),
                    );
                    expect(
                      stateBounds.center.dx,
                      closeTo(capsule.center.dx, .01),
                    );
                    expect(
                      stateBounds.center.dy,
                      closeTo(capsule.center.dy, .01),
                    );
                    final stateClip = tester.widget<ClipRRect>(stateLayer);
                    expect(stateClip.clipBehavior, Clip.antiAlias);
                    expect(
                      stateClip.borderRadius
                          .resolve(TextDirection.ltr)
                          .topLeft
                          .x,
                      closeTo(stateBounds.height / 2, .01),
                    );
                    final pressedShape = stateClip.borderRadius
                        .resolve(TextDirection.ltr)
                        .toRRect(stateBounds);
                    final pressedPerimeter = (Path()..addRRect(pressedShape))
                        .computeMetrics()
                        .single;
                    for (var sample = 0; sample < 64; sample++) {
                      final point = pressedPerimeter
                          .getTangentForOffset(
                            pressedPerimeter.length * sample / 64,
                          )!
                          .position;
                      expect(
                        outer.deflate(.8).contains(point),
                        isTrue,
                        reason: 'pressed surface touches bar border at $point',
                      );
                    }
                    expect(slot.width, closeTo(surface.width / count, .01));
                    // Hit targets retain the full slot width with a centered
                    // minimum height; outer margins are decoration only.
                    expect(slot.width, greaterThanOrEqualTo(44));
                    expect(
                      slot.height,
                      closeTo(
                        NavigationThemes.bottomBarMinimumInteractiveHeight,
                        .01,
                      ),
                    );
                    expect(
                      slot.top - surface.top,
                      closeTo(NavigationThemes.bottomBarSafeVisualOverlap, .01),
                    );
                    expect(
                      surface.bottom - slot.bottom,
                      closeTo(NavigationThemes.bottomBarSafeVisualOverlap, .01),
                    );
                    expect(slot.bottom, lessThanOrEqualTo(844 - inset + .01));
                    expect(
                      capsule.width + .01,
                      greaterThanOrEqualTo(capsule.height),
                    );
                    expect(capsule.height, lessThanOrEqualTo(52.01));
                    expect(capsule.width, lessThanOrEqualTo(slot.width));
                    if (capsule.width >= 52) {
                      expect(capsule.height, closeTo(52, .01));
                    } else {
                      expect(capsule.height, closeTo(capsule.width, .01));
                    }
                    expect(
                      capsule.size.width,
                      closeTo(geometry.selected.width, .01),
                    );
                    expect(
                      capsule.size.height,
                      closeTo(geometry.selected.height, .01),
                    );
                    expect(
                      stateBounds.size.width,
                      closeTo(geometry.pressed.width, .01),
                    );
                    expect(
                      stateBounds.size.height,
                      closeTo(geometry.pressed.height, .01),
                    );
                    expect(
                      capsule.left - slot.left,
                      greaterThanOrEqualTo(
                        NavigationThemes.bottomBarSelectedSlotInset - .01,
                      ),
                    );
                    expect(
                      slot.right - capsule.right,
                      greaterThanOrEqualTo(
                        NavigationThemes.bottomBarSelectedSlotInset - .01,
                      ),
                    );
                    final verticalInset = (surface.height - capsule.height) / 2;
                    expect(
                      capsule.width / capsule.height,
                      lessThanOrEqualTo(
                        NavigationThemes.bottomBarSelectedMaxAspectRatio + .001,
                      ),
                    );
                    expect(
                      stateBounds.width / stateBounds.height,
                      lessThanOrEqualTo(
                        NavigationThemes.bottomBarPressedMaxAspectRatio + .001,
                      ),
                    );
                    expect(
                      capsule.top - surface.top,
                      closeTo(verticalInset, .01),
                    );
                    expect(
                      surface.bottom - capsule.bottom,
                      closeTo(verticalInset, .01),
                    );
                    for (var neighbor = 0; neighbor < count; neighbor++) {
                      if (neighbor != index) {
                        expect(
                          stateBounds.overlaps(
                            tester.getRect(tabs.at(neighbor)),
                          ),
                          isFalse,
                        );
                        expect(
                          capsule.overlaps(tester.getRect(tabs.at(neighbor))),
                          isFalse,
                        );
                      }
                    }
                    expect(capsule.center.dx, closeTo(slot.center.dx, .01));
                    expect(capsule.center.dy, closeTo(slot.center.dy, .01));
                    final decoration =
                        tester.widget<DecoratedBox>(capsuleFinder).decoration
                            as BoxDecoration;
                    final shape = decoration.borderRadius!
                        .resolve(TextDirection.ltr)
                        .toRRect(capsule);
                    expect(shape.tlRadiusX, closeTo(capsule.height / 2, .01));
                    expect(
                      shape.tlRadiusX,
                      closeTo(outer.tlRadiusX - verticalInset, .01),
                    );
                    // Check the actual curved outline, not its bounding-box
                    // corners, at the first/last slot as well as in the middle.
                    final perimeter = (Path()..addRRect(shape))
                        .computeMetrics()
                        .single;
                    for (var sample = 0; sample < 64; sample++) {
                      final point = perimeter
                          .getTangentForOffset(perimeter.length * sample / 64)!
                          .position;
                      expect(
                        outer.contains(point),
                        isTrue,
                        reason: 'indicator clipped at $point',
                      );
                    }
                    final content = _paintedRect(
                      tester,
                      find.descendant(
                        of: tabs.at(index),
                        matching: find.byType(Icon),
                      ),
                    );
                    expect(content.center.dx, closeTo(slot.center.dx, .01));
                    expect(content.center.dy, closeTo(slot.center.dy, .01));
                    expect(content.width, closeTo(28 * 1.10, .01));
                    expect(content.height, closeTo(28 * 1.10, .01));
                    for (final point in [
                      content.topLeft,
                      content.topRight,
                      content.bottomLeft,
                      content.bottomRight,
                    ]) {
                      expect(outer.contains(point), isTrue);
                      expect(slot.inflate(.01).contains(point), isTrue);
                      // Dense layouts can have a decorative pill smaller than
                      // the icon; it must never clip the icon or its hit target.
                      if (capsule.width >= content.width) {
                        expect(capsule.inflate(.01).contains(point), isTrue);
                      }
                    }
                    // The circle fallback is a background, not an icon clip.
                    expect(
                      find.descendant(
                        of: capsuleFinder,
                        matching: find.byType(Icon),
                      ),
                      findsNothing,
                    );
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
  for (final count in [2, 3, 4, 5]) {
    testWidgets(
      '$count tabs respect parent constraints and consumed/unconsumed side insets',
      (tester) async {
        for (final width in [
          320.0,
          360.0,
          375.0,
          390.0,
          402.0,
          430.0,
          480.0,
          600.0,
          768.0,
          800.0,
          1024.0,
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
                final geometry = NavigationThemes.bottomBarGeometry(
                  width - left - right,
                  count,
                );
                expect(bar.width, closeTo(geometry.barWidth, .01));
                expect(bar.width, lessThanOrEqualTo(560));
                expect(bar.center.dx, closeTo((left + width - right) / 2, .01));
                expect(bar.left, greaterThanOrEqualTo(safeLeft));
                expect(bar.right, lessThanOrEqualTo(width - safeRight));
                if (consumed) {
                  // The actual app consumes device insets above the Navigator:
                  // the narrower bar stays centered inside the same content area.
                  final content = tester.getRect(
                    find.byKey(const ValueKey('reference-content')),
                  );
                  expect(bar.left, greaterThanOrEqualTo(content.left - .01));
                  expect(bar.right, lessThanOrEqualTo(content.right + .01));
                  expect(bar.center.dx, closeTo(content.center.dx, .01));
                }
                final tabs = find.descendant(
                  of: find.byType(CustomerBottomNavigation),
                  matching: find.byType(InkWell),
                );
                for (var i = 0; i < count; i++) {
                  expect(
                    tester.getSize(tabs.at(i)).width,
                    closeTo(bar.width / count, .01),
                  );
                  expect(
                    tester.getSize(tabs.at(i)).width,
                    greaterThanOrEqualTo(44),
                  );
                  expect(
                    tester.getSize(tabs.at(i)).height,
                    closeTo(
                      NavigationThemes.bottomBarMinimumInteractiveHeight,
                      .01,
                    ),
                  );
                  await tester.tap(tabs.at(i));
                  await tester.pumpAndSettle();
                  final capsuleFinder = find.byKey(
                    const ValueKey('bottom-nav-capsule'),
                  );
                  final capsule = tester.getRect(capsuleFinder);
                  final slot = tester.getRect(tabs.at(i));
                  expect(capsule.center.dx, closeTo(slot.center.dx, .01));
                  expect(capsule.center.dy, closeTo(slot.center.dy, .01));
                  expect(
                    capsule.width + .01,
                    greaterThanOrEqualTo(capsule.height),
                  );
                  expect(
                    capsule.left - slot.left,
                    greaterThanOrEqualTo(
                      NavigationThemes.bottomBarSelectedSlotInset - .01,
                    ),
                  );
                  expect(
                    slot.right - capsule.right,
                    greaterThanOrEqualTo(
                      NavigationThemes.bottomBarSelectedSlotInset - .01,
                    ),
                  );
                  expect(capsule.width, lessThanOrEqualTo(slot.width));
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
    expect(bar.width, closeTo(343.68, .01));
    expect(bar.center.dx, 600);
    expect(tester.takeException(), isNull);
  });
}

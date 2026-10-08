import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';

void main() {
  for (final count in [2, 3, 4, 5]) {
    for (final rtl in [false, true]) {
      testWidgets(
        '$count icon tabs retain accessible names and actions rtl=$rtl',
        (tester) async {
          final semantics = tester.ensureSemantics();
          var selected = 0;
          final labels = rtl
              ? ['الرئيسية', 'الأقسام', 'السلة', 'الطلبات', 'الحساب', 'المفضلة']
              : ['Home', 'Categories', 'Cart', 'Orders', 'Account', 'Wishlist'];
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light(const Brand.bundled()),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: const TextScaler.linear(3)),
                child: child!,
              ),
              home: Directionality(
                textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
                child: StatefulBuilder(
                  builder: (context, setState) => Scaffold(
                    bottomNavigationBar: CustomerBottomNavigation(
                      destinations: [
                        for (var i = 0; i < count; i++)
                          (
                            id: i,
                            icon: Icons.home_outlined,
                            selectedIcon: Icons.home,
                            label: labels[i],
                            badge: i == 2 ? 3 : 0,
                          ),
                      ],
                      selectedIndex: selected,
                      onSelected: (index) => setState(() => selected = index),
                    ),
                  ),
                ),
              ),
            ),
          );
          final traversalLabels = <String>[];
          void collectLabels(SemanticsNode node) {
            if (labels.contains(node.label)) traversalLabels.add(node.label);
            for (final child in node.debugListChildrenInOrder(
              DebugSemanticsDumpOrder.traversalOrder,
            )) {
              collectLabels(child);
            }
          }

          collectLabels(
            tester
                .binding
                .renderViews
                .single
                .owner!
                .semanticsOwner!
                .rootSemanticsNode!,
          );
          expect(traversalLabels, labels.take(count).toList());
          for (var i = 0; i < count; i++) {
            expect(find.text(labels[i]), findsNothing);
            expect(find.byTooltip(labels[i]), findsNothing);
            final tab = find.bySemanticsLabel(labels[i]);
            expect(tab, findsOneWidget);
            expect(
              tester.getSemantics(tab),
              matchesSemantics(
                role: SemanticsRole.tab,
                label: labels[i],
                value: i == 2 ? '3' : '',
                isButton: true,
                hasSelectedState: true,
                isSelected: i == selected,
                hasTapAction: true,
              ),
            );
            // Exercise the screen-reader action, not just pointer hit testing.
            tester.semantics.tap(find.semantics.byLabel(labels[i]));
            await tester.pumpAndSettle();
            expect(selected, i);
            expect(
              tester
                  .getCenter(find.byKey(const ValueKey('bottom-nav-capsule')))
                  .dx,
              closeTo(tester.getCenter(tab).dx, .01),
            );
          }
          await tester.longPress(find.bySemanticsLabel(labels[count - 1]));
          await tester.pumpAndSettle();
          expect(find.text(labels[count - 1]), findsNothing);
          expect(selected, count - 1);
          semantics.dispose();
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  for (final accessibleNavigation in [false, true]) {
    testWidgets(
      'reduced motion disables scale and sliding: accessibleNavigation=$accessibleNavigation',
      (tester) async {
        var selected = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(const Brand.bundled()),
            home: MediaQuery(
              data: MediaQueryData(
                disableAnimations: !accessibleNavigation,
                accessibleNavigation: accessibleNavigation,
              ),
              child: StatefulBuilder(
                builder: (context, setState) => Scaffold(
                  bottomNavigationBar: CustomerBottomNavigation(
                    destinations: [
                      for (var i = 0; i < 5; i++)
                        (
                          id: i,
                          icon: Icons.home_outlined,
                          selectedIcon: Icons.home,
                          label: 'Tab $i',
                          badge: 0,
                        ),
                    ],
                    selectedIndex: selected,
                    onSelected: (index) => setState(() => selected = index),
                  ),
                ),
              ),
            ),
          ),
        );
        final last = find.byType(InkWell).last;
        final press = await tester.startGesture(tester.getCenter(last));
        await tester.pump(const Duration(milliseconds: 100));
        for (final scale in tester.widgetList<AnimatedScale>(
          find.byType(AnimatedScale),
        )) {
          expect(scale.scale, 1);
          expect(scale.duration, Duration.zero);
        }
        for (final layer in tester.widgetList<AnimatedOpacity>(
          find.byType(AnimatedOpacity),
        )) {
          expect(layer.duration, Duration.zero);
        }
        for (final expansion in tester.widgetList<ScaleTransition>(
          find.byKey(const ValueKey('bottom-nav-press-expansion')),
        )) {
          expect(expansion.scale.value, 1);
        }
        await press.up();
        await tester.pump();
        expect(selected, 4);
        expect(
          tester.getCenter(find.byKey(const ValueKey('bottom-nav-capsule'))).dx,
          closeTo(tester.getCenter(last).dx, .01),
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}

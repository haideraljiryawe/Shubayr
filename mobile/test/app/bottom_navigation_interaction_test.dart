import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';

void main() {
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final kind in [PointerDeviceKind.touch, PointerDeviceKind.mouse]) {
      for (final hold in [
        const Duration(milliseconds: 120),
        const Duration(seconds: 2),
      ]) {
        for (final release in ['inside', 'outside', 'just outside']) {
          testWidgets('$platform $kind hold=$hold release=$release', (
            tester,
          ) async {
            final semantics = tester.ensureSemantics();
            try {
              final selections = <int>[];
              var selected = 0;
              await tester.pumpWidget(
                MaterialApp(
                  theme: AppTheme.light(
                    const Brand.bundled(),
                  ).copyWith(platform: platform),
                  home: StatefulBuilder(
                    builder: (context, setState) => Scaffold(
                      bottomNavigationBar: CustomerBottomNavigation(
                        destinations: [
                          for (var i = 0; i < 3; i++)
                            (
                              id: i,
                              icon: Icons.home_outlined,
                              selectedIcon: Icons.home,
                              label: 'Tab $i',
                              badge: 0,
                            ),
                        ],
                        selectedIndex: selected,
                        onSelected: (index) {
                          selections.add(index);
                          setState(() => selected = index);
                        },
                      ),
                    ),
                  ),
                ),
              );
              final tab = find.byType(InkWell).at(1);
              final bounds = tester.getRect(tab);
              final start = release == 'just outside'
                  ? Offset(bounds.right - 1, bounds.center.dy)
                  : bounds.center;
              final pointer = await tester.createGesture(kind: kind);
              if (kind == PointerDeviceKind.mouse) {
                await pointer.addPointer(location: start);
                await tester.pump(const Duration(seconds: 2));
                expect(find.text('Tab 1'), findsNothing);
                expect(
                  tester.widget<InkWell>(tab).statesController!.value,
                  contains(WidgetState.hovered),
                );
              }
              await pointer.down(start);
              await tester.pump(hold);
              expect(selections, isEmpty);
              expect(find.byType(Tooltip), findsNothing);
              expect(find.text('Tab 1'), findsNothing);
              expect(
                tester.widget<InkWell>(tab).statesController!.value,
                contains(WidgetState.pressed),
              );
              if (release != 'inside') {
                await pointer.moveTo(
                  Offset(bounds.right + 1, bounds.center.dy),
                );
              }
              await pointer.up();
              await pointer.removePointer();
              await tester.pumpAndSettle();
              expect(selections, release == 'inside' ? [1] : isEmpty);
              expect(selected, release == 'inside' ? 1 : 0);
              expect(find.text('Tab 1'), findsNothing);

              // The accessible action still names and selects the destination once.
              selections.clear();
              tester.semantics.tap(find.semantics.byLabel('Tab 2'));
              await tester.pumpAndSettle();
              expect(selections, [2]);
              expect(selected, 2);

              // A cancelled pointer must not suppress a subsequent keyboard action.
              selections.clear();
              FocusManager.instance.primaryFocus?.unfocus();
              await tester.sendKeyEvent(LogicalKeyboardKey.tab);
              await tester.pump();
              await tester.sendKeyEvent(LogicalKeyboardKey.enter);
              await tester.pumpAndSettle();
              expect(selections, hasLength(1));
              expect(tester.takeException(), isNull);
            } finally {
              semantics.dispose();
            }
          });
        }
      }
    }
  }
}

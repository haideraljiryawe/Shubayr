import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/theme/app_colors.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/tokens/app_radii.dart';

void main() {
  for (final brightness in Brightness.values) {
    for (final direction in TextDirection.values) {
      testWidgets(
        'selection appearance and behavior are shared in $brightness $direction',
        (tester) async {
          final colors = AppColors.fromSeed(
            const Color(0xFF438C59),
            brightness: brightness,
          );
          var selected = 0;
          var filtered = false;
          var changes = 0;
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.fromColors(colors),
              home: Scaffold(
                body: Directionality(
                  textDirection: direction,
                  child: StatefulBuilder(
                    builder: (context, setState) => Wrap(
                      children: [
                        for (var i = 0; i < 3; i++)
                          ChoiceChip(
                            key: ValueKey('choice-$i'),
                            label: Text('حالة $i Status'),
                            selected: selected == i,
                            onSelected: i == 2
                                ? null
                                : (_) => setState(() {
                                    selected = i;
                                    changes++;
                                  }),
                          ),
                        FilterChip(
                          key: const ValueKey('filter'),
                          label: const Text('العروض Offers'),
                          selected: filtered,
                          onSelected: (value) => setState(() {
                            filtered = value;
                            changes++;
                          }),
                        ),
                        const Chip(
                          key: ValueKey('info'),
                          label: Text('Information'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          Material surface(String key) => tester.widget<Material>(
            find
                .descendant(
                  of: find.byKey(ValueKey(key)),
                  matching: find.byType(Material),
                )
                .first,
          );
          Color fill(String key) =>
              (tester
                          .widget<Ink>(
                            find
                                .descendant(
                                  of: find.byKey(ValueKey(key)),
                                  matching: find.byType(Ink),
                                )
                                .first,
                          )
                          .decoration!
                      as ShapeDecoration)
                  .color!;
          void check(String key, bool active) {
            final material = surface(key);
            final shape = material.shape! as RoundedRectangleBorder;
            expect(shape.borderRadius, BorderRadius.circular(AppRadii.xs));
            expect(shape.side.color, active ? colors.primary : colors.border);
            expect(fill(key), active ? colors.primarySoft : colors.surfaceAlt);
            expect(
              material.shadowColor,
              active
                  ? colors.primary.withValues(alpha: 0.16)
                  : Colors.transparent,
            );
            if (active) expect(material.elevation, greaterThan(0));
          }

          check('choice-0', true);
          check('choice-1', false);
          check('filter', false);
          expect(surface('info').shadowColor, Colors.transparent);
          await tester.tap(find.byKey(const ValueKey('choice-1')));
          await tester.pumpAndSettle();
          check('choice-0', false);
          check('choice-1', true);
          await tester.tap(find.byKey(const ValueKey('filter')));
          await tester.pumpAndSettle();
          check('filter', true);
          expect(
            selected,
            1,
          ); // Filter selection is still independent of choice.
          expect(changes, 2);
          await tester.tap(find.byKey(const ValueKey('choice-2')));
          await tester.pumpAndSettle();
          expect(changes, 2);
          expect(
            (surface('choice-2').shape! as RoundedRectangleBorder).side.color,
            colors.border,
          );
          final contrast =
              (colors.textPrimary.computeLuminance() + 0.05) /
              (colors.primarySoft.computeLuminance() + 0.05);
          expect(contrast < 1 ? 1 / contrast : contrast, greaterThan(4.5));
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_card.dart';

void main() {
  for (final dark in [false, true]) {
    testWidgets(
      'card supports descendant tile taps and inherited text in dark=$dark',
      (tester) async {
        var taps = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: dark
                ? AppTheme.dark(const Brand.bundled())
                : AppTheme.light(const Brand.bundled()),
            home: Scaffold(
              body: DefaultTextStyle(
                style: const TextStyle(
                  fontSize: 27,
                  fontWeight: FontWeight.w500,
                ),
                child: AppCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Inherited card text'),
                      ListTile(
                        title: const Text('Action'),
                        onTap: () => taps++,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
        expect(tester.takeException(), isNull);
        final text = tester.widget<RichText>(
          find.descendant(
            of: find.text('Inherited card text'),
            matching: find.byType(RichText),
          ),
        );
        expect(text.text.style?.fontSize, 27);
        expect(text.text.style?.fontWeight, FontWeight.w500);
        await tester.tap(find.text('Action'));
        await tester.pumpAndSettle();
        expect(taps, 1);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('card list tile paints and remains tappable, dark=$dark', (
      tester,
    ) async {
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: dark
              ? AppTheme.dark(const Brand.bundled())
              : AppTheme.light(const Brand.bundled()),
          home: Scaffold(
            body: AppCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                title: const Text('Account action'),
                onTap: () => taps++,
              ),
            ),
          ),
        ),
      );

      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Account action'));
      await tester.pumpAndSettle();
      expect(taps, 1);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('card-level tap callback still fires once', (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(const Brand.bundled()),
        home: Scaffold(
          body: AppCard(onTap: () => taps++, child: const Text('Open profile')),
        ),
      ),
    );

    await tester.tap(find.text('Open profile'));
    await tester.pumpAndSettle();
    expect(taps, 1);
    expect(tester.takeException(), isNull);
  });
}

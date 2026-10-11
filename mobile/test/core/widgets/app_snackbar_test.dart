import 'dart:math' as math;
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/widgets/app_snackbar.dart';

void main() {
  for (final fallback in [false, true]) {
    for (final direction in TextDirection.values) {
      testWidgets(
        'bounded snackbar resizes in safe space fallback=$fallback $direction',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 900);
          addTearDown(tester.view.reset);
          final semantics = tester.ensureSemantics();
          try {
            var actions = 0;
            var visible = 0;
            final scaffold = Directionality(
              textDirection: direction,
              child: Scaffold(
                bottomNavigationBar: fallback
                    ? const SizedBox(height: 80)
                    : null,
                body: Builder(
                  builder: (context) => Center(
                    child: TextButton(
                      onPressed: () => showAppSnackBar(
                        context,
                        SnackBar(
                          content: const Text('Saved'),
                          duration: const Duration(minutes: 1),
                          onVisible: () => visible++,
                          action: SnackBarAction(
                            label: 'Undo',
                            onPressed: () => actions++,
                          ),
                        ),
                      ),
                      child: const Text('Show'),
                    ),
                  ),
                ),
              ),
            );
            await tester.pumpWidget(
              MaterialApp(
                theme: AppTheme.light(const Brand.bundled()),
                builder: fallback ? (context, child) => scaffold : null,
                home: fallback ? null : scaffold,
              ),
            );
            await tester.tap(find.text('Show'));
            await tester.pumpAndSettle();
            final phone = tester.getRect(_surface);
            expect(phone.width, 360); // Existing 15dp floating margins.
            expect(phone.center.dx, 195);
            final originalHeight = phone.height;
            for (final (width, left, right, keyboard)
                in <(double, double, double, double)>[
                  (834, 0, 0, 0),
                  (1194, 44, 20, 0),
                  (1194, 44, 20, 300),
                  (631, 0, 0, 0),
                  (390, 0, 0, 0),
                ]) {
              tester.view.physicalSize = Size(width, 900);
              tester.view.viewPadding = FakeViewPadding(
                left: left,
                right: right,
                bottom: 34,
              );
              tester.view.padding = FakeViewPadding(
                left: left,
                right: right,
                bottom: keyboard > 0 ? 0 : 34,
              );
              tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
              await tester.pumpAndSettle();
              final rect = tester.getRect(_surface);
              expect(rect.width, math.min(width - left - right, 760) - 30);
              expect(rect.center.dx, left + (width - left - right) / 2);
              expect(rect.height, originalHeight);
              expect(
                rect.bottom,
                lessThanOrEqualTo(900 - math.max(keyboard, fallback ? 80 : 34)),
              );
              expect(find.text('Undo').hitTestable(), findsOneWidget);
              expect(find.bySemanticsLabel('Saved'), findsOneWidget);
              expect(tester.takeException(), isNull);
            }
            expect(visible, 1);
            await tester.tap(find.text('Undo'));
            await tester.pumpAndSettle();
            expect(actions, 1);
            expect(find.text('Saved'), findsNothing);
          } finally {
            semantics.dispose();
          }
        },
      );
    }
  }

  testWidgets(
    'long snackbar action wraps against the capped width and queue survives',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(1920, 1000);
      addTearDown(tester.view.reset);
      const label = 'Open the shopping cart';
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(const Brand.bundled()),
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                child: const Text('Show'),
                onPressed: () {
                  showAppSnackBarMessage(
                    context,
                    message: 'First',
                    actionLabel: label,
                  );
                  showAppSnackBarMessage(context, message: 'Second');
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text(label)).dy,
        greaterThan(tester.getBottomLeft(find.text('First')).dy),
      );
      expect(tester.getSize(_surface).width, lessThanOrEqualTo(760));
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
      expect(find.text('First'), findsNothing);
      expect(find.text('Second'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(find.text('Second'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('slides up, waits three seconds, then slides down', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () =>
                  showAppSnackBarMessage(context, message: 'Saved'),
              child: const Text('Show'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Show'));
    await tester.pump();

    expect(find.text('Saved'), findsOneWidget);
    expect(_slideOffset(tester), const Offset(0, 1));

    // Establish the animation's first frame after the overlay was inserted.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    expect(_slideOffset(tester).dy, inExclusiveRange(0, 1));

    await tester.pump(const Duration(milliseconds: 120));
    expect(_slideOffset(tester), Offset.zero);

    // Let the completed entrance schedule the three-second display timer.
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 3001));
    await tester.pump(const Duration(milliseconds: 120));
    expect(_slideOffset(tester).dy, inExclusiveRange(0, 1));

    await tester.pumpAndSettle();
    expect(find.text('Saved'), findsNothing);
  });
}

Offset _slideOffset(WidgetTester tester) => tester
    .widget<SlideTransition>(find.byKey(const ValueKey('app-snackbar-slide')))
    .position
    .value;

Finder get _surface => find
    .descendant(of: find.byType(SnackBar), matching: find.byType(Material))
    .first;

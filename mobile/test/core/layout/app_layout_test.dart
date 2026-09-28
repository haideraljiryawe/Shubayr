import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';

const responsiveWidths = <double>[
  390,
  599,
  600,
  601,
  899,
  900,
  901,
  1199,
  1200,
  1201,
  1535,
  1536,
  1537,
  1920,
];

void main() {
  testWidgets('columns follow local space and text scale, not window classes', (
    tester,
  ) async {
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final counts = <int>[];
    for (final width in [800.0, 1200.0, 1920.0]) {
      await tester.binding.setSurfaceSize(Size(width, 1000));
      await tester.pumpWidget(
        MaterialApp(
          home: Center(
            child: SizedBox(
              width: 740,
              child: Builder(
                builder: (context) {
                  counts.add(AppLayout.columns(context, 740));
                  return const SizedBox();
                },
              ),
            ),
          ),
        ),
      );
    }
    expect(counts, everyElement(2));
  });

  testWidgets('regrouping cards retains an in-progress interaction', (
    tester,
  ) async {
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.binding.setSurfaceSize(const Size(390, 900));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ResponsiveCardList(
            itemCount: 6,
            itemBuilder: (_, i) => _CounterTile(key: ValueKey('counter-$i')),
          ),
        ),
      ),
    );
    final second = find.byKey(const ValueKey('counter-1'));
    await tester.tap(
      find.descendant(of: second, matching: find.byType(TextButton)),
    );
    await tester.pump();
    final original = tester.state(second);
    for (final width in [900.0, 1920.0, 600.0, 390.0]) {
      await tester.binding.setSurfaceSize(Size(width, 900));
      await tester.pump();
      expect(tester.state(second), same(original));
      expect(
        find.descendant(of: second, matching: find.text('1')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    }
  });

  for (final direction in TextDirection.values) {
    testWidgets(
      'fields retain input, focus and validation on resize $direction',
      (tester) async {
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.binding.setSurfaceSize(const Size(390, 900));
        final form = GlobalKey<FormState>();
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Directionality(
                textDirection: direction,
                child: ResponsiveContent(
                  maxWidth: AppLayout.formWidth,
                  child: Form(
                    key: form,
                    child: SingleChildScrollView(
                      child: ResponsiveFields(
                        children: [
                          TextFormField(
                            key: const ValueKey('name'),
                            validator: (v) => v!.isEmpty ? 'Required' : null,
                          ),
                          TextFormField(
                            key: const ValueKey('phone'),
                            validator: (v) => v!.isEmpty ? 'Required' : null,
                          ),
                          const ResponsiveField(
                            fullWidth: true,
                            child: Text('Long notes'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.enterText(find.byKey(const ValueKey('name')), 'Draft');
        final fieldState = tester.state(find.byKey(const ValueKey('name')));
        final focus = FocusManager.instance.primaryFocus;
        expect(form.currentState!.validate(), isFalse);
        await tester.pump();
        for (final width in [...responsiveWidths, 390.0]) {
          await tester.binding.setSurfaceSize(Size(width, 900));
          await tester.pump();
          expect(
            tester.state(find.byKey(const ValueKey('name'))),
            same(fieldState),
          );
          expect(FocusManager.instance.primaryFocus, same(focus));
          expect(find.text('Draft'), findsOneWidget);
          expect(find.text('Required'), findsOneWidget);
          final a = tester.getRect(find.byKey(const ValueKey('name')));
          final b = tester.getRect(find.byKey(const ValueKey('phone')));
          if (width >= 900) {
            expect(a.top, b.top);
            expect(
              direction == TextDirection.rtl
                  ? a.left > b.left
                  : a.left < b.left,
              isTrue,
            );
          } else if (width == 390) {
            expect(b.top, greaterThan(a.top));
          }
          expect(tester.takeException(), isNull, reason: '$width');
        }
      },
    );
    testWidgets(
      'card grid grows without stretching cards and footer stays full width $direction',
      (tester) async {
        addTearDown(tester.view.reset);
        tester.view.devicePixelRatio = 1;
        for (final width in responsiveWidths) {
          tester.view.physicalSize = Size(width, 1000);
          await tester.pumpWidget(
            MaterialApp(
              home: Directionality(
                textDirection: direction,
                child: Scaffold(
                  body: ResponsiveCardList(
                    itemCount: 6,
                    itemBuilder: (_, i) => SizedBox(
                      key: ValueKey('card-$i'),
                      height: 80,
                      child: Text('Record $i'),
                    ),
                    footer: const SizedBox(
                      key: ValueKey('retry'),
                      height: 40,
                      child: Text('Retry'),
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pump();
          final a = tester.getRect(find.byKey(const ValueKey('card-0')));
          final b = tester.getRect(find.byKey(const ValueKey('card-1')));
          if (width >= 900) {
            expect(a.top, b.top);
            expect(a.width, lessThan(420));
          } else if (width == 390) {
            expect(b.top, greaterThan(a.top));
          }
          final inset = width < AppLayout.compactWidth
              ? AppSpacing.screenMobileH
              : AppSpacing.screenH;
          final footer = tester.getRect(find.byKey(const ValueKey('retry')));
          expect(footer.left, inset);
          expect(footer.right, width - inset);
          if (width == 390) {
            expect(a.left, footer.left);
            expect(a.right, footer.right);
          }
          expect(tester.takeException(), isNull);
        }
      },
    );
  }
}

class _CounterTile extends StatefulWidget {
  const _CounterTile({super.key});
  @override
  State<_CounterTile> createState() => _CounterTileState();
}

class _CounterTileState extends State<_CounterTile> {
  int count = 0;
  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: () => setState(() => count++),
    child: Text('$count'),
  );
}

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';

void main() {
  for (final direction in TextDirection.values) {
    for (final sideInsets in [
      EdgeInsets.zero,
      const EdgeInsets.only(left: 44, right: 20),
    ]) {
      testWidgets(
        'page centers in safe space across resizing $direction $sideInsets',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.padding = FakeViewPadding(
            left: sideInsets.left,
            right: sideInsets.right,
            bottom: 34,
          );
          tester.view.viewPadding = tester.view.padding;
          addTearDown(tester.view.reset);
          final semantics = tester.ensureSemantics();
          try {
            for (final width in <double>[
              320,
              390,
              759,
              760,
              761,
              834,
              1024,
              1194,
              1920,
              390,
            ]) {
              tester.view.physicalSize = Size(width, 900);
              await tester.pumpWidget(
                MaterialApp(
                  home: Directionality(
                    textDirection: direction,
                    child: Scaffold(
                      appBar: AppBar(title: const Text('Page')),
                      body: ResponsiveContent.page(
                        child: Builder(
                          builder: (context) => SingleChildScrollView(
                            key: const ValueKey('viewport'),
                            padding: AppLayout.pageInsets(context),
                            child: Semantics(
                              label: 'page content',
                              child: const TextField(key: ValueKey('field')),
                            ),
                          ),
                        ),
                      ),
                      bottomNavigationBar: ResponsiveContent.page(
                        child: SafeArea(
                          top: false,
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpacing.screenH),
                            child: SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                key: const ValueKey('action'),
                                onPressed: () {},
                                child: const Text('Continue'),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              final safeWidth = width - sideInsets.horizontal;
              final contentWidth = math.min(safeWidth, 760.0);
              final center = sideInsets.left + safeWidth / 2;
              final rect = tester.getRect(
                find.byKey(const ValueKey('viewport')),
              );
              expect(rect.width, contentWidth);
              expect(rect.center.dx, center);
              final field = tester.getRect(find.byKey(const ValueKey('field')));
              expect(
                field.width,
                contentWidth -
                    2 *
                        (width < 600
                            ? AppSpacing.screenMobileH
                            : AppSpacing.screenH),
              );
              expect(field.center.dx, center);
              expect(
                Directionality.of(
                  tester.element(find.byKey(const ValueKey('field'))),
                ),
                direction,
              );
              final action = tester.getRect(
                find.byKey(const ValueKey('action')),
              );
              expect(action.center.dx, center);
              expect(action.width, contentWidth - 2 * AppSpacing.screenH);
              expect(action.bottom, 900 - 34 - AppSpacing.screenH);
              expect(tester.getSize(find.byType(AppBar)).width, width);
              expect(find.bySemanticsLabel('page content'), findsOneWidget);
              expect(tester.takeException(), isNull);
            }
          } finally {
            semantics.dispose();
          }
        },
      );
    }

    testWidgets(
      'page FAB preserves vertical placement and phone geometry $direction',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        for (final width in [390.0, 834.0, 1194.0]) {
          tester.view.physicalSize = Size(width, 900);
          tester.view.viewPadding = const FakeViewPadding(
            left: 44,
            right: 20,
            bottom: 34,
          );
          for (final keyboard in [0.0, 300.0]) {
            tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
            tester.view.padding = FakeViewPadding(
              left: 44,
              right: 20,
              bottom: keyboard == 0 ? 34 : 0,
            );
            Future<Rect> pump(FloatingActionButtonLocation location) async {
              await tester.pumpWidget(
                MaterialApp(
                  home: Directionality(
                    textDirection: direction,
                    child: Scaffold(
                      floatingActionButtonLocation: location,
                      floatingActionButton: FloatingActionButton.extended(
                        onPressed: () {},
                        label: const Text('Add'),
                      ),
                      body: const ResponsiveContent.page(
                        child: SizedBox.expand(),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              return tester.getRect(find.byType(FloatingActionButton));
            }

            final original = await pump(FloatingActionButtonLocation.endFloat);
            final bounded = await pump(AppLayout.pageEndFloat);
            expect(bounded.top, original.top);
            expect(bounded.size, original.size);
            final margin = math.max(0.0, (width - 64 - 760) / 2);
            expect(
              bounded.left,
              original.left +
                  (direction == TextDirection.rtl ? margin : -margin),
            );
            expect(
              bounded.bottom,
              lessThanOrEqualTo(900 - math.max(keyboard, 34)),
            );
            expect(tester.takeException(), isNull);
          }
        }
      },
    );
  }
}

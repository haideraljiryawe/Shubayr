import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';

void main() {
  for (final list in [false, true]) {
    for (final fields in [1, 18]) {
      for (final owner in [
        'form',
        'safe area',
        'fixed footer',
        'floating bar',
      ]) {
        testWidgets('form end clearance list=$list fields=$fields owner=$owner', (
          tester,
        ) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 600);
          tester.view.viewPadding = const FakeViewPadding(top: 24, bottom: 48);
          addTearDown(tester.view.reset);
          var saves = 0;
          await tester.pumpWidget(
            MaterialApp(
              home: Scaffold(
                extendBody: owner == 'floating bar',
                appBar: AppBar(title: const Text('Form')),
                bottomNavigationBar: owner == 'fixed footer'
                    ? const SafeArea(top: false, child: SizedBox(height: 64))
                    : owner == 'floating bar'
                    ? const SizedBox(height: 112)
                    : null,
                body: SafeArea(
                  top: false,
                  bottom: owner == 'safe area',
                  child: Builder(
                    builder: (context) => BottomNavigationInset(
                      // Mirror the shell: Scaffold supplies its actual obstruction.
                      bottom: owner == 'floating bar'
                          ? MediaQuery.paddingOf(context).bottom
                          : 0,
                      child: Builder(
                        builder: (context) {
                          final children = <Widget>[
                            for (var i = 0; i < fields; i++)
                              Padding(
                                padding: const EdgeInsets.only(
                                  bottom: AppSpacing.md,
                                ),
                                child: TextFormField(
                                  decoration: InputDecoration(
                                    labelText: 'Field $i',
                                  ),
                                ),
                              ),
                            ElevatedButton(
                              key: const ValueKey('save'),
                              onPressed: () => saves++,
                              child: const Text('Save'),
                            ),
                          ];
                          return ResponsiveContent(
                            child: list
                                ? ListView(
                                    padding: AppLayout.formScrollInsets(
                                      context,
                                    ),
                                    children: children,
                                  )
                                : SingleChildScrollView(
                                    padding: AppLayout.formScrollInsets(
                                      context,
                                    ),
                                    child: Column(children: children),
                                  ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
          final save = find.byKey(const ValueKey('save'));
          for (final keyboard in [0.0, 200.0, 0.0]) {
            tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
            tester.view.padding = FakeViewPadding(
              top: 24,
              bottom: keyboard == 0 ? 48 : 0,
            );
            await tester.pumpAndSettle();
            final scrollable = find.byType(Scrollable).first;
            await tester.drag(scrollable, const Offset(0, -3000));
            await tester.pumpAndSettle();
            final position = tester.state<ScrollableState>(scrollable).position;
            expect(position.pixels, closeTo(position.maxScrollExtent, .01));
            final usableBottom = keyboard > 0
                ? 600 - keyboard
                : owner == 'fixed footer' || owner == 'floating bar'
                ? 488.0
                : 552.0;
            final rect = tester.getRect(save);
            expect(
              rect.bottom,
              lessThanOrEqualTo(usableBottom - AppSpacing.screenH + .01),
            );
            if (position.maxScrollExtent > 0) {
              // Exact clearance catches double SafeArea/keyboard/footer padding.
              expect(
                rect.bottom,
                closeTo(usableBottom - AppSpacing.screenH, .01),
              );
            }
            expect(
              rect.top,
              greaterThanOrEqualTo(tester.getRect(find.byType(AppBar)).bottom),
            );
            await tester.tap(save);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          }
          expect(saves, 3);
        });
      }
    }
  }
}

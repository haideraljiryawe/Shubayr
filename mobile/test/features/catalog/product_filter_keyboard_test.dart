import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/presentation/providers/product_list_controller.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_filters.dart';

// These tests exercise Flutter's text-input channel and keyboard insets. They
// cannot reproduce UIKit's native keyplane layout or its Auto Layout warnings.
void main() {
  setUpAll(() async {
    final fonts = FontLoader('Zain');
    for (final weight in ['Regular', 'Bold', 'ExtraBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Zain-$weight.ttf'));
    }
    await fonts.load();
  });

  for (final locale in ['ar', 'en']) {
    for (final device in [
      (
        size: const Size(320, 568),
        top: 20.0,
        bottom: 0.0,
        side: 0.0,
        keyboard: 216.0,
      ),
      (
        size: const Size(390, 844),
        top: 59.0,
        bottom: 34.0,
        side: 0.0,
        keyboard: 336.0,
      ),
      (
        size: const Size(844, 390),
        top: 0.0,
        bottom: 21.0,
        side: 47.0,
        keyboard: 162.0,
      ),
    ]) {
      for (final apply in [false, true]) {
        testWidgets(
          'iOS price inputs retain focus and visible actions $locale ${device.size} apply=$apply',
          (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = device.size;
            tester.view.viewPadding = FakeViewPadding(
              top: device.top,
              bottom: device.bottom,
              left: device.side,
              right: device.side,
            );
            addTearDown(tester.view.reset);
            void keyboard(double height) {
              tester.view.viewInsets = FakeViewPadding(bottom: height);
              tester.view.padding = FakeViewPadding(
                top: device.top,
                bottom: height == 0 ? device.bottom : 0,
                left: device.side,
                right: device.side,
              );
            }

            keyboard(0);
            ProductQuery? result;
            var completed = false;
            await tester.pumpWidget(
              MaterialApp(
                theme: AppTheme.light(
                  const Brand.bundled(),
                ).copyWith(platform: TargetPlatform.iOS),
                locale: Locale(locale),
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                home: Scaffold(
                  body: SafeArea(
                    child: Builder(
                      builder: (context) => TextButton(
                        onPressed: () async {
                          result = await showProductFilters(
                            context,
                            query: const ProductQuery(categoryId: 'category'),
                            offersOnly: false,
                          );
                          completed = true;
                        },
                        child: const Text('Open filters'),
                      ),
                    ),
                  ),
                ),
              ),
            );
            await tester.tap(find.text('Open filters'));
            await tester.pumpAndSettle();
            final min = find.byKey(const ValueKey('filter-min-price'));
            final max = find.byKey(const ValueKey('filter-max-price'));
            final applyButton = find.byKey(
              const ValueKey('product-filters-apply'),
            );
            final clearButton = find.byKey(
              const ValueKey('product-filters-clear'),
            );
            final closeButton = find.byKey(
              const ValueKey('product-filters-close'),
            );
            EditableText editable(Finder field) => tester.widget<EditableText>(
              find.descendant(of: field, matching: find.byType(EditableText)),
            );

            for (final (field, input, formatted) in [
              (min, '١٢٣٤٥٫٥٠', '12,345.50'),
              (max, '۹۰۰۰۰.۷۵', '90,000.75'),
            ]) {
              await tester.ensureVisible(field);
              await tester.pumpAndSettle();
              await tester.tap(field);
              await tester.pumpAndSettle();
              expect(editable(field).focusNode.hasFocus, isTrue);
              expect(tester.testTextInput.isVisible, isTrue);
              expect(tester.testTextInput.setClientArgs!['inputType'], {
                'name': 'TextInputType.number',
                'signed': false,
                'decimal': true,
              });
              expect(
                tester.testTextInput.setClientArgs!['inputAction'],
                'TextInputAction.done',
              );
              final focus = editable(field).focusNode;
              keyboard(device.keyboard);
              await tester.pumpAndSettle();
              await tester.ensureVisible(field);
              await tester.pumpAndSettle();
              tester.testTextInput.enterText(input);
              await tester.pumpAndSettle();
              expect(editable(field).controller.text, formatted);
              expect(editable(field).focusNode, same(focus));
              expect(focus.hasFocus, isTrue);
              expect(editable(field).controller.selection.isValid, isTrue);
              expect(
                tester.getRect(field).bottom,
                lessThanOrEqualTo(tester.getRect(applyButton).top),
              );
              for (final action in [applyButton, clearButton, closeButton]) {
                final bounds = tester.getRect(action);
                expect(bounds.top, greaterThanOrEqualTo(device.top));
                expect(
                  bounds.bottom,
                  lessThanOrEqualTo(device.size.height - device.keyboard),
                );
                expect(bounds.left, greaterThanOrEqualTo(device.side));
                expect(
                  bounds.right,
                  lessThanOrEqualTo(device.size.width - device.side),
                );
                expect(action.hitTestable(), findsOneWidget);
              }
              expect(tester.takeException(), isNull);
            }
            expect(editable(min).focusNode.hasFocus, isFalse);
            expect(editable(max).focusNode.hasFocus, isTrue);

            // A resize/keyboard dismissal must neither lose drafts nor create
            // a replacement FocusNode. Simulated insets are supplied by the OS.
            keyboard(0);
            await tester.pumpAndSettle();
            expect(editable(min).controller.text, '12,345.50');
            expect(editable(max).controller.text, '90,000.75');
            keyboard(device.keyboard);
            await tester.pumpAndSettle();
            await tester.tap(apply ? applyButton : closeButton);
            await tester.pumpAndSettle();
            expect(completed, isTrue);
            expect(find.byType(ProductFilterEditor), findsNothing);
            expect(tester.testTextInput.isVisible, isFalse);
            if (apply) {
              expect(result!.minPrice, 12345.5);
              expect(result!.maxPrice, 90000.75);
              expect(result!.categoryId, 'category');
            } else {
              expect(result, isNull);
            }
            keyboard(0);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/components/input_theme.dart';
import 'package:shubayr/core/theme/tokens/app_control_sizes.dart';
import 'package:shubayr/core/widgets/app_button.dart';

Widget _host({
  required Widget child,
  String language = 'en',
  TargetPlatform platform = TargetPlatform.android,
  bool dark = false,
  double scale = 1,
}) => MaterialApp(
  theme:
      (dark
              ? AppTheme.dark(const Brand.bundled())
              : AppTheme.light(const Brand.bundled()))
          .copyWith(platform: platform),
  locale: Locale(language),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: child!,
  ),
  home: Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: child,
      ),
    ),
  ),
);

Rect _inputBounds(WidgetTester tester, Finder field) {
  final editable = find.descendant(
    of: field,
    matching: find.byType(EditableText),
  );
  final container = InputDecorator.containerOf(tester.element(editable))!;
  return container.localToGlobal(Offset.zero) & container.size;
}

void main() {
  setUpAll(() async {
    final fonts = FontLoader('Zain');
    for (final weight in ['Regular', 'Bold', 'ExtraBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Zain-$weight.ttf'));
    }
    await fonts.load();
  });

  for (final language in ['ar', 'en']) {
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      for (final dark in [false, true]) {
        testWidgets(
          'shared preferred size in all field states $language $platform dark=$dark',
          (tester) async {
            tester.view.devicePixelRatio = 3;
            tester.view.physicalSize = const Size(390 * 3, 1200 * 3);
            addTearDown(tester.view.reset);
            final controller = TextEditingController();
            final focus = FocusNode();
            addTearDown(controller.dispose);
            addTearDown(focus.dispose);
            var taps = 0;
            for (final state in [
              'empty',
              'focused',
              'filled',
              'error',
              'disabled',
              'readonly',
            ]) {
              controller.text = state == 'empty' || state == 'focused'
                  ? ''
                  : 'أحمد Ahmed';
              final error = state == 'error' ? 'خطأ Error' : null;
              await tester.pumpWidget(
                _host(
                  language: language,
                  platform: platform,
                  dark: dark,
                  child: Column(
                    children: [
                      TextFormField(
                        key: const ValueKey('field'),
                        controller: controller,
                        focusNode: focus,
                        enabled: state != 'disabled',
                        readOnly: state == 'readonly',
                        decoration: InputDecoration(
                          labelText: 'الاسم Name',
                          prefixIcon: const Icon(Icons.person),
                          suffixIcon: const Icon(Icons.check),
                          errorText: error,
                        ),
                      ),
                      const SizedBox(height: 20),
                      const TextField(
                        key: ValueKey('search'),
                        decoration: InputDecoration(hintText: 'بحث Search'),
                      ),
                      const SizedBox(height: 20),
                      AppButton(label: 'حفظ Save', onPressed: () => taps++),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: () {},
                        child: const Text('حفظ Save'),
                      ),
                    ],
                  ),
                ),
              );
              if (state == 'focused') focus.requestFocus();
              await tester.pumpAndSettle();
              final field = find.byKey(const ValueKey('field'));
              final body = _inputBounds(tester, field);
              for (final height in [
                body.height,
                _inputBounds(
                  tester,
                  find.byKey(const ValueKey('search')),
                ).height,
                tester.getSize(find.byType(ElevatedButton)).height,
                tester.getSize(find.byType(FilledButton)).height,
              ]) {
                // Deliberately follows the token: the same regression test must
                // pass when only standardHeight is changed to another value.
                expect(height, closeTo(AppControlSizes.standardHeight, .01));
              }
              final editable = find.descendant(
                of: field,
                matching: find.byType(EditableText),
              );
              final input = tester.getRect(editable);
              expect(input.center.dy, closeTo(body.center.dy, .01));
              for (final icon in [Icons.person, Icons.check]) {
                expect(
                  tester.getCenter(find.byIcon(icon)).dy,
                  closeTo(body.center.dy, .01),
                );
              }
              final start = tester.getCenter(find.byIcon(Icons.person)).dx;
              final end = tester.getCenter(find.byIcon(Icons.check)).dx;
              expect(language == 'ar' ? start > end : start < end, isTrue);
              if (error != null) {
                final errorBounds = tester.getRect(find.text(error));
                expect(errorBounds.top, greaterThanOrEqualTo(body.bottom));
                expect(
                  errorBounds.bottom,
                  lessThan(
                    tester.getTopLeft(find.byKey(const ValueKey('search'))).dy,
                  ),
                );
              }
              expect(tester.takeException(), isNull);
            }
            await tester.tap(find.byType(ElevatedButton));
            expect(taps, 1);
            await tester.pumpWidget(const SizedBox.shrink());
          },
        );
      }
    }

    for (final width in [320.0, 800.0]) {
      for (final scale in [1.5, 2.0, 3.0]) {
        testWidgets(
          'controls grow without clipped text $language width=$width scale=$scale',
          (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = Size(width, 1600);
            addTearDown(tester.view.reset);
            await tester.pumpWidget(
              _host(
                language: language,
                scale: scale,
                child: Column(
                  children: [
                    const TextField(
                      key: ValueKey('large-field'),
                      decoration: InputDecoration(
                        hintText: 'بحث Search',
                        prefixIcon: Icon(Icons.search),
                        errorText: 'خطأ Error',
                      ),
                    ),
                    const SizedBox(height: 20),
                    for (final icon in [null, Icons.save])
                      AppButton(
                        icon: icon,
                        label: language == 'ar'
                            ? 'حفظ التغييرات والمتابعة'
                            : 'Save changes and continue',
                        onPressed: () {},
                      ),
                  ],
                ),
              ),
            );
            await tester.pumpAndSettle();
            final body = _inputBounds(
              tester,
              find.byKey(const ValueKey('large-field')),
            );
            expect(body.height, greaterThan(AppControlSizes.standardHeight));
            final editable = tester.getRect(find.byType(EditableText));
            expect(body.contains(editable.topLeft), isTrue);
            expect(
              body.contains(editable.bottomRight - const Offset(.01, .01)),
              isTrue,
            );
            final buttons = find.byType(ElevatedButton);
            for (var index = 0; index < 2; index++) {
              final button = buttons.at(index);
              expect(
                tester.getSize(button).height,
                greaterThanOrEqualTo(AppControlSizes.standardHeight),
              );
              if (scale >= 2) {
                expect(
                  tester.getSize(button).height,
                  greaterThan(AppControlSizes.standardHeight),
                );
              }
              for (final rich
                  in find
                      .descendant(of: button, matching: find.byType(RichText))
                      .evaluate()) {
                final paragraph = rich.renderObject! as RenderParagraph;
                final bounds =
                    paragraph.localToGlobal(Offset.zero) & paragraph.size;
                final outer = tester.getRect(button);
                expect(outer.contains(bounds.topLeft), isTrue);
                expect(
                  outer.contains(bounds.bottomRight - const Offset(.01, .01)),
                  isTrue,
                );
                expect(paragraph.didExceedMaxLines, isFalse);
              }
            }
            final error = tester.getRect(find.text('خطأ Error'));
            expect(error.top, greaterThanOrEqualTo(body.bottom));
            expect(error.bottom, lessThan(tester.getTopLeft(buttons.first).dy));
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }

  testWidgets(
    'busy and disabled primary buttons retain size and do not submit',
    (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        _host(
          child: Column(
            children: [
              AppButton(
                key: const ValueKey('busy'),
                label: 'Save',
                isLoading: true,
                onPressed: () => taps++,
              ),
              const AppButton(key: ValueKey('disabled'), label: 'Save'),
            ],
          ),
        ),
      );
      await tester.pump();
      for (final button in find.byType(ElevatedButton).evaluate()) {
        expect(
          tester.getSize(find.byWidget(button.widget)).height,
          AppControlSizes.standardHeight,
        );
        expect((button.widget as ElevatedButton).onPressed, isNull);
        await tester.tap(find.byWidget(button.widget));
      }
      expect(
        tester.getSize(find.byType(CircularProgressIndicator)),
        const Size(20, 20),
      );
      expect(taps, 0);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('multiline and compact controls keep their own sizing', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        child: Column(
          children: [
            const TextField(
              maxLines: 3,
              decoration: InputDecoration(
                contentPadding: InputTheme.spaciousContentPadding,
              ),
            ),
            const AppButton(
              label: 'Secondary',
              variant: AppButtonVariant.secondary,
            ),
            const AppButton(label: 'Inline', variant: AppButtonVariant.plain),
            IconButton(onPressed: () {}, icon: const Icon(Icons.add)),
            const Chip(label: Text('Chip')),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      _inputBounds(tester, find.byType(TextField)).height,
      greaterThan(AppControlSizes.standardHeight),
    );
    expect(tester.getSize(find.byType(OutlinedButton)).height, 48);
    expect(tester.getSize(find.byType(TextButton)).height, 48);
    expect(tester.getSize(find.byType(IconButton)).height, 48);
    expect(
      tester.getSize(find.byType(Chip)).height,
      lessThan(AppControlSizes.standardHeight),
    );
    expect(tester.takeException(), isNull);
  });
}

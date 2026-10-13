import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_colors.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/theme_context.dart';
import 'package:shubayr/core/widgets/app_card.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final fonts = FontLoader('Zain');
    for (final weight in ['Regular', 'Bold', 'ExtraBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Zain-$weight.ttf'));
    }
    await fonts.load();
  });

  for (final dark in [false, true]) {
    final theme = dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled());
    test('semantic roles keep supporting text subordinate: dark=$dark', () {
      final text = theme.textTheme;
      for (final (style, size, weight) in [
        (text.titleLarge!, 18, FontWeight.w700),
        (text.titleMedium!, 16, FontWeight.w700),
        (text.titleSmall!, 14, FontWeight.w700),
        (text.bodyLarge!, 16, FontWeight.w400),
        (text.bodyMedium!, 14, FontWeight.w400),
        (text.bodySmall!, 14, FontWeight.w400),
        (text.labelLarge!, 14, FontWeight.w700),
        (text.labelMedium!, 12, FontWeight.w700),
        (text.labelSmall!, 11, FontWeight.w400),
      ]) {
        expect(style.fontFamily, 'Zain');
        expect(style.fontSize, size);
        expect(style.fontWeight, weight);
      }
      for (final (style, size) in [
        (theme.dialogTheme.titleTextStyle!, 18),
        (theme.listTileTheme.titleTextStyle!, 14),
        (theme.elevatedButtonTheme.style!.textStyle!.resolve({})!, 14),
      ]) {
        expect(style.fontFamily, 'Zain');
        expect(style.fontSize, size);
        expect(style.fontWeight, FontWeight.w700);
      }
      expect(theme.chipTheme.labelStyle!.fontSize, 12);
      expect(theme.listTileTheme.subtitleTextStyle!.fontSize, 14);
      expect(
        theme.listTileTheme.subtitleTextStyle!.fontWeight,
        FontWeight.w400,
      );
      expect(theme.chipTheme.labelStyle!.fontWeight, FontWeight.w700);
      final input = theme.inputDecorationTheme;
      final label = WidgetStateProperty.resolveAs(input.labelStyle!, {});
      expect(label.fontSize, 14);
      expect(label.fontWeight, FontWeight.w700);
      final hint = WidgetStateProperty.resolveAs(input.hintStyle!, {});
      expect(hint.fontSize, 14);
      expect(hint.fontWeight, FontWeight.w400);
      expect(input.floatingLabelBehavior, FloatingLabelBehavior.auto);
    });

    for (final language in ['ar', 'en']) {
      for (final scale in [1.0, 1.5, 2.0]) {
        for (final width in [320.0, 600.0]) {
          testWidgets(
            'form labels remain readable and fit $language dark=$dark scale=$scale width=$width',
            (tester) async {
              tester.view.devicePixelRatio = 1;
              tester.view.physicalSize = Size(width, 1000);
              addTearDown(tester.view.resetDevicePixelRatio);
              addTearDown(tester.view.resetPhysicalSize);
              final focus = FocusNode();
              addTearDown(focus.dispose);
              late String label;
              await tester.pumpWidget(
                MaterialApp(
                  theme: theme,
                  locale: Locale(language),
                  localizationsDelegates:
                      AppLocalizations.localizationsDelegates,
                  supportedLocales: AppLocalizations.supportedLocales,
                  builder: (context, child) => MediaQuery(
                    data: MediaQuery.of(
                      context,
                    ).copyWith(textScaler: TextScaler.linear(scale)),
                    child: child!,
                  ),
                  home: Scaffold(
                    body: Builder(
                      builder: (context) {
                        final l10n = AppLocalizations.of(context);
                        label = l10n.profileName;
                        return SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: AppCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  l10n.accountPreferences,
                                  key: const ValueKey('heading'),
                                  style: context.sectionTitle,
                                ),
                                const SizedBox(height: 16),
                                TextFormField(
                                  focusNode: focus,
                                  decoration: InputDecoration(
                                    labelText: label,
                                    hintText: language == 'ar'
                                        ? 'أدخل الاسم'
                                        : 'Enter name',
                                    prefixIcon: const Icon(
                                      Icons.person_outline,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              final heading = tester.widget<Text>(
                find.byKey(const ValueKey('heading')),
              );
              expect(heading.style!.fontSize, 16);
              expect(heading.style!.fontWeight, FontWeight.w700);
              final editable = find.byType(EditableText);
              final inputStyle = tester.widget<EditableText>(editable).style;
              expect(inputStyle.fontFamily, 'Zain');
              expect(inputStyle.fontSize, 16);
              expect(inputStyle.fontWeight, FontWeight.w400);
              final fieldHeight = tester
                  .getSize(find.byType(InputDecorator))
                  .height;
              focus.requestFocus();
              await tester.pumpAndSettle();
              final labelFinder = find.text(label);
              final labelStyle = DefaultTextStyle.of(
                tester.element(labelFinder),
              ).style;
              expect(labelStyle.fontFamily, 'Zain');
              expect(labelStyle.fontSize, 18);
              expect(labelStyle.fontWeight, FontWeight.w700);
              expect(
                labelStyle.color,
                theme.extension<AppColors>()!.primaryDark,
              );
              final paragraph = tester.renderObject<RenderParagraph>(
                find.descendant(
                  of: labelFinder,
                  matching: find.byType(RichText),
                ),
              );
              final transform = paragraph.getTransformTo(null);
              // Check the painted label size, not just its unscaled theme token.
              expect(transform.getMaxScaleOnAxis(), closeTo(0.75, 0.001));
              expect(
                labelStyle.fontSize! * scale * transform.getMaxScaleOnAxis(),
                closeTo(13.5 * scale, 0.01),
              );
              final bounds = MatrixUtils.transformRect(
                transform,
                Offset.zero & paragraph.size,
              );
              final cardBounds = tester.getRect(find.byType(AppCard));
              expect(cardBounds.contains(bounds.topLeft), isTrue);
              expect(cardBounds.contains(bounds.bottomRight), isTrue);
              expect(paragraph.didExceedMaxLines, isFalse);

              expect(
                tester.getSize(find.byType(InputDecorator)).height,
                closeTo(fieldHeight, 0.01),
              );
              expect(tester.widget<EditableText>(editable).style, inputStyle);
              await tester.enterText(find.byType(TextFormField), 'أحمد Ahmed');
              await tester.pumpAndSettle();
              // Compare the tight text boxes; the input viewport also includes
              // empty line-height leading above the entered glyphs.
              final inputRender = tester
                  .state<EditableTextState>(editable)
                  .renderEditable;
              final boxes = inputRender.getBoxesForSelection(
                const TextSelection(baseOffset: 0, extentOffset: 10),
              );
              expect(boxes, isNotEmpty);
              for (final box in boxes) {
                expect(
                  bounds.bottom,
                  lessThanOrEqualTo(
                    inputRender.localToGlobal(Offset(box.left, box.top)).dy,
                  ),
                );
              }
              focus.unfocus();
              await tester.pumpAndSettle();
              expect(
                DefaultTextStyle.of(
                  tester.element(find.text(label)),
                ).style.fontSize,
                18,
              );
              expect(tester.takeException(), isNull);
              await tester.pumpWidget(const SizedBox.shrink());
            },
          );
        }
      }
    }
  }
}

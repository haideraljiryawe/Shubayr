import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/core/widgets/app_text_selection_toolbar.dart';
import 'package:shubayr/core/widgets/skeleton.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_card.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final fonts = FontLoader('Zain');
    for (final weight in ['Regular', 'Bold', 'ExtraBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Zain-$weight.ttf'));
    }
    await fonts.load();
  });
  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'natural label metrics keep product skeleton lines visible at $scale',
      (tester) async {
        final theme = AppTheme.light(const Brand.bundled());
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: const Scaffold(
              body: SizedBox(width: 200, child: ProductCardSkeleton()),
            ),
          ),
        );
        await tester.pump();
        final lines = find.byType(Skeleton);
        expect(lines, findsNWidgets(4));
        final painter = TextPainter(
          text: TextSpan(text: ' ', style: theme.textTheme.labelMedium),
          textDirection: TextDirection.ltr,
          textScaler: TextScaler.linear(scale),
        )..layout();
        expect(tester.getSize(lines.at(2)).height, painter.height);
        expect(painter.height, greaterThan(12 * scale));
        painter.dispose();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
  for (final language in ['ar', 'en']) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
          'controls, multiline selection and iOS use Zain $language dark=$dark scale=$scale',
          (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = const Size(320, 1400);
            addTearDown(tester.view.resetDevicePixelRatio);
            addTearDown(tester.view.resetPhysicalSize);
            final theme =
                (dark
                        ? AppTheme.dark(const Brand.bundled())
                        : AppTheme.light(const Brand.bundled()))
                    .copyWith(platform: TargetPlatform.iOS);
            final controller = TextEditingController(
              text: 'شُبَيّر Ahmed\nبغداد Baghdad',
            );
            final focus = FocusNode();
            addTearDown(controller.dispose);
            addTearDown(focus.dispose);
            final chipLabel = language == 'ar' ? 'الأحدث' : 'Newest';
            final buttonLabel = language == 'ar' ? 'حفظ' : 'Save';
            final tooltip = GlobalKey<TooltipState>();
            await tester.pumpWidget(
              MaterialApp(
                theme: theme,
                locale: Locale(language),
                localizationsDelegates: AppLocalizations.localizationsDelegates,
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
                      final ios = CupertinoTheme.of(context).textTheme;
                      for (final style in [
                        ios.textStyle,
                        ios.actionTextStyle,
                        ios.actionSmallTextStyle,
                        ios.navTitleTextStyle,
                        ios.navLargeTitleTextStyle,
                        ios.navActionTextStyle,
                        ios.tabLabelTextStyle,
                        ios.pickerTextStyle,
                        ios.dateTimePickerTextStyle,
                      ]) {
                        expect(style.fontFamily, 'Zain');
                        expect([
                          FontWeight.w400,
                          FontWeight.w700,
                          FontWeight.w800,
                        ], contains(style.fontWeight));
                      }
                      return SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            ChoiceChip(
                              label: Text(chipLabel),
                              selected: true,
                              onSelected: (_) {},
                            ),
                            AppButton(label: buttonLabel, onPressed: () {}),
                            const SizedBox(height: 24),
                            TextFormField(
                              controller: controller,
                              focusNode: focus,
                              maxLines: 3,
                              contextMenuBuilder: appTextSelectionToolbar,
                              decoration: InputDecoration(
                                labelText: language == 'ar'
                                    ? 'تفاصيل العنوان'
                                    : 'Address details',
                              ),
                            ),
                            Tooltip(
                              key: tooltip,
                              message: 'Zain tooltip',
                              child: const Icon(Icons.home_outlined),
                            ),
                            const CupertinoButton(
                              onPressed: null,
                              child: Text('iOS'),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            );
            await tester.pumpAndSettle();
            for (final (text, control) in [
              (chipLabel, find.byType(ChoiceChip)),
              (buttonLabel, find.byType(ElevatedButton)),
            ]) {
              final rich = find.descendant(
                of: find.text(text),
                matching: find.byType(RichText),
              );
              final paragraph = tester.renderObject<RenderParagraph>(rich);
              final style = (paragraph.text as TextSpan).style!;
              expect(style.fontFamily, 'Zain');
              expect(style.fontWeight, FontWeight.w700);
              final box = tester.getRect(rich);
              final outer = tester.getRect(control);
              expect(box.center.dy, closeTo(outer.center.dy, 1));
              expect(outer.contains(box.topLeft), isTrue);
              expect(outer.contains(box.bottomRight), isTrue);
              expect(paragraph.didExceedMaxLines, isFalse);
            }
            tooltip.currentState!.ensureTooltipVisible();
            await tester.pumpAndSettle();
            final tip = tester.widget<RichText>(
              find.descendant(
                of: find.text('Zain tooltip'),
                matching: find.byType(RichText),
              ),
            );
            expect((tip.text as TextSpan).style!.fontFamily, 'Zain');
            Tooltip.dismissAllToolTips();
            focus.requestFocus();
            controller.selection = TextSelection(
              baseOffset: 0,
              extentOffset: controller.text.length,
            );
            await tester.pumpAndSettle();
            final state = tester.state<EditableTextState>(
              find.byType(EditableText),
            );
            final editable = state.renderEditable;
            final boxes = editable.getBoxesForSelection(controller.selection);
            expect(boxes.length, greaterThanOrEqualTo(2));
            for (final box in boxes) {
              expect(box.top, greaterThanOrEqualTo(-0.5));
              expect(box.bottom, lessThanOrEqualTo(editable.size.height + 0.5));
              expect(
                box.toRect().height,
                closeTo(editable.preferredLineHeight, 1),
              );
            }
            await tester.longPress(find.byType(TextField));
            state.showToolbar();
            await tester.pumpAndSettle();
            final toolbar = find.byType(CupertinoTextSelectionToolbarButton);
            expect(toolbar, findsWidgets);
            final labels = tester.widgetList<RichText>(
              find.descendant(of: toolbar, matching: find.byType(RichText)),
            );
            expect(labels, isNotEmpty);
            for (final label in labels) {
              expect((label.text as TextSpan).style!.fontFamily, 'Zain');
            }
            expect(tester.takeException(), isNull);
            await tester.pumpWidget(const SizedBox.shrink());
          },
        );
      }
    }
  }
}

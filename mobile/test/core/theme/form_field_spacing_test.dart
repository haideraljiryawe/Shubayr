import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/tokens/app_control_sizes.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/core/widgets/international_phone_field.dart';

void main() {
  setUpAll(() async {
    final fonts = FontLoader('Zain');
    for (final weight in ['Regular', 'Bold', 'ExtraBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Zain-$weight.ttf'));
    }
    await fonts.load();
  });

  testWidgets(
    'integrated selector follows focused, invalid and disabled field states',
    (tester) async {
      final form = GlobalKey<FormState>();
      var enabled = true;
      late StateSetter rebuild;
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(280, 800);
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('ar'),
          localizationsDelegates: const [
            CountryLocalizations.delegate,
            ...AppLocalizations.localizationsDelegates,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          theme: AppTheme.light(const Brand.bundled()),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: Scaffold(
            body: SingleChildScrollView(
              child: StatefulBuilder(
                builder: (context, setState) {
                  rebuild = setState;
                  return Form(
                    key: form,
                    child: InternationalPhoneField(
                      label: 'الهاتف',
                      enabled: enabled,
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextFormField));
      await tester.pumpAndSettle();
      final editable = tester.widget<EditableText>(find.byType(EditableText));
      expect(editable.focusNode.hasFocus, isTrue);
      expect(
        tester.renderObject<RenderParagraph>(find.text('الهاتف')).textDirection,
        TextDirection.rtl,
      );
      expect(
        tester.getRect(find.text('الهاتف')).right,
        greaterThan(tester.getRect(find.byType(TextFormField)).center.dx),
      );
      expect(form.currentState!.validate(), isFalse);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<InputDecorator>(find.byType(InputDecorator).first)
            .decoration
            .errorText,
        isNotEmpty,
      );
      rebuild(() => enabled = false);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextButton>(
              find.byKey(const ValueKey('phone-country-selector')),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester.widget<TextFormField>(find.byType(TextFormField)).enabled,
        isFalse,
      );
      expect(tester.takeException(), isNull);
    },
  );

  for (final language in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets(
        'integrated country and form spacing survive errors and scaling $language dark=$dark',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          tester.platformDispatcher.localesTestValue = [
            const Locale('ar', 'IQ'),
          ];
          addTearDown(tester.platformDispatcher.clearLocalesTestValue);
          final semantics = tester.ensureSemantics();
          final form = GlobalKey<FormState>();
          final first = find.byKey(const ValueKey('first-field'));
          final phone = find.byKey(const ValueKey('phone-component'));
          final phoneInput = find.byKey(const ValueKey('phone-input'));
          final last = find.byKey(const ValueKey('last-field'));
          final selector = find.byKey(const ValueKey('phone-country-selector'));
          try {
            for (final scale in [1.0, 1.5, 2.0]) {
              for (final width in [
                280.0,
                320.0,
                390.0,
                599.0,
                600.0,
                899.0,
                900.0,
                1199.0,
                1200.0,
                1535.0,
                1536.0,
                1920.0,
              ]) {
                tester.view.physicalSize = Size(width, 1000);
                await tester.pumpWidget(
                  MaterialApp(
                    locale: Locale(language),
                    localizationsDelegates: const [
                      CountryLocalizations.delegate,
                      ...AppLocalizations.localizationsDelegates,
                    ],
                    supportedLocales: AppLocalizations.supportedLocales,
                    theme: dark
                        ? AppTheme.dark(const Brand.bundled())
                        : AppTheme.light(const Brand.bundled()),
                    builder: (context, child) => MediaQuery(
                      data: MediaQuery.of(
                        context,
                      ).copyWith(textScaler: TextScaler.linear(scale)),
                      child: child!,
                    ),
                    home: Scaffold(
                      body: SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Form(
                          key: form,
                          child: ResponsiveFields(
                            children: [
                              TextFormField(
                                key: const ValueKey('first-field'),
                                decoration: const InputDecoration(
                                  labelText: 'الاسم Name',
                                  helperText:
                                      'Helpful information that can wrap across lines.',
                                  helperMaxLines: 4,
                                  errorMaxLines: 4,
                                ),
                                validator: (_) =>
                                    'Please review this value before continuing. تحقق من القيمة المدخلة.',
                              ),
                              const ResponsiveField(
                                fullWidth: true,
                                child: InternationalPhoneField(
                                  key: ValueKey('phone-component'),
                                  inputKey: ValueKey('phone-input'),
                                  label: 'الهاتف Phone',
                                ),
                              ),
                              TextFormField(
                                key: const ValueKey('last-field'),
                                decoration: const InputDecoration(
                                  labelText: 'المدينة City',
                                  helperText: 'Additional information',
                                  helperMaxLines: 4,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
                await tester.pumpAndSettle();
                for (final errors in [false, true]) {
                  if (errors) {
                    expect(form.currentState!.validate(), isFalse);
                    await tester.pumpAndSettle();
                  }
                  expect(
                    tester.getRect(phone).top - tester.getRect(first).bottom,
                    closeTo(AppSpacing.formFieldGap, .01),
                  );
                  expect(
                    tester.getRect(last).top - tester.getRect(phone).bottom,
                    closeTo(AppSpacing.formFieldGap, .01),
                  );
                  final button = tester.getRect(selector);
                  expect(
                    button.width,
                    lessThan(tester.getRect(phoneInput).width),
                  );
                  expect(button.height, greaterThanOrEqualTo(48));
                  final l10n = AppLocalizations.of(tester.element(selector));
                  expect(find.text(l10n.phoneCountryCode), findsNothing);
                  final editable = find.descendant(
                    of: phoneInput,
                    matching: find.byType(EditableText),
                  );
                  expect(
                    button.right,
                    lessThanOrEqualTo(tester.getRect(editable).left),
                  );
                  expect(
                    tester.widget<EditableText>(editable).textDirection,
                    TextDirection.ltr,
                  );
                  final direction = language == 'ar'
                      ? TextDirection.rtl
                      : TextDirection.ltr;
                  final label = find.text('الهاتف Phone');
                  expect(
                    tester.renderObject<RenderParagraph>(label).textDirection,
                    direction,
                  );
                  final labelBounds = tester.getRect(label);
                  final fieldBounds = tester.getRect(phoneInput);
                  if (language == 'ar' && scale == 1) {
                    expect(
                      labelBounds.right,
                      inInclusiveRange(
                        fieldBounds.right - AppSpacing.lg - AppSpacing.sm,
                        fieldBounds.right,
                      ),
                    );
                  }
                  if (errors) {
                    final error = find.text(l10n.authPhoneInvalid);
                    expect(
                      tester.renderObject<RenderParagraph>(error).textDirection,
                      direction,
                    );
                  }
                  final code = tester.getRect(find.text('+964'));
                  final flag = tester.getRect(find.text('🇮🇶'));
                  expect(flag.right, lessThanOrEqualTo(code.left));
                  expect(find.text('Iraq'), findsNothing);
                  expect(find.text('العراق'), findsNothing);
                  final semanticLabel = tester
                      .getSemantics(selector)
                      .getSemanticsData()
                      .label;
                  expect(
                    semanticLabel,
                    contains(language == 'ar' ? 'العراق' : 'Iraq'),
                  );
                  expect(semanticLabel, contains('+964'));
                  if (scale == 1) {
                    expect(button.height, 48);
                    final editable = find.descendant(
                      of: phoneInput,
                      matching: find.byType(EditableText),
                    );
                    expect(
                      InputDecorator.containerOf(
                        tester.element(editable),
                      )!.size.height,
                      closeTo(AppControlSizes.standardHeight, .01),
                    );
                  }
                  expect(
                    tester.takeException(),
                    isNull,
                    reason: 'width=$width scale=$scale errors=$errors',
                  );
                }
                await tester.pumpWidget(const SizedBox.shrink());
              }
            }
          } finally {
            semantics.dispose();
          }
        },
      );
    }
  }
}

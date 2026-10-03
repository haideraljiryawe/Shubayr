import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/quantity_stepper.dart';

Widget host({
  required ValueChanged<num> onChanged,
  bool whole = false,
  num quantity = 0.5,
  num max = 0.5,
  String locale = 'en',
  bool dark = false,
  double scale = 1,
}) => MaterialApp(
  locale: Locale(locale),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  theme: dark
      ? AppTheme.dark(const Brand.bundled())
      : AppTheme.light(const Brand.bundled()),
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
    child: child!,
  ),
  home: Scaffold(
    body: Center(
      child: QuantityStepper(
        quantity: quantity,
        max: max,
        wholeUnitsOnly: whole,
        baseUnit: 'kg',
        onChanged: onChanged,
      ),
    ),
  ),
);

void main() {
  testWidgets('a closed cart line cannot commit an open quantity dialog', (
    tester,
  ) async {
    num? result;
    final visible = ValueNotifier(true);
    addTearDown(visible.dispose);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: ValueListenableBuilder<bool>(
            valueListenable: visible,
            builder: (context, shown, _) => shown
                ? QuantityStepper(
                    quantity: 0.5,
                    wholeUnitsOnly: false,
                    onChanged: (q) => result = q,
                  )
                : const SizedBox.shrink(),
          ),
        ),
      ),
    );
    await tester.tap(find.text('0.5'));
    await tester.pumpAndSettle();
    visible.value = false;
    await tester.pump();
    await tester.enterText(find.byType(TextFormField), '0.125');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(result, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'fractional entry normalizes Arabic/Persian digits and sends .125',
    (tester) async {
      num? result;
      await tester.pumpWidget(host(onChanged: (q) => result = q));
      await tester.tap(find.text('0.5'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '٠٫۱۲۵');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(result, 0.125);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('whole-unit entry rejects fractions and accepts 2', (
    tester,
  ) async {
    num? result;
    await tester.pumpWidget(
      host(onChanged: (q) => result = q, whole: true, quantity: 1, max: 3),
    );
    await tester.tap(find.text('1'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '1.5');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(result, isNull);
    expect(
      find.text('Enter a whole quantity within the limits.'),
      findsOneWidget,
    );
    await tester.enterText(find.byType(TextFormField), '2');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(result, 2);
  });
  testWidgets('entry rejects excessive precision, zero and stock overflow', (
    tester,
  ) async {
    num? result;
    await tester.pumpWidget(host(onChanged: (q) => result = q));
    await tester.tap(find.text('0.5'));
    await tester.pumpAndSettle();
    for (final text in ['0.1255', '0', '0.501', '1e-1', '1,000']) {
      await tester.enterText(find.byType(TextFormField), text);
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(result, isNull);
      expect(find.byType(AlertDialog), findsOneWidget);
    }
  });
  testWidgets('shortcuts clamp to fractional stock and minimum', (
    tester,
  ) async {
    num? result;
    await tester.pumpWidget(
      host(onChanged: (q) => result = q, quantity: 0.125),
    );
    await tester.tap(find.byIcon(Icons.add));
    expect(result, 0.5);
    await tester.tap(find.byIcon(Icons.remove));
    expect(result, 0.001);
    await tester.pumpWidget(
      host(onChanged: (q) => result = q, quantity: 2, max: 0),
    );
    result = null;
    await tester.tap(find.byIcon(Icons.remove));
    expect(result, isNull);
  });
  for (final width in [
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
    for (final locale in ['ar', 'en']) {
      testWidgets('quantity dialog $locale width=$width supports large text', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          host(
            onChanged: (_) {},
            locale: locale,
            dark: locale == 'ar',
            scale: 2,
          ),
        );
        await tester.tap(find.text('0.5'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextFormField), '0.1234');
        await tester.tap(find.text(locale == 'ar' ? 'حفظ' : 'Save'));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
}

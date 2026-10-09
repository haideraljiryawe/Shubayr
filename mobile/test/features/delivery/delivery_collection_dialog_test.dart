import 'package:shubayr/core/theme/brand.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/delivery/domain/delivery_collection_input.dart';
import 'package:shubayr/features/delivery/presentation/screens/delivery_status_dialog.dart';

const delivery = Delivery(
  id: 'd',
  orderId: 'o',
  amountDue: 25000,
  deliveryFee: 5000,
  status: 'out_for_delivery',
  orderVersion: 3,
);

void main() {
  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets(
        'collection choices and amount validation fit 320px at 150% $locale dark=$dark',
        (tester) async {
          await tester.binding.setSurfaceSize(const Size(320, 900));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          DeliveryStatusChoice? saved;
          late AppLocalizations l10n;
          await tester.pumpWidget(
            MaterialApp(
              theme: dark
                  ? AppTheme.dark(const Brand.bundled())
                  : AppTheme.light(const Brand.bundled()),
              locale: Locale(locale),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: const TextScaler.linear(1.5)),
                child: child!,
              ),
              home: Builder(
                builder: (context) {
                  l10n = AppLocalizations.of(context);
                  return Scaffold(
                    body: TextButton(
                      onPressed: () async {
                        saved = await showDialog<DeliveryStatusChoice>(
                          context: context,
                          builder: (_) =>
                              const DeliveryStatusDialog(delivery: delivery),
                        );
                      },
                      child: const Text('Open'),
                    ),
                  );
                },
              ),
            ),
          );
          await tester.tap(find.text('Open'));
          await tester.pumpAndSettle();
          expect(find.textContaining('25,000'), findsOneWidget);
          await tester.tap(find.byType(DropdownButtonFormField<String>));
          await tester.pumpAndSettle();
          await tester.tap(find.text(l10n.deliveryDelivered).last);
          await tester.pumpAndSettle();
          final save = find.widgetWithText(TextButton, l10n.actionSave);
          expect(tester.widget<TextButton>(save).onPressed, isNull);
          await tester.tap(find.byType(DropdownButtonFormField<bool>));
          await tester.pumpAndSettle();
          await tester.tap(find.text(l10n.deliveryCollectionConfirmed).last);
          await tester.pumpAndSettle();
          final field = find.byKey(const ValueKey('delivery-collected-amount'));
          await tester.enterText(field, '٢٦٠٠٠');
          await tester.pumpAndSettle();
          expect(tester.widget<TextButton>(save).onPressed, isNull);
          expect(find.text(l10n.deliveryInvalidAmount), findsOneWidget);
          await tester.enterText(field, '٢٠٠٠٠');
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.tap(save);
          await tester.pumpAndSettle();
          expect(saved?.collection?.amount, '20000');
          expect(saved?.status, 'delivered');
        },
      );
    }
  }
  testWidgets('unknown result locks the original choice and amount for retry', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: DeliveryStatusDialog(
            delivery: delivery,
            pending: DeliveryCollectionInput.confirmed('20000'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField)).readOnly, isTrue);
    expect(
      tester
          .widget<DropdownButtonFormField<bool>>(
            find.byType(DropdownButtonFormField<bool>),
          )
          .onChanged,
      isNull,
    );
    expect(find.text('Retry'), findsOneWidget);
  });
}

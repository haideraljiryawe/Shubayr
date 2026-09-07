import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/orders_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

Widget _host(OrderPage page) => ProviderScope(
  overrides: [
    ordersProvider.overrideWith((ref) async => page),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: OrdersScreen(),
  ),
);

void main() {
  testWidgets('shows an empty state when there are no orders', (tester) async {
    await tester.pumpWidget(_host(const OrderPage()));
    await tester.pumpAndSettle();

    expect(find.text('No orders yet'), findsOneWidget);
  });

  final twoOrders = OrderPage(
    total: 2,
    data: [
      Order(
        id: 'o1',
        orderNumber: 'SH-1042',
        status: 'delivered',
        total: 30000,
        placedAt: DateTime(2026, 9, 1),
      ),
      Order(
        id: 'o2',
        orderNumber: 'SH-1061',
        status: 'processing',
        total: 15000,
        placedAt: DateTime(2026, 9, 5),
      ),
    ],
  );

  testWidgets('lists orders with their number, status and total', (tester) async {
    await tester.pumpWidget(_host(twoOrders));
    await tester.pumpAndSettle();

    expect(find.text('SH-1042'), findsOneWidget);
    expect(find.text('SH-1061'), findsOneWidget);
    // Each status label now shows on the card pill and again on its filter chip.
    expect(find.text('Delivered'), findsWidgets);
    expect(find.text('Processing'), findsWidgets);
  });

  testWidgets('a status chip filters the list to matching orders', (tester) async {
    await tester.pumpWidget(_host(twoOrders));
    await tester.pumpAndSettle();

    expect(find.text('SH-1042'), findsOneWidget); // delivered, visible under "All"

    await tester.tap(find.widgetWithText(ChoiceChip, 'Processing'));
    await tester.pumpAndSettle();

    expect(find.text('SH-1061'), findsOneWidget); // processing stays
    expect(find.text('SH-1042'), findsNothing); // delivered filtered out
  });
}

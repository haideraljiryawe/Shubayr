import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/order_tracking.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

const _product = Product(
  id: 'p1',
  categoryId: 'c1',
  nameEn: 'Widget',
  nameAr: 'ودجة',
  salePrice: 15000,
);

Order _order(String status) => Order(
  id: 'o1',
  orderNumber: 'SH-9',
  status: status,
  subtotal: 30000,
  deliveryFee: 5000,
  total: 35000,
  placedAt: DateTime(2026, 9, 5),
  items: const [
    OrderItem(
      id: 'i1',
      productId: 'p1',
      quantity: 2,
      unitPrice: 15000,
      lineTotal: 30000,
    ),
  ],
);

final _tracking = OrderTracking(
  orderId: 'o1',
  events: [
    OrderEvent(status: 'pending', at: DateTime(2026, 9, 5, 9)),
    OrderEvent(status: 'processing', at: DateTime(2026, 9, 5, 12)),
  ],
);

Widget _host(Order order) => ProviderScope(
  overrides: [
    orderProvider('o1').overrideWith((ref) async => order),
    orderTrackingProvider('o1').overrideWith((ref) async => _tracking),
    productProvider('p1').overrideWith((ref) async => _product),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: OrderDetailScreen(orderId: 'o1'),
  ),
);

void main() {
  testWidgets('shows the order, its items and tracking timeline', (tester) async {
    await tester.pumpWidget(_host(_order('processing')));
    await tester.pumpAndSettle();

    expect(find.text('SH-9'), findsOneWidget);
    expect(find.text('Widget'), findsOneWidget);
    expect(find.text('Qty: 2'), findsOneWidget);
    // 'Pending' is a tracking event; 'Processing' is the status pill + the
    // current tracking event.
    expect(find.text('Pending'), findsOneWidget);
    expect(find.text('Processing'), findsWidgets);
  });

  testWidgets('an open order can be cancelled (with confirmation)', (tester) async {
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_host(_order('processing')));
    await tester.pumpAndSettle();

    expect(find.text('Cancel order'), findsOneWidget);

    await tester.tap(find.text('Cancel order'));
    await tester.pumpAndSettle();
    expect(find.text('Cancel this order?'), findsOneWidget);

    await tester.tap(find.text('Keep order'));
    await tester.pumpAndSettle();
    expect(find.text('Cancel this order?'), findsNothing);
  });

  testWidgets('a delivered order cannot be cancelled', (tester) async {
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_host(_order('delivered')));
    await tester.pumpAndSettle();

    expect(find.text('Cancel order'), findsNothing);
  });
}

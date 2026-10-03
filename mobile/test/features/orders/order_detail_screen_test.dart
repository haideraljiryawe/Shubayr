import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/utils/currency_formatter.dart';
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
  effectivePrice: 15000,
);

Order _order(String status) => Order(
  version: 1,
  id: 'o1',
  orderNumber: 'SH-9',
  status: status,
  subtotal: 30000,
  deliveryFee: 5000,
  total: 35000,
  placedAt: DateTime(2026, 9, 5, 0, 15).toUtc(),
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
    OrderEvent(status: 'pending', at: DateTime(2026, 9, 5, 0, 15).toUtc()),
    OrderEvent(status: 'processing', at: DateTime(2026, 9, 5, 12)),
  ],
);

Widget _host(
  Order order, {
  Future<Product> Function()? fetchProduct,
  String locale = 'en',
  bool dark = false,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    orderProvider('o1').overrideWith((ref) async => order),
    orderTrackingProvider('o1').overrideWith((ref) async => _tracking),
    productProvider('p1').overrideWith(
      (ref) async => fetchProduct == null ? _product : await fetchProduct(),
    ),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: const OrderDetailScreen(orderId: 'o1'),
  ),
);

void main() {
  for (final locale in ['ar', 'en']) {
    testWidgets(
      'order and tracking timestamps use local Western dates $locale',
      (tester) async {
        await tester.pumpWidget(_host(_order('processing'), locale: locale));
        await tester.pumpAndSettle();
        expect(find.textContaining('2026/09/05'), findsWidgets);
        await tester.ensureVisible(find.text('2026/09/05 00:15'));
        await tester.pumpAndSettle();
        expect(find.text('2026/09/05 00:15'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'rejected order shows saved currency and cannot be cancelled: $locale',
      (tester) async {
        final order = Order.fromJson({
          'id': 'o1',
          'order_number': 'SH-9',
          'status': 'rejected',
          'currency': 'USD',
          'subtotal': 12.75,
          'total': 12.75,
        });
        await tester.pumpWidget(_host(order, locale: locale));
        await tester.pumpAndSettle();
        final l10n = AppLocalizations.of(
          tester.element(find.byType(Scaffold).first),
        );
        expect(find.text(l10n.orderStatusRejected), findsOneWidget);
        expect(find.text(l10n.orderCancel), findsNothing);
        expect(
          find.text(
            formatMoney(12.75, currencyCode: 'USD', localeCode: locale),
          ),
          findsWidgets,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
  for (final width in [390.0, 600.0, 1200.0, 1920.0]) {
    for (final locale in ['ar', 'en']) {
      testWidgets('historical item skips catalog at $width / $locale', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var reads = 0;
        await tester.pumpWidget(
          _host(
            Order(
              version: 1,
              id: 'o1',
              orderNumber: 'SH-9',
              status: 'delivered',
              items: const [
                OrderItem(
                  id: 'i1',
                  productId: 'p1',
                  productNameAr: 'اسم المادة عند الشراء',
                  productNameEn: 'Product name at purchase',
                  imageSnapshotProvided: true,
                ),
              ],
            ),
            locale: locale,
            dark: locale == 'en',
            fetchProduct: () async {
              reads++;
              throw StateError('Deleted');
            },
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text(
            locale == 'ar'
                ? 'اسم المادة عند الشراء'
                : 'Product name at purchase',
          ),
          findsOneWidget,
        );
        expect(reads, 0);
        expect(find.byType(CachedNetworkImage), findsNothing);
        expect(find.byIcon(Icons.image_outlined), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('variant lookup can finish later without changing saved name', (
    tester,
  ) async {
    final catalog = Completer<Product>();
    await tester.pumpWidget(
      _host(
        Order(
          version: 1,
          id: 'o1',
          orderNumber: 'SH-9',
          items: const [
            OrderItem(
              id: 'i1',
              productId: 'p1',
              variantId: 'v1',
              productNameEn: 'Purchase name',
              imageSnapshotProvided: true,
            ),
          ],
        ),
        fetchProduct: () => catalog.future,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Purchase name'), findsOneWidget);
    expect(find.text('v1'), findsOneWidget);
    catalog.complete(
      const Product(
        id: 'p1',
        categoryId: 'c',
        nameEn: 'Renamed',
        nameAr: '',
        variants: [
          ProductVariant(id: 'v1', attributes: {'size': 'XL'}),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Purchase name'), findsOneWidget);
    expect(find.text('XL'), findsOneWidget);
    expect(find.text('Renamed'), findsNothing);
  });

  testWidgets('a legacy removed product retains its ID and placeholder', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        _order('delivered'),
        fetchProduct: () async => throw StateError('Deleted'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('p1'), findsOneWidget);
    expect(find.byIcon(Icons.image_outlined), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows the order, its items and tracking timeline', (
    tester,
  ) async {
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

  testWidgets('an open order can be cancelled (with confirmation)', (
    tester,
  ) async {
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

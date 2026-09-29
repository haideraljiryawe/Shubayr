import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/orders/data/coupon.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/order_tracking.dart';
import 'package:shubayr/features/orders/domain/order_repository.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/checkout_screen.dart';
import 'package:shubayr/features/orders/presentation/screens/orders_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

import '../address/support/address_fakes.dart';

class _FixedCart extends CartController {
  _FixedCart(this._cart);
  final Cart _cart;
  @override
  Future<Cart> build() async => _cart;
}

class _FixedAddresses extends AddressesController {
  _FixedAddresses(this._list);
  final List<Address> _list;
  @override
  Future<List<Address>> build() async => _list;
}

class _FakeOrders implements OrderRepository {
  final queries = <({String? status, int page})>[];
  Order? placed;
  String? placedAddressId;

  @override
  Future<Coupon> validateCoupon(String code) async =>
      Coupon(code: code, type: 'percentage', value: 10);

  @override
  Future<Order> placeOrder({
    required String addressId,
    String? couponCode,
  }) async {
    placedAddressId = addressId;
    return placed = const Order(id: 'o1', orderNumber: 'SH-1', total: 55000);
  }

  @override
  Future<OrderPage> fetchOrders({
    String? status,
    int page = 1,
    int perPage = 20,
  }) async {
    queries.add((status: status, page: page));
    final order = placed;
    final data = [
      if (order != null && (status == null || status == order.status)) order,
    ];
    return OrderPage(
      page: page,
      perPage: perPage,
      total: data.length,
      data: data,
    );
  }

  @override
  Future<Order> fetchOrder(String id) async => Order(id: id);

  @override
  Future<OrderTracking> fetchTracking(String id) async =>
      OrderTracking(orderId: id);

  @override
  Future<Order> cancelOrder(String id) async =>
      Order(id: id, status: 'cancelled');
}

Widget _host({
  GoRouter? router,
  _FakeOrders? repository,
  String? initialStatus,
  RecordingAddresses? addresses,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    cartControllerProvider.overrideWith(
      () => _FixedCart(
        const Cart(
          items: [
            CartItem(id: 'c1', productId: 'x', quantity: 1, unitPrice: 50000),
          ],
          subtotal: 50000,
        ),
      ),
    ),
    if (addresses != null) ...[
      sessionControllerProvider.overrideWith(AddressTestSession.new),
      addressRepositoryProvider.overrideWithValue(addresses),
    ] else
      addressesControllerProvider.overrideWith(
        () => _FixedAddresses(const [
          Address(id: 'a1', label: 'Home', city: 'Baghdad', isDefault: true),
        ]),
      ),
    orderRepositoryProvider.overrideWithValue(repository ?? _FakeOrders()),
    orderStatusFilterProvider.overrideWith((ref) => initialStatus),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: router != null
      ? MaterialApp.router(
          routerConfig: router,
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        )
      : const MaterialApp(
          locale: Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: CheckoutScreen(),
        ),
);

void main() {
  testWidgets('checkout waits for all address pages and uses a later default', (
    tester,
  ) async {
    final repo = RecordingAddresses();
    final orders = _FakeOrders();
    final last = Completer<AddressPage>();
    repo.onFetch = (r) async =>
        r.page == 2 ? last.future : addressPage(r, defaultIndex: 9);
    await tester.pumpWidget(_host(addresses: repo, repository: orders));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(
      tester
          .widget<AppButton>(find.widgetWithText(AppButton, 'Place order'))
          .onPressed,
      isNull,
    );
    expect(find.text('Address 0'), findsNothing);
    last.complete(addressPage((page: 2, perPage: 8), defaultIndex: 9));
    await tester.pumpAndSettle();
    expect(find.text('Address 9'), findsOneWidget);
    await tester.tap(find.text('Place order'));
    await tester.pumpAndSettle();
    expect(orders.placedAddressId, 'addr-9');
  });

  testWidgets(
    'checkout retries a failed later address page and selects it from the picker',
    (tester) async {
      final repo = RecordingAddresses()
        ..onFetch = (r) async {
          if (r.page == 2) throw const AppFailure.network();
          return addressPage(r, defaultIndex: 0);
        };
      final orders = _FakeOrders();
      await tester.pumpWidget(_host(addresses: repo, repository: orders));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      expect(
        tester
            .widget<AppButton>(find.widgetWithText(AppButton, 'Place order'))
            .onPressed,
        isNull,
      );
      repo.onFetch = (r) async => addressPage(r, defaultIndex: 0);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Change'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Address 9'),
        250,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.text('Address 9'));
      await tester.pumpAndSettle();
      expect(find.text('Address 9'), findsOneWidget);
      await tester.tap(find.text('Place order'));
      await tester.pumpAndSettle();
      expect(orders.placedAddressId, 'addr-9');
      expect(repo.requests.map((r) => r.page), [1, 2, 1, 2]);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('shows the address and places a COD order', (tester) async {
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Cash on delivery'), findsOneWidget);
    expect(find.text('Place order'), findsOneWidget);

    await tester.tap(find.text('Place order'));
    await tester.pumpAndSettle();

    // The success view replaces the form.
    expect(find.text('Order placed'), findsOneWidget);
    expect(find.text('SH-1'), findsOneWidget);
  });

  testWidgets(
    'view orders after checkout selects pending instead of the previous filter',
    (tester) async {
      final repository = _FakeOrders();
      final router = GoRouter(
        initialLocation: AppRoutes.checkout,
        routes: [
          GoRoute(
            path: AppRoutes.checkout,
            builder: (_, _) => const CheckoutScreen(),
          ),
          GoRoute(
            path: AppRoutes.orders,
            builder: (_, _) => const OrdersScreen(),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        _host(
          router: router,
          repository: repository,
          initialStatus: 'delivered',
        ),
      );
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(CheckoutScreen)),
      );
      await container.read(ordersProvider.future);
      expect(repository.queries.last.status, 'delivered');

      await tester.tap(find.text('Place order'));
      await tester.pumpAndSettle();
      expect(find.text('Order placed'), findsOneWidget);
      await tester.tap(find.text('View my orders'));
      await tester.pumpAndSettle();

      expect(find.byType(OrdersScreen), findsOneWidget);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Pending'))
            .selected,
        isTrue,
      );
      expect(find.text('SH-1'), findsOneWidget);
      expect(repository.queries.last, (status: 'pending', page: 1));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'return to shopping after checkout keeps the previous order filter',
    (tester) async {
      final router = GoRouter(
        initialLocation: AppRoutes.checkout,
        routes: [
          GoRoute(
            path: AppRoutes.checkout,
            builder: (_, _) => const CheckoutScreen(),
          ),
          GoRoute(
            path: AppRoutes.home,
            builder: (_, _) => const Scaffold(body: Text('Shopping')),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        _host(router: router, initialStatus: 'delivered'),
      );
      await tester.pumpAndSettle();
      final context = tester.element(find.byType(CheckoutScreen));
      final container = ProviderScope.containerOf(context);
      final l10n = AppLocalizations.of(context);
      await tester.tap(find.text('Place order'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.checkoutBackHome));
      await tester.pumpAndSettle();
      expect(find.text('Shopping'), findsOneWidget);
      expect(container.read(orderStatusFilterProvider), 'delivered');
    },
  );
}

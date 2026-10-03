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
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import '../commerce/pricing_contract_test.dart' show pricedCart, pricedLine;
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
import '../../helpers/test_session.dart';

class _FixedCart extends CartRepositoryMock {
  _FixedCart(this._cart);
  final Cart _cart;
  @override
  Future<Cart> fetchCart() async => _cart;
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
    List<({String variantId, String priceVersion})> acceptedPriceVersions =
        const [],
  }) async {
    placedAddressId = addressId;
    return placed = const Order(
      version: 1,
      id: 'o1',
      orderNumber: 'SH-1',
      total: 55000,
    );
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
  Future<Order> fetchOrder(String id) async => Order(version: 1, id: id);

  @override
  Future<OrderTracking> fetchTracking(String id) async =>
      OrderTracking(orderId: id);

  @override
  Future<Order> cancelOrder(String id, {required int version}) async =>
      Order(version: 1, id: id, status: 'cancelled');
}

class _CouponCart extends CartRepositoryMock {
  Cart cart = Cart.fromJson({
    ...pricedCart(),
    'coupon_code': null,
    'discount': 0,
    'total': 5071,
  });
  bool failReprice = false;
  Object? couponFailure;
  Completer<void>? repriceGate;
  final actions = <String>[];
  @override
  Future<Cart> fetchCart() async => cart;
  @override
  Future<Cart> applyCoupon(String code) async {
    actions.add('apply:$code');
    await repriceGate?.future;
    if (couponFailure != null) throw couponFailure!;
    cart = Cart.fromJson(pricedCart());
    if (failReprice) throw const AppFailure.network();
    return cart;
  }

  @override
  Future<Cart> removeCoupon() async {
    actions.add('remove');
    return cart = Cart.fromJson({
      ...pricedCart(),
      'coupon_code': null,
      'discount': 0,
      'total': 5071,
    });
  }
}

Widget _host({
  Cart? cart,
  String language = 'en',
  bool dark = false,
  double textScale = 1,
  _CouponCart? carts,
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
    if (carts != null)
      cartRepositoryProvider.overrideWithValue(carts)
    else
      cartRepositoryProvider.overrideWithValue(
        _FixedCart(
          cart ??
              const Cart(
                items: [
                  CartItem(
                    id: 'c1',
                    productId: 'x',
                    quantity: 1,
                    unitPrice: 50000,
                    lineTotal: 50000,
                    available: true,
                  ),
                ],
                subtotal: 50000,
                total: 50000,
              ),
        ),
      ),
    if (addresses != null) ...[
      sessionControllerProvider.overrideWith(AddressTestSession.new),
      addressRepositoryProvider.overrideWithValue(addresses),
    ] else ...[
      sessionControllerProvider.overrideWith(TestSession.new),
      addressesControllerProvider.overrideWith(
        () => _FixedAddresses(const [
          Address(id: 'a1', label: 'Home', city: 'Baghdad', isDefault: true),
        ]),
      ),
    ],
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
      : MaterialApp(
          locale: Locale(language),
          theme: dark
              ? AppTheme.dark(const Brand.bundled())
              : AppTheme.light(const Brand.bundled()),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: child!,
          ),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const CheckoutScreen(),
        ),
);

void main() {
  for (final language in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets('checkout 320px at 150%: $language dark=$dark', (
        tester,
      ) async {
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.binding.setSurfaceSize(const Size(320, 900));
        await tester.pumpWidget(
          _host(
            language: language,
            dark: dark,
            textScale: 1.5,
            cart: Cart.fromJson(pricedCart()),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final l = AppLocalizations.of(
          tester.element(find.byType(CheckoutScreen)),
        );
        await tester.ensureVisible(find.text(l.cartSubtotal));
        await tester.pumpAndSettle();
        expect(find.textContaining('4,750'), findsWidgets);
        expect(find.textContaining('4,321'), findsOneWidget);
        expect(find.textContaining('321'), findsNWidgets(2));
        expect(find.textContaining('750'), findsWidgets);
        expect(
          Directionality.of(tester.element(find.byType(CheckoutScreen))),
          language == 'ar' ? TextDirection.rtl : TextDirection.ltr,
        );
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final failure in <Object>[
    const AppFailure.network(),
    const AppFailure.timeout(),
    const AppFailure(FailureKind.server, code: 'MALFORMED_RESPONSE'),
    const AppFailure(FailureKind.notFound, code: 'COUPON_REJECTED'),
    StateError('unexpected-secret'),
  ]) {
    testWidgets(
      'coupon error is meaningful and busy clears: ${failure.runtimeType} $failure',
      (tester) async {
        final carts = _CouponCart()..couponFailure = failure;
        await tester.pumpWidget(_host(carts: carts));
        await tester.pumpAndSettle();
        final l = AppLocalizations.of(
          tester.element(find.byType(CheckoutScreen)),
        );
        await tester.enterText(find.byType(TextField), 'SAVE');
        await tester.tap(find.text('Apply'));
        await tester.pumpAndSettle();
        final expected =
            failure is AppFailure && failure.code == 'COUPON_REJECTED'
            ? l.checkoutCouponInvalid
            : (failure is AppFailure ? failure : const AppFailure.unknown())
                  .localizedMessage(l);
        expect(find.text(expected), findsWidgets);
        if (failure is! AppFailure || failure.code != 'COUPON_REJECTED') {
          expect(find.text(l.checkoutCouponInvalid), findsNothing);
        }
        expect(find.textContaining('unexpected-secret'), findsNothing);
        expect(find.text('Place order'), findsNothing);
        carts.couponFailure = null;
        await tester.ensureVisible(find.text('Retry'));
        await tester.tap(find.text('Retry'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Apply'));
        await tester.tap(find.text('Apply'));
        await tester.pumpAndSettle();
        expect(carts.actions, ['apply:SAVE', 'apply:SAVE']);
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final fail in [false, true]) {
    testWidgets(
      'first pending reprice frame hides stale totals (failure: $fail)',
      (tester) async {
        final gate = Completer<void>();
        final carts = _CouponCart()
          ..repriceGate = gate
          ..failReprice = fail;
        await tester.pumpWidget(_host(carts: carts));
        await tester.pumpAndSettle();
        expect(find.textContaining('5,071'), findsWidgets);
        await tester.enterText(find.byType(TextField), 'SAVE');
        await tester.tap(find.text('Apply'));
        await tester.pump();
        expect(find.textContaining('5,071'), findsNothing);
        expect(find.text('Place order'), findsNothing);
        expect(find.textContaining('null'), findsNothing);
        await tester.pump(const Duration(seconds: 1));
        expect(find.textContaining('5,071'), findsNothing);
        gate.complete();
        await tester.pumpAndSettle();
        expect(find.textContaining('5,071'), findsNothing);
        expect(
          find.textContaining('4,750'),
          fail ? findsNothing : findsWidgets,
        );
        expect(find.text('Place order'), fail ? findsNothing : findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('coupon application and removal display returned totals', (
    tester,
  ) async {
    final carts = _CouponCart();
    await tester.pumpWidget(_host(carts: carts));
    await tester.pumpAndSettle();
    expect(find.textContaining('5,071'), findsWidgets);
    await tester.enterText(find.byType(TextField), 'SAVE');
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(carts.actions, ['apply:SAVE']);
    expect(find.textContaining('4,750'), findsWidgets);
    expect(find.text('SAVE'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    expect(carts.actions, ['apply:SAVE', 'remove']);
    expect(find.textContaining('5,071'), findsWidgets);
    expect(find.text('SAVE'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'failed coupon reprice hides old total and retry reads applied coupon',
    (tester) async {
      final carts = _CouponCart()..failReprice = true;
      await tester.pumpWidget(_host(carts: carts));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'SAVE');
      await tester.tap(find.text('Apply'));
      await tester.pumpAndSettle();
      expect(find.textContaining('5,071'), findsNothing);
      expect(find.text('Place order'), findsNothing);
      await tester.ensureVisible(find.text('Retry'));
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.textContaining('4,750'), findsWidgets);
      expect(find.text('SAVE'), findsOneWidget);
      expect(carts.actions, ['apply:SAVE']);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('server unavailable line prevents placing an order', (
    tester,
  ) async {
    final orders = _FakeOrders();
    await tester.pumpWidget(
      _host(
        repository: orders,
        cart: Cart.fromJson({
          ...pricedCart(),
          'items': [
            {...pricedLine(), 'available': false},
          ],
        }),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<AppButton>(find.widgetWithText(AppButton, 'Place order'))
          .onPressed,
      isNull,
    );
    expect(orders.placed, isNull);
  });

  testWidgets('checkout displays the server total, discount and delivery fee', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        cart: Cart.fromJson({
          'id': 'c',
          'items': [
            {
              'id': 'i',
              'product_id': 'p',
              'variant_id': 'v',
              'quantity': .125,
              'unit_price': 10000,
              'line_total': 1234,
              'currency': 'IQD',
              'available': true,
              'price_version': 'fixture-v1',
              'current_price_version': 'fixture-v1',
              'price_changed': false,
              'current_unit_price': 10000,
              'available_qty': 1,
            },
          ],
          'subtotal': 4321,
          'discount': 321,
          'delivery_fee': 750,
          'total': 4750,
          'coupon_code': 'SAVE',
          'currency': 'IQD',
        }),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('4,750'), findsWidgets);
    await tester.scrollUntilVisible(find.textContaining('750').last, 200);
    expect(find.textContaining('321'), findsWidgets);
    expect(find.text('SAVE'), findsOneWidget);
  });

  testWidgets('checkout waits for all address pages and uses a later default', (
    tester,
  ) async {
    final repo = RecordingAddresses();
    final orders = _FakeOrders();
    final last = Completer<AddressPage>();
    repo.onFetch = (r) async => r.page == 2
        ? last.future
        : addressPage(r, total: 105, defaultIndex: 104);
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
    last.complete(
      addressPage((page: 2, perPage: 100), total: 105, defaultIndex: 104),
    );
    await tester.pumpAndSettle();
    expect(find.text('Address 104'), findsOneWidget);
    await tester.tap(find.text('Place order'));
    await tester.pumpAndSettle();
    expect(orders.placedAddressId, 'addr-104');
  });

  testWidgets(
    'checkout retries a failed later address page and selects it from the picker',
    (tester) async {
      final repo = RecordingAddresses()
        ..onFetch = (r) async {
          if (r.page == 2) throw const AppFailure.network();
          return addressPage(r, total: 105, defaultIndex: 0);
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
      repo.onFetch = (r) async => addressPage(r, total: 105, defaultIndex: 0);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Change'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Address 104'),
        1200,
        scrollable: find.byType(Scrollable).last,
        maxScrolls: 100,
      );
      await tester.tap(find.text('Address 104'));
      await tester.pumpAndSettle();
      expect(find.text('Address 104'), findsOneWidget);
      await tester.tap(find.text('Place order'));
      await tester.pumpAndSettle();
      expect(orders.placedAddressId, 'addr-104');
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
      await container.read(sessionControllerProvider.future);
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

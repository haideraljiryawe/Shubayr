import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/order_repository_mock.dart';
import 'package:shubayr/features/orders/data/order_tracking.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/checkout_screen.dart';
import 'package:shubayr/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import '../../helpers/test_session.dart';

const readyCart = Cart(
  items: [
    CartItem(
      id: 'line',
      productId: 'p',
      available: true,
      quantity: .5,
      unitPrice: 10,
      lineTotal: 5,
    ),
  ],
  subtotal: 5,
  total: 7,
  deliveryFee: 2,
  currency: 'IQD',
);

class Carts extends CartRepositoryMock {
  Carts() : super(delay: Duration.zero);
  Cart current = readyCart;
  int reads = 0;
  Future<Cart> Function()? onFetch;
  @override
  Future<Cart> fetchCart() async {
    reads++;
    return onFetch == null ? current : onFetch!();
  }
}

class Orders extends OrderRepositoryMock {
  Orders(super.cart) : super(delay: Duration.zero);
  late final placeGate = Completer<Order>(), cancelGate = Completer<Order>();
  int placements = 0, cancellations = 0, reads = 0, details = 0, tracks = 0;
  String status = 'pending';
  String? coupon;
  Future<Order> Function()? onPlace;
  Future<Order> Function()? onCancel;
  @override
  Future<Order> placeOrder({
    required String addressId,
    String? couponCode,
    List<({String variantId, String priceVersion})> acceptedPriceVersions =
        const [],
  }) {
    placements++;
    coupon = couponCode;
    return onPlace?.call() ?? placeGate.future;
  }

  @override
  Future<Order> cancelOrder(String id, {required int version}) {
    cancellations++;
    return onCancel?.call() ?? cancelGate.future;
  }

  @override
  Future<Order> fetchOrder(String id) async {
    details++;
    return Order(version: 1, id: id, status: status);
  }

  @override
  Future<OrderTracking> fetchTracking(String id) async {
    tracks++;
    return OrderTracking(orderId: id);
  }

  @override
  Future<OrderPage> fetchOrders({
    String? status,
    int page = 1,
    int perPage = 20,
  }) async {
    reads++;
    return OrderPage(page: page, perPage: perPage);
  }
}

class Addresses extends AddressesController {
  @override
  Future<List<Address>> build() async => const [
    Address(id: 'a', label: 'Home', city: 'Baghdad', isDefault: true),
    Address(id: 'b', label: 'Work', city: 'Basra'),
  ];
}

void main() {
  late Carts carts;
  late Orders orders;
  late ProviderContainer c;
  late ValueNotifier<bool> visible;
  setUp(() {
    carts = Carts();
    orders = Orders(carts);
    visible = ValueNotifier(true);
    c = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        sessionControllerProvider.overrideWith(TestSession.new),
        dataSourceProvider.overrideWithValue(DataSource.remote),
        cartRepositoryProvider.overrideWithValue(carts),
        orderRepositoryProvider.overrideWithValue(orders),
        addressesControllerProvider.overrideWith(Addresses.new),
        brandProvider.overrideWithValue(const Brand.bundled()),
        notificationSyncProvider.overrideWith((ref) {}),
        unreadCountProvider.overrideWith((ref) async => 0),
      ],
    );
    addTearDown(c.dispose);
    addTearDown(visible.dispose);
  });
  Future<void> mount(WidgetTester tester, {bool checkout = true}) async {
    await c.read(sessionControllerProvider.future);
    c.listen(ordersProvider, (_, _) {});
    await c.read(ordersProvider.future);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: ValueListenableBuilder<bool>(
            valueListenable: visible,
            builder: (_, shown, _) => shown
                ? (checkout
                      ? const CheckoutScreen()
                      : const OrderDetailScreen(orderId: 'o'))
                : const Scaffold(body: Text('Away')),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> startCancel(WidgetTester tester) async {
    await tester.ensureVisible(find.text('Cancel order'));
    await tester.tap(find.text('Cancel order'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('Cancel order'),
      ),
    );
    await tester.pump();
  }

  for (final checkout in [true, false]) {
    for (final fail in [false, true]) {
      testWidgets(
        '${checkout ? 'checkout' : 'cancel'} ${fail ? 'failure' : 'success'} after screen disposal has no stale UI and keeps business updates',
        (tester) async {
          await mount(tester, checkout: checkout);
          if (checkout) {
            await tester.tap(find.text('Place order'));
            await tester.pump();
          } else {
            await startCancel(tester);
          }
          final reads = orders.reads;
          visible.value = false;
          await tester.pump();
          if (fail) {
            (checkout ? orders.placeGate : orders.cancelGate).completeError(
              const AppFailure.network(),
            );
          } else {
            carts.current = const Cart();
            orders.status = 'cancelled';
            (checkout ? orders.placeGate : orders.cancelGate).complete(
              const Order(version: 1, id: 'o', status: 'cancelled'),
            );
          }
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.text('Away'), findsOneWidget);
          expect(find.byType(SnackBar), findsNothing);
          if (!fail) {
            expect(orders.reads, reads + 1);
            if (checkout) {
              expect(
                c.read(cartControllerProvider).requireValue.isEmpty,
                isTrue,
              );
            }
          }
        },
      );
    }
    testWidgets(
      '${checkout ? 'checkout' : 'cancel'} late response cannot refresh or display in another session',
      (tester) async {
        await mount(tester, checkout: checkout);
        if (checkout) {
          await tester.tap(find.text('Place order'));
          await tester.pump();
        } else {
          await startCancel(tester);
        }
        (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
          const Session.signedIn(User(id: 'B', role: 'customer')),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 1));
        final reads = orders.reads, cartReads = carts.reads;
        (checkout ? orders.placeGate : orders.cancelGate).complete(
          const Order(version: 1, id: 'A-order', orderNumber: 'PRIVATE-A'),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(orders.reads, reads);
        expect(carts.reads, cartReads);
        expect(find.text('PRIVATE-A'), findsNothing);
        expect(find.byType(SnackBar), findsNothing);
      },
    );
  }
  testWidgets('address sheet completion after checkout disposal is ignored', (
    tester,
  ) async {
    await mount(tester);
    await tester.tap(find.text('Change'));
    await tester.pumpAndSettle();
    visible.value = false;
    await tester.pump();
    await tester.tap(find.text('Work'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Away'), findsOneWidget);
  });
  testWidgets(
    'cancel confirmation after detail disposal does not start cancellation',
    (tester) async {
      await mount(tester, checkout: false);
      await tester.ensureVisible(find.text('Cancel order'));
      await tester.tap(find.text('Cancel order'));
      await tester.pumpAndSettle();
      visible.value = false;
      await tester.pump();
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Cancel order'),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(orders.cancellations, 0);
    },
  );
  testWidgets('checkout rejects duplicate callbacks before next frame', (
    tester,
  ) async {
    await mount(tester);
    final callback = tester
        .widget<AppButton>(find.widgetWithText(AppButton, 'Place order'))
        .onPressed!;
    callback();
    callback();
    await tester.pump();
    expect(orders.placements, 1);
    orders.placeGate.complete(const Order(version: 1, id: 'o'));
    await tester.pumpAndSettle();
  });
  testWidgets(
    'unexpected cancellation failure clears busy and shows safe feedback',
    (tester) async {
      await mount(tester, checkout: false);
      await startCancel(tester);
      orders.cancelGate.completeError(StateError('unexpected'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Cancel order'))
            .onPressed,
        isNotNull,
      );
      expect(find.byType(SnackBar), findsOneWidget);
    },
  );
  testWidgets('unexpected checkout failure clears busy and permits retry', (
    tester,
  ) async {
    await mount(tester);
    await tester.tap(find.text('Place order'));
    await tester.pump();
    orders.placeGate.completeError(StateError('unexpected'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      tester
          .widget<AppButton>(find.widgetWithText(AppButton, 'Place order'))
          .onPressed,
      isNotNull,
    );
    expect(find.byType(SnackBar), findsOneWidget);
  });
  testWidgets('an address sheet is dismissed when the customer changes', (
    tester,
  ) async {
    await mount(tester);
    await tester.tap(find.text('Change'));
    await tester.pumpAndSettle();
    (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
      const Session.signedIn(User(id: 'B', role: 'customer')),
    );
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('old confirmation cannot cancel an order for the next customer', (
    tester,
  ) async {
    await mount(tester, checkout: false);
    await tester.ensureVisible(find.text('Cancel order'));
    await tester.tap(find.text('Cancel order'));
    await tester.pumpAndSettle();
    (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
      const Session.signedIn(User(id: 'B', role: 'customer')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('Cancel order'),
      ),
    );
    await tester.pumpAndSettle();
    expect(orders.cancellations, 0);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'closing and reopening checkout while pending cannot execute it again',
    (tester) async {
      await mount(tester);
      await tester.tap(find.text('Place order'));
      await tester.pump();
      visible.value = false;
      await tester.pump();
      visible.value = true;
      await tester.pump();
      expect(find.text('Place order'), findsNothing);
      expect(orders.placements, 1);
      carts.current = const Cart();
      orders.placeGate.complete(
        const Order(
          version: 1,
          id: 'old-screen-order',
          orderNumber: 'OLD-SCREEN',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('OLD-SCREEN'), findsNothing);
      expect(find.byType(SnackBar), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'cancellation completed under another route does not show feedback on that route',
    (tester) async {
      await mount(tester, checkout: false);
      await startCancel(tester);
      Navigator.of(tester.element(find.byType(OrderDetailScreen))).push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Cover')),
        ),
      );
      await tester.pump();
      orders.status = 'cancelled';
      orders.cancelGate.complete(
        const Order(version: 1, id: 'o', status: 'cancelled'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Cover'), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'session change removes the old address sheet without popping a newer route',
    (tester) async {
      await mount(tester);
      await tester.tap(find.text('Change'));
      await tester.pumpAndSettle();
      Navigator.of(tester.element(find.byType(BottomSheet))).push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Cover')),
        ),
      );
      await tester.pumpAndSettle();
      (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
        const Session.signedIn(User(id: 'B', role: 'customer')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Cover'), findsOneWidget);
      expect(find.byType(BottomSheet, skipOffstage: false), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('active cancellation success refreshes detail and tracking', (
    tester,
  ) async {
    await mount(tester, checkout: false);
    await startCancel(tester);
    final details = orders.details, tracks = orders.tracks;
    orders.status = 'cancelled';
    orders.cancelGate.complete(
      const Order(version: 1, id: 'o', status: 'cancelled'),
    );
    await tester.pumpAndSettle();
    expect(orders.details, details + 1);
    expect(orders.tracks, tracks + 1);
    expect(find.text('Cancel order'), findsNothing);
    expect(find.byType(SnackBar), findsOneWidget);
  });
}

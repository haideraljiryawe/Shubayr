import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/presentation/providers/order_action_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import '../../helpers/test_session.dart';
import 'order_action_lifecycle_test.dart' show Orders, Carts;

const priceCart = Cart(
  items: [
    CartItem(
      id: 'i',
      productId: 'p',
      variantId: 'v',
      available: true,
      quantity: .125,
      unitPrice: 8000,
      lineTotal: 1000,
    ),
  ],
  subtotal: 1000,
  total: 1300,
  deliveryFee: 300,
  currency: 'IQD',
);
AppFailure conflict([String version = 'server-new']) => AppFailure(
  FailureKind.validation,
  statusCode: 409,
  code: 'PRICE_CHANGED',
  errors: [
    ApiFieldError(
      field: 'variant.v',
      code: 'PRICE_CHANGED',
      message: 'Changed',
      variantId: 'v',
      sku: 'SKU',
      oldPrice: 8000,
      newPrice: 7000,
      newPriceVersion: version,
    ),
  ],
);

class PriceOrders extends Orders {
  PriceOrders(super.cart);
  final accepted = <List<({String variantId, String priceVersion})>>[];
  int? cancelledVersion;
  @override
  Future<Order> placeOrder({
    required String addressId,
    String? couponCode,
    List<({String variantId, String priceVersion})> acceptedPriceVersions =
        const [],
  }) {
    accepted.add(acceptedPriceVersions);
    return super.placeOrder(
      addressId: addressId,
      couponCode: couponCode,
      acceptedPriceVersions: acceptedPriceVersions,
    );
  }

  @override
  Future<Order> cancelOrder(String id, {required int version}) {
    cancelledVersion = version;
    return super.cancelOrder(id, version: version);
  }
}

void main() {
  late ProviderContainer c;
  late Carts carts;
  late PriceOrders orders;
  CheckoutController controller() =>
      c.read(checkoutControllerProvider.notifier);
  setUp(() async {
    carts = Carts()..current = priceCart;
    orders = PriceOrders(carts)..onPlace = () async => throw conflict();
    c = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        sessionControllerProvider.overrideWith(TestSession.new),
        cartRepositoryProvider.overrideWithValue(carts),
        orderRepositoryProvider.overrideWithValue(orders),
      ],
    );
    addTearDown(c.dispose);
    await c.read(sessionControllerProvider.future);
    await c.read(cartControllerProvider.future);
    c.listen(checkoutControllerProvider, (_, _) {});
  });
  test(
    'only explicit acceptance sends opaque tokens from the preceding conflict',
    () async {
      final result = await controller().place('a');
      expect(result.priceChanges.single.newPrice, 7000);
      expect(orders.accepted.single, isEmpty);
      expect(c.read(cartControllerProvider).requireValue.total, 1300);
      orders.onPlace = () async => const Order(id: 'o', total: 1175);
      final placed = await controller().place(
        'a',
        acceptedPriceChanges: result.priceChanges,
      );
      expect(placed.order!.total, 1175);
      expect(orders.accepted.last, [
        (variantId: 'v', priceVersion: 'server-new'),
      ]);
    },
  );
  test(
    'a second price conflict replaces acceptance and never auto-retries',
    () async {
      final offer = await controller().place('a');
      orders.onPlace = () async => throw conflict('newer');
      final changed = await controller().place(
        'a',
        acceptedPriceChanges: offer.priceChanges,
      );
      expect(orders.placements, 2);
      expect(changed.priceChanges.single.newPriceVersion, 'newer');
      orders.onPlace = () async => const Order(id: 'o');
      await controller().place('a', acceptedPriceChanges: changed.priceChanges);
      expect(orders.accepted.last.single.priceVersion, 'newer');
    },
  );
  for (final alteration in ['address', 'cart', 'session']) {
    test('$alteration change cannot reuse the previous acceptance', () async {
      final offer = await controller().place('a');
      if (alteration == 'cart') {
        carts.current = Cart(
          items: priceCart.items,
          total: 900,
          couponCode: 'NEW',
        );
        c.invalidate(cartControllerProvider);
        await c.read(cartControllerProvider.future);
      }
      if (alteration == 'session') {
        (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
          const Session.signedIn(User(id: 'B', role: 'customer')),
        );
        await c.pump();
        await c.read(cartControllerProvider.future);
      }
      final result = await controller().place(
        alteration == 'address' ? 'b' : 'a',
        acceptedPriceChanges: offer.priceChanges,
      );
      expect(result.status, OrderActionStatus.failed);
      expect(orders.placements, 1);
    });
  }
  test(
    'acceptance without a prior conflict never reaches the repository',
    () async {
      expect(
        (await controller().place('a', acceptedPriceChanges: const [])).status,
        OrderActionStatus.failed,
      );
      expect(orders.placements, 0);
    },
  );
  test(
    'an old prompt cannot accept a newer offer from another attempt',
    () async {
      final first = await controller().place('a');
      orders.onPlace = () async => throw conflict('unseen-newer');
      await controller().place('a');
      final result = await controller().place(
        'a',
        acceptedPriceChanges: first.priceChanges,
      );
      expect(result.status, OrderActionStatus.failed);
      expect(orders.placements, 2);
    },
  );
  test('malformed conflict tokens are never offered for acceptance', () async {
    orders.onPlace = () async => throw conflict('');
    final offer = await controller().place('a');
    expect(offer.priceChanges, isEmpty);
    await controller().place('a', acceptedPriceChanges: offer.priceChanges);
    expect(orders.placements, 1);
  });
  test(
    'late price conflict cannot be offered to a different session',
    () async {
      final gate = Completer<Order>();
      orders.onPlace = () => gate.future;
      final old = controller().place('a');
      await Future<void>.delayed(Duration.zero);
      (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
        const Session.signedIn(User(id: 'B', role: 'customer')),
      );
      await c.pump();
      gate.completeError(conflict());
      final result = await old;
      expect(result.status, OrderActionStatus.superseded);
      expect(result.priceChanges, isEmpty);
    },
  );
  test(
    'cancellation sends the seen version; conflict reloads without retrying',
    () async {
      c.listen(orderCancellationProvider('o'), (_, _) {});
      c.listen(orderProvider('o'), (_, _) {});
      c.listen(ordersProvider, (_, _) {});
      c.listen(orderTrackingProvider('o'), (_, _) {});
      await c.read(orderProvider('o').future);
      await c.read(ordersProvider.future);
      await c.read(orderTrackingProvider('o').future);
      orders.onCancel = () async => throw const AppFailure(
        FailureKind.validation,
        statusCode: 409,
        code: 'STALE_ORDER_STATE',
      );
      final result = await c
          .read(orderCancellationProvider('o').notifier)
          .cancel(version: 17);
      await c.pump();
      await c.read(orderProvider('o').future);
      expect(result.status, OrderActionStatus.failed);
      expect(orders.cancelledVersion, 17);
      expect(orders.cancellations, 1);
      expect(orders.details, 2);
      expect(orders.tracks, 2);
      expect(orders.reads, 2);
    },
  );
}

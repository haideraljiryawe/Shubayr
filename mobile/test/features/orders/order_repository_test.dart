import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/orders/data/order_repository_mock.dart';

void main() {
  test('validates known coupons and rejects the rest', () async {
    final repo = OrderRepositoryMock(
      CartRepositoryMock(delay: Duration.zero),
      delay: Duration.zero,
    );

    final coupon = await repo.validateCoupon('save10');
    expect(coupon.type, 'percentage');
    expect(coupon.value, 10);

    expect(() => repo.validateCoupon('nope'), throwsA(isA<AppFailure>()));
  });

  test(
    'places a COD order from the cart, applies the coupon, clears the cart',
    () async {
      final cart = CartRepositoryMock(delay: Duration.zero);
      await cart.addItem(
        idempotencyKey: 'test-add-key-0',
        productId: 'p1',
        quantity: 2,
      );
      final subtotal = (await cart.fetchCart()).subtotal;
      final repo = OrderRepositoryMock(cart, delay: Duration.zero);

      final order = await repo.placeOrder(
        addressId: 'a1',
        couponCode: 'SAVE10',
      );

      expect(order.addressId, 'a1');
      expect(order.subtotal, subtotal);
      expect(order.discount, subtotal * 10 / 100);
      expect(order.deliveryFee, 5000);
      expect(order.total, subtotal + 5000 - subtotal * 10 / 100);
      expect(order.items, isNotEmpty);
      expect(order.paymentMethod, 'cod');

      // Placing the order consumed the cart.
      expect((await cart.fetchCart()).items, isEmpty);
    },
  );

  test('seeds demo orders and lists them newest first', () async {
    final repo = OrderRepositoryMock(
      CartRepositoryMock(delay: Duration.zero),
      delay: Duration.zero,
    );

    final page = await repo.fetchOrders();
    expect(page.data, isNotEmpty);
    expect(page.data, hasLength(20));
    expect(page.total, greaterThan(page.data.length));
    for (var i = 1; i < page.data.length; i++) {
      final prev = page.data[i - 1].placedAt!;
      final curr = page.data[i].placedAt!;
      expect(prev.isAfter(curr) || prev.isAtSameMomentAs(curr), isTrue);
    }
  });

  test(
    'mock filters before slicing and returns filtered pagination metadata',
    () async {
      final repo = OrderRepositoryMock(
        CartRepositoryMock(delay: Duration.zero),
        delay: Duration.zero,
      );
      final first = await repo.fetchOrders(status: 'delivered');
      final second = await repo.fetchOrders(status: 'delivered', page: 2);
      final beyond = await repo.fetchOrders(status: 'delivered', page: 3);
      expect(first.total, 25);
      expect(first.data, hasLength(20));
      expect(second.data, hasLength(5));
      expect(second.page, 2);
      expect(second.perPage, 20);
      expect(second.total, first.total);
      final all = [...first.data, ...second.data];
      expect(all.every((o) => o.status == 'delivered'), isTrue);
      expect(all.map((o) => o.id).toSet(), hasLength(25));
      expect(beyond.data, isEmpty);
    },
  );

  test('a placed order appears at the top of the list', () async {
    final cart = CartRepositoryMock(delay: Duration.zero);
    await cart.addItem(
      idempotencyKey: 'test-add-key-1',
      productId: 'p1',
      quantity: 1,
    );
    final repo = OrderRepositoryMock(cart, delay: Duration.zero);

    final placed = await repo.placeOrder(addressId: 'a1');
    final page = await repo.fetchOrders();

    expect(page.data.first.id, placed.id);
  });

  test(
    'fetchOrder returns a known order and throws for an unknown id',
    () async {
      final repo = OrderRepositoryMock(
        CartRepositoryMock(delay: Duration.zero),
        delay: Duration.zero,
      );
      final id = (await repo.fetchOrders()).data.first.id;

      expect((await repo.fetchOrder(id)).id, id);
      expect(() => repo.fetchOrder('nope'), throwsA(isA<AppFailure>()));
    },
  );

  test('tracking builds the lifecycle path up to the current status', () async {
    final repo = OrderRepositoryMock(
      CartRepositoryMock(delay: Duration.zero),
      delay: Duration.zero,
    );
    final orders = (await repo.fetchOrders()).data;
    final shipping = orders.firstWhere((o) => o.status == 'out_for_delivery');

    final tracking = await repo.fetchTracking(shipping.id);
    expect(tracking.events.map((e) => e.status), [
      'pending',
      'confirmed',
      'processing',
      'out_for_delivery',
    ]);
  });

  test('cancelling an order updates its status and tracking', () async {
    final repo = OrderRepositoryMock(
      CartRepositoryMock(delay: Duration.zero),
      delay: Duration.zero,
    );
    final orders = (await repo.fetchOrders()).data;
    final open = orders.firstWhere((o) => o.status == 'processing');

    final cancelled = await repo.cancelOrder(open.id, version: 1);
    expect(cancelled.status, 'cancelled');
    expect((await repo.fetchOrder(open.id)).status, 'cancelled');
    expect((await repo.fetchTracking(open.id)).events.map((e) => e.status), [
      'pending',
      'cancelled',
    ]);
  });
}

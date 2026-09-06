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

    expect(
      () => repo.validateCoupon('nope'),
      throwsA(isA<AppFailure>()),
    );
  });

  test('places a COD order from the cart, applies the coupon, clears the cart', () async {
    final cart = CartRepositoryMock(delay: Duration.zero);
    await cart.addItem(productId: 'p1', quantity: 2);
    final subtotal = (await cart.fetchCart()).subtotal;
    final repo = OrderRepositoryMock(cart, delay: Duration.zero);

    final order = await repo.placeOrder(addressId: 'a1', couponCode: 'SAVE10');

    expect(order.addressId, 'a1');
    expect(order.subtotal, subtotal);
    expect(order.discount, subtotal * 10 / 100);
    expect(order.deliveryFee, 5000);
    expect(order.total, subtotal + 5000 - subtotal * 10 / 100);
    expect(order.items, isNotEmpty);
    expect(order.paymentMethod, 'cod');

    // Placing the order consumed the cart.
    expect((await cart.fetchCart()).items, isEmpty);
  });
}

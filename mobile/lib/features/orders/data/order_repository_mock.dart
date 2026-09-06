import '../../../core/error/failure.dart';
import '../../cart/domain/cart_repository.dart';
import '../domain/order_repository.dart';
import 'coupon.dart';
import 'order.dart';

/// In-memory checkout for development. Prices the order from the current cart,
/// applies a flat mock delivery fee, and clears the cart once the order is
/// placed (as the server does). Two demo coupons: SAVE10 (10%) and WELCOME
/// (fixed 5,000); anything else is rejected.
class OrderRepositoryMock implements OrderRepository {
  OrderRepositoryMock(this._cart, {this.delay = const Duration(milliseconds: 300)});

  final CartRepository _cart;
  final Duration delay;

  static const num _deliveryFee = 5000;
  var _seq = 1001;

  @override
  Future<Coupon> validateCoupon(String code) async {
    await Future<void>.delayed(delay);
    return switch (code.trim().toUpperCase()) {
      'SAVE10' => const Coupon(code: 'SAVE10', type: 'percentage', value: 10),
      'WELCOME' => const Coupon(code: 'WELCOME', type: 'fixed', value: 5000),
      _ => throw const AppFailure(FailureKind.notFound),
    };
  }

  @override
  Future<Order> placeOrder({
    required String addressId,
    String? couponCode,
  }) async {
    await Future<void>.delayed(delay);
    final cart = await _cart.fetchCart();
    final subtotal = cart.subtotal;

    num discount = 0;
    if (couponCode != null && couponCode.trim().isNotEmpty) {
      discount = (await validateCoupon(couponCode)).discountOn(subtotal);
    }
    final total = subtotal + _deliveryFee - discount;

    final number = _seq++;
    final order = Order(
      id: 'order-$number',
      orderNumber: 'SH-$number',
      status: 'pending',
      paymentMethod: 'cod',
      addressId: addressId,
      subtotal: subtotal,
      deliveryFee: _deliveryFee,
      discount: discount,
      total: total,
      placedAt: DateTime.now(),
      items: [
        for (final i in cart.items)
          OrderItem(
            id: 'oi-${i.id}',
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          ),
      ],
    );

    // Placing the order consumes the cart, mirroring the server.
    for (final i in cart.items) {
      await _cart.removeItem(i.id);
    }
    return order;
  }
}

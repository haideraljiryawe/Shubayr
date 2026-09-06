import '../data/coupon.dart';
import '../data/order.dart';

/// Checkout: validate a coupon and place a Cash-on-Delivery order. The server
/// builds the order from the user's current cart, so placing only needs the
/// delivery address and an optional coupon.
abstract interface class OrderRepository {
  /// `POST /coupons/validate` — throws [AppFailure] (notFound) when invalid.
  Future<Coupon> validateCoupon(String code);

  /// `POST /orders` — places a COD order from the current cart.
  Future<Order> placeOrder({required String addressId, String? couponCode});
}

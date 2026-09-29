import '../data/coupon.dart';
import '../data/order.dart';
import '../data/order_tracking.dart';

/// Checkout and orders. On checkout the server builds the order from the user's
/// current cart, so placing only needs the delivery address and an optional
/// coupon. The rest read and manage placed orders.
abstract interface class OrderRepository {
  /// `POST /coupons/validate` — throws [AppFailure] (notFound) when invalid.
  Future<Coupon> validateCoupon(String code);

  /// `POST /orders` — places a COD order from the current cart.
  Future<Order> placeOrder({required String addressId, String? couponCode});

  /// `GET /orders` — the customer's orders, newest first. [status] filters by
  /// a single [OrderStatus] value when given.
  Future<OrderPage> fetchOrders({
    String? status,
    int page = 1,
    int perPage = 20,
  });

  /// `GET /orders/{id}` — a single order with its items.
  Future<Order> fetchOrder(String id);

  /// `GET /orders/{id}/track` — the order's status timeline.
  Future<OrderTracking> fetchTracking(String id);

  /// `POST /orders/{id}/cancel` — cancels the order and returns the updated one.
  Future<Order> cancelOrder(String id);
}

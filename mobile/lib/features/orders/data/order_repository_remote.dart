import '../../../core/network/api_client.dart';
import '../domain/order_repository.dart';
import 'coupon.dart';
import 'order.dart';

class OrderRepositoryRemote implements OrderRepository {
  const OrderRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Coupon> validateCoupon(String code) async => Coupon.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/coupons/validate',
      body: {'code': code},
    ),
  );

  @override
  Future<Order> placeOrder({
    required String addressId,
    String? couponCode,
  }) async => Order.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/orders',
      body: {
        'address_id': addressId,
        'coupon_code': ?couponCode,
        'payment_method': 'cod',
      },
    ),
  );
}

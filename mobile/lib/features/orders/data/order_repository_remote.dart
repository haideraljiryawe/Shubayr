import '../../../core/network/api_client.dart';
import '../domain/order_repository.dart';
import 'coupon.dart';
import 'order.dart';
import 'order_tracking.dart';

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
    List<({String variantId, String priceVersion})> acceptedPriceVersions =
        const [],
  }) async => Order.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/orders',
      body: {
        'address_id': addressId,
        'coupon_code': ?couponCode,
        'payment_method': 'cod',
        if (acceptedPriceVersions.isNotEmpty)
          'accepted_price_versions': [
            for (final accepted in acceptedPriceVersions)
              {
                'variant_id': accepted.variantId,
                'price_version': accepted.priceVersion,
              },
          ],
      },
    ),
  );

  @override
  Future<OrderPage> fetchOrders({
    String? status,
    int page = 1,
    int perPage = 20,
  }) async => OrderPage.fromJson(
    await _api.get<Map<String, dynamic>>(
      '/orders',
      query: {'status': ?status, 'page': '$page', 'per_page': '$perPage'},
    ),
  );

  @override
  Future<Order> fetchOrder(String id) async =>
      Order.fromJson(await _api.get<Map<String, dynamic>>('/orders/$id'));

  @override
  Future<OrderTracking> fetchTracking(String id) async =>
      OrderTracking.fromJson(
        await _api.get<Map<String, dynamic>>('/orders/$id/track'),
      );

  @override
  Future<Order> cancelOrder(String id, {required int version}) async =>
      Order.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/orders/$id/cancel',
          body: {'version': version},
        ),
      );
}

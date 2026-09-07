import '../../../core/network/api_client.dart';
import '../../catalog/data/review.dart';
import '../domain/after_sales_repository.dart';
import 'return_request.dart';

class AfterSalesRepositoryRemote implements AfterSalesRepository {
  const AfterSalesRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<Review> submitReview({
    required String productId,
    required String orderItemId,
    required int rating,
    String? comment,
  }) async => Review.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/products/$productId/reviews',
      body: {
        'order_item_id': orderItemId,
        'rating': rating,
        'comment': ?comment,
      },
    ),
  );

  @override
  Future<ReturnRequest> requestReturn({
    required String orderId,
    required List<ReturnRequestItem> items,
    String? reason,
  }) async => ReturnRequest.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/returns',
      body: {
        'order_id': orderId,
        'reason': ?reason,
        'items': items.map((item) => item.toJson()).toList(),
      },
    ),
  );
}

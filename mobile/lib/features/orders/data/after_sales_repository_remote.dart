import '../../../core/error/failure.dart';
import '../../../core/utils/quantity.dart';
import '../../../core/network/api_client.dart';
import '../../../core/error/response_decode.dart';
import '../../catalog/data/review.dart';
import '../domain/after_sales_repository.dart';
import 'return_request.dart';

class AfterSalesRepositoryRemote implements AfterSalesRepository {
  const AfterSalesRepositoryRemote(this._api);
  final ApiClient _api;

  @override
  Future<ReviewPage> fetchOwnReviews({int page = 1, int perPage = 100}) =>
      decodeResponse(() async {
        final json = await _api.get<Map<String, dynamic>>(
          '/me/reviews',
          query: {'page': page, 'per_page': perPage},
        );
        if (json['page'] is! int ||
            json['per_page'] is! int ||
            json['total'] is! int ||
            json['data'] is! List) {
          throw const AppFailure(FailureKind.server);
        }
        return ReviewPage.fromJson(json);
      });

  @override
  Future<ReturnPage> fetchReturns({int page = 1, int perPage = 100}) =>
      decodeResponse(
        () async => ReturnPage.fromJson(
          await _api.get<Map<String, dynamic>>(
            '/returns',
            query: {'page': page, 'per_page': perPage},
          ),
        ),
      );

  @override
  Future<Review> submitReview({
    required String productId,
    required String orderItemId,
    required int rating,
    String? comment,
  }) => decodeResponse(
    () async => Review.fromJson(
      await _api.post<Map<String, dynamic>>(
        '/products/$productId/reviews',
        body: {
          'order_item_id': orderItemId,
          'rating': rating,
          'comment': ?comment,
        },
      ),
    ),
  );

  @override
  Future<ReturnRequest> requestReturn({
    required String orderId,
    required List<ReturnRequestItem> items,
    String? reason,
  }) => decodeResponse(
    () async => ReturnRequest.fromJson(
      await _api.post<Map<String, dynamic>>(
        '/returns',
        body: {
          'order_id': orderId,
          'reason': ?reason,
          'items': items.map((item) {
            final itemReason = (item.reason ?? reason)?.trim();
            if (!isValidQuantity(item.quantity) ||
                itemReason == null ||
                itemReason.isEmpty ||
                itemReason.length > 1000) {
              throw const AppFailure(FailureKind.validation);
            }
            return {
              'order_item_id': item.orderItemId,
              'quantity': item.quantity,
              'reason': itemReason,
            };
          }).toList(),
        },
      ),
    ),
  );
}

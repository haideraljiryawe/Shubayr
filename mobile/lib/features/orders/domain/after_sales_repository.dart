import '../../catalog/data/review.dart';
import '../data/return_request.dart';

abstract interface class AfterSalesRepository {
  /// GET /me/reviews includes every moderation status for the current customer.
  Future<ReviewPage> fetchOwnReviews({int page = 1, int perPage = 100});

  /// GET /returns is customer-scoped. v9 has no order_id filter.
  Future<ReturnPage> fetchReturns({int page = 1, int perPage = 100});

  /// POST /products/{id}/reviews. Publication is decided by the server.
  Future<Review> submitReview({
    required String productId,
    required String orderItemId,
    required int rating,
    String? comment,
  });

  /// POST /returns. Request only: not an approval, refund, or stock movement.
  Future<ReturnRequest> requestReturn({
    required String orderId,
    required List<ReturnRequestItem> items,
    String? reason,
  });
}

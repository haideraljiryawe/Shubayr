import '../../../core/error/failure.dart';
import '../../catalog/data/review.dart';
import '../domain/after_sales_repository.dart';
import '../domain/order_repository.dart';
import 'return_request.dart';

/// Session-local simulation. Validations here model backend responses, not
/// production business rules in the UI. Never changes stock or grants refunds.
class AfterSalesRepositoryMock implements AfterSalesRepository {
  AfterSalesRepositoryMock(
    this._orders, {
    required this.userId,
    this.delay = const Duration(milliseconds: 300),
  });
  final OrderRepository _orders;
  final String? userId;
  final Duration delay;
  final List<Review> _reviews = [];
  final List<ReturnRequest> _returns = [];

  @override
  Future<Review> submitReview({
    required String productId,
    required String orderItemId,
    required int rating,
    String? comment,
  }) async {
    await Future<void>.delayed(delay);
    if (userId == null) throw const AppFailure.unauthorized();
    if (rating < 1 ||
        rating > 5 ||
        _reviews.any((r) => r.orderItemId == orderItemId)) {
      throw const AppFailure(FailureKind.validation);
    }
    var purchased = false;
    var page = 1;
    while (true) {
      final orders = await _orders.fetchOrders(page: page);
      purchased = orders.data.any(
        (o) =>
            o.status == 'delivered' &&
            o.items.any((i) => i.id == orderItemId && i.productId == productId),
      );
      if (purchased ||
          orders.data.isEmpty ||
          page * orders.perPage >= orders.total) {
        break;
      }
      page++;
    }
    if (!purchased) throw const AppFailure(FailureKind.validation);
    // Recheck after awaits so concurrent taps cannot create two submissions.
    if (_reviews.any((r) => r.orderItemId == orderItemId)) {
      throw const AppFailure(FailureKind.validation);
    }
    final review = Review(
      id: 'review-submitted-${_reviews.length + 1}',
      productId: productId,
      orderItemId: orderItemId,
      userId: userId,
      rating: rating,
      comment: comment,
      verifiedPurchase: true,
      status: 'pending',
      createdAt: DateTime.now(),
    );
    _reviews.add(review);
    return review;
  }

  @override
  Future<ReturnRequest> requestReturn({
    required String orderId,
    required List<ReturnRequestItem> items,
    String? reason,
  }) async {
    await Future<void>.delayed(delay);
    if (userId == null) throw const AppFailure.unauthorized();
    final order = await _orders.fetchOrder(orderId);
    if (order.status != 'delivered' ||
        items.isEmpty ||
        items.map((i) => i.orderItemId).toSet().length != items.length) {
      throw const AppFailure(FailureKind.validation);
    }
    for (final item in items) {
      final purchased = order.items.where((i) => i.id == item.orderItemId);
      final requested = _returns
          .where((r) => r.orderId == orderId)
          .expand((r) => r.items)
          .where((i) => i.orderItemId == item.orderItemId)
          .fold<int>(0, (sum, i) => sum + i.quantity);
      if (purchased.isEmpty ||
          item.quantity < 1 ||
          item.quantity + requested > purchased.first.quantity) {
        throw const AppFailure(FailureKind.validation);
      }
    }
    final result = ReturnRequest(
      id: 'return-${_returns.length + 1}',
      orderId: orderId,
      reason: reason,
      items: List.unmodifiable(items),
    );
    _returns.add(result);
    return result;
  }
}

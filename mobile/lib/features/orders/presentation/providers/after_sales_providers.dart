import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../catalog/data/product.dart';
import '../../../catalog/data/review.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../data/after_sales_repository_mock.dart';
import '../../data/after_sales_repository_remote.dart';
import '../../data/return_request.dart';
import '../../domain/after_sales_repository.dart';
import 'order_providers.dart';

final afterSalesRepositoryProvider = Provider<AfterSalesRepository>((ref) {
  final userId = ref.watch(
    sessionControllerProvider.select((s) => s.valueOrNull?.user?.id),
  );
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => AfterSalesRepositoryMock(
      ref.watch(orderRepositoryProvider),
      userId: userId,
    ),
    DataSource.remote => AfterSalesRepositoryRemote(
      ref.watch(apiClientProvider),
    ),
  };
});

final orderProductsProvider = FutureProvider.autoDispose
    .family<Map<String, Product>, String>((ref, orderId) async {
      final order = await ref.watch(orderProvider(orderId).future);
      final products = await Future.wait(
        order.items
            .map((i) => i.productId)
            .toSet()
            .map((id) => ref.watch(productProvider(id).future)),
      );
      return {for (final p in products) p.id: p};
    });

/// Receipts obtained in THIS session, not a fabricated API history endpoint.
/// The contract has no customer return-history / own-review-status endpoint.
class AfterSalesReceipts {
  const AfterSalesReceipts({this.reviews = const [], this.returns = const []});
  final List<Review> reviews;
  final List<ReturnRequest> returns;
  bool reviewed(String itemId) => reviews.any((r) => r.orderItemId == itemId);
  int returnedQuantity(String itemId) => returns
      .expand((r) => r.items)
      .where((i) => i.orderItemId == itemId)
      .fold(0, (sum, i) => sum + i.quantity);
}

class AfterSalesReceiptsController extends Notifier<AfterSalesReceipts> {
  @override
  AfterSalesReceipts build() {
    ref.watch(afterSalesRepositoryProvider);
    return const AfterSalesReceipts();
  }

  void addReview(Review review) => state = AfterSalesReceipts(
    reviews: [...state.reviews, review],
    returns: state.returns,
  );
  void addReturn(ReturnRequest request) => state = AfterSalesReceipts(
    reviews: state.reviews,
    returns: [...state.returns, request],
  );
}

final afterSalesReceiptsProvider =
    NotifierProvider<AfterSalesReceiptsController, AfterSalesReceipts>(
      AfterSalesReceiptsController.new,
    );

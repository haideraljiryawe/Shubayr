import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/utils/quantity.dart';
import '../../data/order.dart';
import '../../../catalog/data/product.dart';
import '../../../catalog/data/review.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../data/after_sales_repository_mock.dart';
import '../../data/after_sales_repository_remote.dart';
import '../../data/return_request.dart';
import '../../domain/after_sales_repository.dart';
import 'order_providers.dart';
import '../widgets/order_item_display.dart';

final afterSalesRepositoryProvider = Provider<AfterSalesRepository>((ref) {
  final identity = ref.watch(ordersIdentityProvider);
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => AfterSalesRepositoryMock(
      ref.watch(orderRepositoryProvider),
      userId: identity?.customerId,
    ),
    DataSource.remote => AfterSalesRepositoryRemote(
      ref.watch(apiClientProvider),
    ),
  };
});

final orderProductsProvider = FutureProvider.autoDispose
    .family<Map<String, Product>, String>((ref, orderId) async {
      final order = await ref.watch(orderProvider(orderId).future);
      if (!ref.mounted) return const {};
      final products = await Future.wait(
        order.items
            .where((item) => item.needsCatalogLabel)
            .map((i) => i.productId)
            .toSet()
            .map((id) async {
              try {
                return await ref.watch(productProvider(id).future);
              } catch (_) {
                // Catalog reads enrich historical labels; they are not an
                // eligibility requirement for reviews or returns.
                return null;
              }
            }),
      );
      return {for (final p in products.whereType<Product>()) p.id: p};
    });

/// A verified read plus the immediate result of this provider's own successful
/// mutation. Rebuilding/recreating always replaces it from the server.
class ReviewEligibilityController extends AsyncNotifier<Set<String>> {
  ReviewEligibilityController(this.orderId);
  final String orderId;
  int _generation = 0;
  Object? _owner;
  final _submitting = <Object>{};

  bool _owns(Object? identity) =>
      ref.mounted &&
      identity != null &&
      identity == _owner &&
      ref.read(ordersIdentityProvider) == identity;

  @override
  Future<Set<String>> build() async {
    final identity = ref.watch(ordersIdentityProvider);
    _owner = identity;
    final repository = ref.watch(afterSalesRepositoryProvider);
    final generation = ++_generation;
    ref.onDispose(() => _generation++);
    // Riverpod preserves previous values during loading. Seed an empty value
    // first so no account-owned data survives a dependency/session rebuild.
    state = const AsyncData(<String>{});
    state = const AsyncLoading();
    if (identity == null) throw const AppFailure.unauthorized();
    final order = await ref.watch(orderProvider(orderId).future);
    if (!_owns(identity) || generation != _generation) {
      throw const AppFailure.unauthorized();
    }
    if (order.status != 'delivered') return {};
    final reviewed = <String>{};
    if (order.items.any((item) => item.reviewed == null)) {
      final records = <String, Review>{};
      int? total;
      for (var page = 1; ; page++) {
        final result = await repository.fetchOwnReviews(
          page: page,
          perPage: 100,
        );
        if (!_owns(identity) || generation != _generation) {
          throw const AppFailure.unauthorized();
        }
        _checkPage(
          page,
          result.page,
          result.perPage,
          result.total,
          result.data.length,
          total,
        );
        total = result.total;
        for (final review in result.data) {
          if (records.containsKey(review.id)) {
            throw const AppFailure(FailureKind.server);
          }
          records[review.id] = review;
          if (review.orderItemId != null) reviewed.add(review.orderItemId!);
        }
        if (records.length == total) break;
      }
    }
    return {
      for (final item in order.items)
        if (!(item.reviewed ?? reviewed.contains(item.id))) item.id,
    };
  }

  Future<Review?> submit({
    required OrderItem item,
    required int rating,
    String? comment,
  }) async {
    if (!ref.mounted) return null;
    final identity = ref.read(ordersIdentityProvider);
    final generation = _generation;
    if (!_owns(identity)) return null;
    final key = (identity, item.id);
    if (_submitting.contains(key)) return null;
    final eligible = state.asData?.value;
    if (state.isLoading ||
        state.hasError ||
        eligible == null ||
        !eligible.contains(item.id)) {
      throw const AppFailure(FailureKind.validation);
    }
    _submitting.add(key);
    try {
      final review = await ref
          .read(afterSalesRepositoryProvider)
          .submitReview(
            productId: item.productId,
            orderItemId: item.id,
            rating: rating,
            comment: comment,
          );
      if (!_owns(identity)) return null;
      if (generation == _generation) {
        state = AsyncData({...state.requireValue}..remove(item.id));
      } else {
        // A read started before this success may have observed the old state.
        ref.invalidateSelf();
      }
      return review;
    } catch (_) {
      if (!_owns(identity)) return null;
      rethrow;
    } finally {
      _submitting.remove(key);
    }
  }
}

final reviewEligibilityProvider = AsyncNotifierProvider.autoDispose
    .family<ReviewEligibilityController, Set<String>, String>(
      ReviewEligibilityController.new,
    );

/// A complete caller-owned history projected onto one order. It is not a
/// permanent local receipt ledger. New server reads replace this entire value.
class ReturnEligibility {
  ReturnEligibility(this.order, this.requests) {
    final consumed = <String, num>{};
    for (final request in requests.where((r) => r.orderId == order.id)) {
      final seen = <String>{};
      for (final item in request.items) {
        if (!seen.add(item.orderItemId) || !isValidQuantity(item.quantity)) {
          throw const AppFailure(FailureKind.server);
        }
        final num quantity;
        switch (request.status) {
          case 'requested':
            // POST /returns: pending quantities reserve eligibility.
            quantity = item.quantity;
          case 'approved':
          case 'partially_approved':
          case 'completed':
            // v9 exposes approved units but does not specify when the
            // unapproved remainder is released for another request. Only equal
            // requested/approved quantities have an unambiguous consumed amount.
            // Completion can also follow rejection: never treat it as full return.
            final approved = item.approvedQuantity;
            if (approved == null ||
                !isValidQuantity(approved, min: 0, max: item.quantity) ||
                approved != item.quantity) {
              throw const AppFailure(FailureKind.server);
            }
            quantity = approved;
          case 'rejected':
          default:
            // Rejection's reservation-release policy is not defined in v9.
            throw const AppFailure(FailureKind.server);
        }
        consumed[item.orderItemId] = addQuantity(
          consumed[item.orderItemId] ?? 0,
          quantity,
        );
      }
    }
    remaining = Map.unmodifiable({
      for (final item in order.items)
        item.id: order.status == 'delivered'
            ? subtractQuantity(
                item.quantity,
                consumed[item.id] ?? 0,
              ).clamp(0, item.quantity)
            : 0,
    });
  }
  final Order order;
  final List<ReturnRequest> requests;
  late final Map<String, num> remaining;

  ReturnEligibility withReceipt(ReturnRequest receipt) => ReturnEligibility(
    order,
    [...requests.where((r) => r.id != receipt.id), receipt],
  );
}

class ReturnEligibilityController extends AsyncNotifier<ReturnEligibility> {
  ReturnEligibilityController(this.orderId);
  final String orderId;
  int _generation = 0;
  Object? _owner;
  final _submitting = <Object>{};
  bool _owns(Object? identity) =>
      ref.mounted &&
      identity != null &&
      identity == _owner &&
      ref.read(ordersIdentityProvider) == identity;

  @override
  Future<ReturnEligibility> build() async {
    final identity = ref.watch(ordersIdentityProvider);
    _owner = identity;
    final repository = ref.watch(afterSalesRepositoryProvider);
    final generation = ++_generation;
    ref.onDispose(() => _generation++);
    // Clear retained account data before entering the unresolved loading state.
    state = AsyncData(ReturnEligibility(Order(id: orderId), const []));
    state = const AsyncLoading();
    if (identity == null) throw const AppFailure.unauthorized();
    final order = await ref.watch(orderProvider(orderId).future);
    if (!_owns(identity) || generation != _generation) {
      throw const AppFailure.unauthorized();
    }
    if (order.status != 'delivered') return ReturnEligibility(order, const []);
    final records = <String, ReturnRequest>{};
    int? total;
    for (var page = 1; ; page++) {
      final result = await repository.fetchReturns(page: page, perPage: 100);
      if (!_owns(identity) || generation != _generation) {
        throw const AppFailure.unauthorized();
      }
      _checkPage(
        page,
        result.page,
        result.perPage,
        result.total,
        result.data.length,
        total,
      );
      total = result.total;
      for (final request in result.data) {
        if (records.containsKey(request.id)) {
          throw const AppFailure(FailureKind.server);
        }
        records[request.id] = request;
      }
      if (records.length == total) break;
    }
    return ReturnEligibility(
      order,
      List.unmodifiable(
        records.values.where((request) => request.orderId == order.id),
      ),
    );
  }

  Future<ReturnRequest?> submit({
    required List<ReturnRequestItem> items,
    String? reason,
  }) async {
    if (!ref.mounted) return null;
    final identity = ref.read(ordersIdentityProvider);
    final generation = _generation;
    if (!_owns(identity)) return null;
    final key = identity!;
    if (_submitting.contains(key)) return null;
    final current = state.asData?.value;
    if (state.isLoading ||
        state.hasError ||
        current == null ||
        items.isEmpty ||
        items.map((i) => i.orderItemId).toSet().length != items.length ||
        items.any(
          (i) => !isValidQuantity(
            i.quantity,
            max: current.remaining[i.orderItemId] ?? 0,
          ),
        )) {
      throw const AppFailure(FailureKind.validation);
    }
    _submitting.add(key);
    try {
      final request = await ref
          .read(afterSalesRepositoryProvider)
          .requestReturn(orderId: orderId, items: items, reason: reason);
      if (!_owns(identity)) return null;
      if (generation == _generation) {
        try {
          state = AsyncData(state.requireValue.withReceipt(request));
        } catch (error, stack) {
          // A successful write with ambiguous history must not leave the old
          // remaining quantity available for another submission.
          state = AsyncError(error, stack);
          rethrow;
        }
      } else {
        ref.invalidateSelf();
      }
      return request;
    } catch (_) {
      if (!_owns(identity)) return null;
      rethrow;
    } finally {
      _submitting.remove(key);
    }
  }
}

final returnEligibilityProvider = AsyncNotifierProvider.autoDispose
    .family<ReturnEligibilityController, ReturnEligibility, String>(
      ReturnEligibilityController.new,
    );

/// Inconsistent, duplicate or shifting pages cannot prove absence. Retry the
/// read rather than granting eligibility from an incomplete offset snapshot.
void _checkPage(
  int requested,
  int page,
  int perPage,
  int total,
  int length,
  int? previousTotal,
) {
  final expected = (total - (requested - 1) * 100).clamp(0, 100);
  if (page != requested ||
      perPage != 100 ||
      total < 0 ||
      (previousTotal != null && total != previousTotal) ||
      length != expected) {
    throw const AppFailure(FailureKind.server);
  }
}

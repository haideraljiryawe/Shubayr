import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/storage/pending_request_store.dart';
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
          case 'received':
          case 'inspected':
          case 'refunded':
          case 'completed':
            final approved = item.approvedQuantity;
            if (approved == null ||
                !isValidQuantity(approved, min: 0, max: item.quantity)) {
              throw const AppFailure(FailureKind.server);
            }
            quantity = approved;
          case 'rejected':
            quantity = 0;
          default:
            throw const AppFailure(FailureKind.server);
        }
        consumed[item.orderItemId] = addQuantity(
          consumed[item.orderItemId] ?? 0,
          quantity,
        );
      }
    }
    // The order snapshot owns the unit rule, including when the live SKU is hidden.
    // Missing rules cannot authorize a return. Never guess from the base-unit name.
    if (order.status == 'delivered' &&
        order.items.any(
          (item) =>
              item.baseUnit == null ||
              item.baseUnit!.trim().isEmpty ||
              item.wholeUnitsOnly == null ||
              !isValidQuantity(
                item.quantity,
                wholeUnitsOnly: item.wholeUnitsOnly!,
              ) ||
              !isValidQuantity(
                consumed[item.id] ?? 0,
                min: 0,
                wholeUnitsOnly: item.wholeUnitsOnly!,
              ),
        )) {
      throw const AppFailure(FailureKind.server);
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
          (i) =>
              !returnReasonCodes.contains(i.reasonCode) ||
              (i.reason ?? reason ?? '').trim().isEmpty ||
              (i.reason ?? reason ?? '').trim().length > 1000 ||
              !isValidQuantity(
                i.quantity,
                wholeUnitsOnly:
                    current.order.items
                        .where((item) => item.id == i.orderItemId)
                        .firstOrNull
                        ?.wholeUnitsOnly ??
                    true,
                max: current.remaining[i.orderItemId] ?? 0,
              ),
        )) {
      throw const AppFailure(FailureKind.validation);
    }
    _submitting.add(key);
    final keepAlive = ref.keepAlive();
    try {
      final slot = ref.read(pendingReturnSlotProvider(orderId));
      if (slot == null) throw const AppFailure.unauthorized();
      final store = ref.read(pendingRequestStoreProvider);
      if (await store.read(slot) != null) {
        throw const AppFailure(FailureKind.conflict, code: 'PENDING_REQUEST');
      }
      if (!_owns(identity)) return null;
      final pending = await store.prepare(slot, {
        'order_id': orderId,
        'reason': ?reason,
        'items': [
          for (final item in items)
            {
              'order_item_id': item.orderItemId,
              'quantity': item.quantity,
              'reason': item.reason ?? reason,
              'reason_code': item.reasonCode,
            },
        ],
      });
      if (!_owns(identity)) return null;
      ReturnRequest request;
      try {
        request = await _sendReturn(
          ref.read(afterSalesRepositoryProvider),
          pending,
        );
      } catch (error) {
        if (isDefinitiveWriteRejection(error)) {
          await store.complete(slot, pending.id);
        }
        rethrow;
      }
      await store.complete(slot, pending.id);
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
      if (ref.mounted) ref.invalidate(pendingReturnProvider(orderId));
      keepAlive.close();
    }
  }

  Future<ReturnRequest?> retryPending() async {
    final identity = ref.read(ordersIdentityProvider);
    if (!_owns(identity) || _submitting.contains(identity)) return null;
    _submitting.add(identity!);
    final keepAlive = ref.keepAlive();
    final slot = ref.read(pendingReturnSlotProvider(orderId));
    final store = ref.read(pendingRequestStoreProvider);
    final repository = ref.read(afterSalesRepositoryProvider);
    try {
      if (slot == null) return null;
      final pending = await store.read(slot);
      if (pending == null || !_owns(identity)) return null;
      // Recovery always resends the durable payload and key. A later refusal
      // does not prove that an earlier ambiguous request was never applied.
      final result = await _sendReturn(repository, pending);
      await store.complete(slot, pending.id);
      if (!_owns(identity)) return null;
      ref.invalidateSelf();
      return result;
    } finally {
      _submitting.remove(identity);
      if (ref.mounted) ref.invalidate(pendingReturnProvider(orderId));
      keepAlive.close();
    }
  }
}

Future<ReturnRequest> _sendReturn(
  AfterSalesRepository repository,
  PendingRequest pending,
) {
  final body = pending.body;
  return repository.requestReturn(
    operationId: pending.id,
    orderId: body['order_id'] as String,
    reason: body['reason'] as String?,
    items: [
      for (final item in body['items'] as List)
        ReturnRequestItem(
          orderItemId: item['order_item_id'] as String,
          quantity: item['quantity'] as num,
          reason: item['reason'] as String?,
          reasonCode: item['reason_code'] as String?,
        ),
    ],
  );
}

final pendingReturnSlotProvider = Provider.autoDispose.family<String?, String>((
  ref,
  orderId,
) {
  final identity = ref.watch(ordersIdentityProvider);
  if (identity == null) return null;
  return PendingRequestStore.slot(
    ref.watch(appConfigProvider).apiBaseUrl,
    identity.customerId,
    'return',
    orderId,
  );
});
final pendingReturnProvider = FutureProvider.autoDispose
    .family<PendingRequest?, String>((ref, orderId) {
      final slot = ref.watch(pendingReturnSlotProvider(orderId));
      return slot == null
          ? null
          : ref.watch(pendingRequestStoreProvider).read(slot);
    });
final returnDetailProvider = FutureProvider.autoDispose
    .family<ReturnRequest, String>((ref, id) {
      if (ref.watch(ordersIdentityProvider) == null) {
        throw const AppFailure.unauthorized();
      }
      return ref.watch(afterSalesRepositoryProvider).fetchReturn(id);
    });

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

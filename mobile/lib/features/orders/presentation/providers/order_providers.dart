import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../cart/presentation/providers/cart_providers.dart';
import '../../data/order.dart';
import '../../data/order_repository_mock.dart';
import '../../data/order_repository_remote.dart';
import '../../data/order_tracking.dart';
import '../../domain/order_repository.dart';

/// Mock ⇄ remote switch for checkout (coupons + order placement) and reading
/// placed orders. The mock reads and clears the cart, so it takes the cart
/// repository.
final orderRepositoryProvider = Provider<OrderRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => OrderRepositoryMock(ref.watch(cartRepositoryProvider)),
    DataSource.remote => OrderRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// Private Orders state belongs to one authenticated customer session. Profile
/// edits do not change this key. A new scope also distinguishes signing out and
/// back into the same account before dependent providers have rebuilt.
final ordersIdentityProvider = Provider<({String customerId, Object scope})?>((
  ref,
) {
  final customerId = ref.watch(
    sessionControllerProvider.select((value) {
      final session = value.asData?.value;
      return session?.isSignedIn == true && session?.role == UserRole.customer
          ? session?.user?.id
          : null;
    }),
  );
  if (customerId == null || customerId.isEmpty) return null;
  return (customerId: customerId, scope: Object());
});

/// null selects all orders. Kept separately so refreshing after checkout or
/// cancellation preserves the selected filter within the same session only.
final orderStatusFilterProvider = StateProvider<String?>((ref) {
  ref.watch(ordersIdentityProvider);
  return null;
});

class OrderListState {
  const OrderListState({
    required this.page,
    required this.items,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final OrderPage page;
  final List<Order> items;
  final bool loadingMore;
  final Object? loadMoreError;

  bool get hasMore =>
      page.data.isNotEmpty && page.page * page.perPage < page.total;
}

/// Accumulates repository pages for the active status. Existing invalidation
/// after checkout/cancellation restarts at page one, keeping the filter.
class OrdersController extends AsyncNotifier<OrderListState> {
  static const _perPage = 20;
  int _generation = 0;

  @override
  Future<OrderListState> build() async {
    final identity = ref.watch(ordersIdentityProvider);
    final repository = ref.watch(orderRepositoryProvider);
    final status = ref.watch(orderStatusFilterProvider);
    _generation++;
    // Invalidate in-flight appends on session, filter or repository changes,
    // refresh and disposal, including switching away and back to the same key.
    ref.onDispose(() => _generation++);
    if (identity == null) throw const AppFailure.unauthorized();
    final page = await repository.fetchOrders(
      status: status,
      perPage: _perPage,
    );
    return OrderListState(page: page, items: page.data);
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    try {
      await future;
    } catch (_) {
      // The AsyncValue exposes the initial-page error and its retry action.
    }
  }

  Future<void> loadMore() async {
    final identity = ref.read(ordersIdentityProvider);
    final current = state.value;
    if (identity == null ||
        state.isLoading ||
        state.hasError ||
        current == null ||
        current.loadingMore ||
        !current.hasMore) {
      return;
    }
    final generation = _generation;
    final repository = ref.read(orderRepositoryProvider);
    final status = ref.read(orderStatusFilterProvider);
    state = AsyncData(
      OrderListState(
        page: current.page,
        items: current.items,
        loadingMore: true,
      ),
    );
    try {
      final page = await repository.fetchOrders(
        status: status,
        page: current.page.page + 1,
        perPage: current.page.perPage,
      );
      if (!ref.mounted ||
          ref.read(ordersIdentityProvider) != identity ||
          generation != _generation) {
        return;
      }
      // New orders can shift page boundaries between requests.
      final byId = {for (final order in current.items) order.id: order};
      for (final order in page.data) {
        byId[order.id] = order;
      }
      state = AsyncData(
        OrderListState(page: page, items: List.unmodifiable(byId.values)),
      );
    } catch (error) {
      if (!ref.mounted ||
          ref.read(ordersIdentityProvider) != identity ||
          generation != _generation) {
        return;
      }
      state = AsyncData(
        OrderListState(
          page: current.page,
          items: current.items,
          loadMoreError: error,
        ),
      );
    }
  }
}

final ordersProvider = AsyncNotifierProvider<OrdersController, OrderListState>(
  OrdersController.new,
);

/// A single order with its items.
final orderProvider = FutureProvider.autoDispose.family<Order, String>((
  ref,
  id,
) {
  if (ref.watch(ordersIdentityProvider) == null) {
    throw const AppFailure.unauthorized();
  }
  return ref.watch(orderRepositoryProvider).fetchOrder(id);
});

/// The status timeline for an order.
final orderTrackingProvider = FutureProvider.autoDispose
    .family<OrderTracking, String>((ref, id) {
      if (ref.watch(ordersIdentityProvider) == null) {
        throw const AppFailure.unauthorized();
      }
      return ref.watch(orderRepositoryProvider).fetchTracking(id);
    });

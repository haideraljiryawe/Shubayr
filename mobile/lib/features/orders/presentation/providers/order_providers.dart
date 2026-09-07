import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
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

/// The customer's orders, newest first (first page). Invalidated after placing
/// or cancelling an order so the list reflects the change. Not autoDispose: the
/// orders tab is kept alive by the shell, so it must be refreshed explicitly.
final ordersProvider = FutureProvider<OrderPage>(
  (ref) => ref.watch(orderRepositoryProvider).fetchOrders(),
);

/// A single order with its items.
final orderProvider = FutureProvider.autoDispose.family<Order, String>(
  (ref, id) => ref.watch(orderRepositoryProvider).fetchOrder(id),
);

/// The status timeline for an order.
final orderTrackingProvider =
    FutureProvider.autoDispose.family<OrderTracking, String>(
      (ref, id) => ref.watch(orderRepositoryProvider).fetchTracking(id),
    );

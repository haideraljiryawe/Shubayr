import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../cart/presentation/providers/cart_providers.dart';
import '../../data/order.dart';
import 'order_providers.dart';

enum OrderActionStatus { succeeded, failed, superseded, duplicate }

/// One caller's outcome, not global navigation or a persistent order snapshot.
class OrderActionResult {
  const OrderActionResult(this.status, {this.order, this.error});
  final OrderActionStatus status;
  final Order? order;
  final Object? error;
}

/// Keeps placement and its cache coordination alive if Checkout is closed.
class CheckoutController extends Notifier<bool> {
  Object? _owner;
  @override
  bool build() {
    _owner = ref.watch(ordersIdentityProvider);
    return false;
  }

  bool _owns(Object? owner) =>
      ref.mounted &&
      owner != null &&
      _owner == owner &&
      ref.read(ordersIdentityProvider) == owner;

  Future<OrderActionResult> place(String addressId) async {
    if (!ref.mounted) {
      return const OrderActionResult(OrderActionStatus.superseded);
    }
    final owner = ref.read(ordersIdentityProvider);
    if (!_owns(owner)) {
      return const OrderActionResult(OrderActionStatus.superseded);
    }
    if (state) return const OrderActionResult(OrderActionStatus.duplicate);
    final keepAlive = ref.keepAlive();
    state = true;
    try {
      final repository = ref.read(orderRepositoryProvider);
      Order? placed;
      final result = await ref.read(cartControllerProvider.notifier).checkout((
        cart,
      ) async {
        if (!_owns(owner)) throw const AppFailure.unauthorized();
        final order = await repository.placeOrder(
          addressId: addressId,
          couponCode: cart.couponCode,
        );
        if (!_owns(owner)) return;
        placed = order;
        ref.invalidate(ordersProvider);
      });
      if (!_owns(owner)) {
        return const OrderActionResult(OrderActionStatus.superseded);
      }
      // Placement already succeeded even if the subsequent cart read failed.
      // The cart exposes that read failure and cannot authorize another checkout.
      if (placed != null) {
        return OrderActionResult(OrderActionStatus.succeeded, order: placed);
      }
      return OrderActionResult(switch (result.status) {
        CartMutationStatus.duplicate => OrderActionStatus.duplicate,
        CartMutationStatus.superseded => OrderActionStatus.superseded,
        _ => OrderActionStatus.failed,
      }, error: result.error);
    } catch (error) {
      return _owns(owner)
          ? OrderActionResult(OrderActionStatus.failed, error: error)
          : const OrderActionResult(OrderActionStatus.superseded);
    } finally {
      if (_owns(owner)) state = false;
      keepAlive.close();
    }
  }
}

final checkoutControllerProvider =
    NotifierProvider.autoDispose<CheckoutController, bool>(
      CheckoutController.new,
    );

/// One in-flight cancellation per order/session, independent of its detail page.
class OrderCancellationController extends Notifier<bool> {
  OrderCancellationController(this.orderId);
  final String orderId;
  Object? _owner;
  @override
  bool build() {
    _owner = ref.watch(ordersIdentityProvider);
    return false;
  }

  bool _owns(Object? owner) =>
      ref.mounted &&
      owner != null &&
      _owner == owner &&
      ref.read(ordersIdentityProvider) == owner;

  Future<OrderActionResult> cancel() async {
    if (!ref.mounted) {
      return const OrderActionResult(OrderActionStatus.superseded);
    }
    final owner = ref.read(ordersIdentityProvider);
    if (!_owns(owner)) {
      return const OrderActionResult(OrderActionStatus.superseded);
    }
    if (state) return const OrderActionResult(OrderActionStatus.duplicate);
    final keepAlive = ref.keepAlive();
    state = true;
    try {
      final order = await ref
          .read(orderRepositoryProvider)
          .cancelOrder(orderId);
      if (!_owns(owner)) {
        return const OrderActionResult(OrderActionStatus.superseded);
      }
      ref
        ..invalidate(orderProvider(orderId))
        ..invalidate(orderTrackingProvider(orderId))
        ..invalidate(ordersProvider);
      return OrderActionResult(OrderActionStatus.succeeded, order: order);
    } catch (error) {
      return _owns(owner)
          ? OrderActionResult(OrderActionStatus.failed, error: error)
          : const OrderActionResult(OrderActionStatus.superseded);
    } finally {
      if (_owns(owner)) state = false;
      keepAlive.close();
    }
  }
}

final orderCancellationProvider = NotifierProvider.autoDispose
    .family<OrderCancellationController, bool, String>(
      OrderCancellationController.new,
    );

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/error/response_decode.dart';
import '../../../cart/presentation/providers/cart_providers.dart';
import '../../../cart/data/cart.dart';
import '../../data/order.dart';
import 'order_providers.dart';

enum OrderActionStatus { succeeded, failed, superseded, duplicate }

/// One caller's outcome, not global navigation or a persistent order snapshot.
class OrderActionResult {
  const OrderActionResult(
    this.status, {
    this.order,
    this.error,
    this.priceChanges = const [],
  });
  final List<ApiFieldError> priceChanges;
  final OrderActionStatus status;
  final Order? order;
  final Object? error;
}

/// Keeps placement and its cache coordination alive if Checkout is closed.
class CheckoutController extends Notifier<bool> {
  List<ApiFieldError> _priceChanges = const [];
  Cart? _priceCart;
  String? _priceAddress;
  Object? _owner;
  @override
  bool build() {
    _owner = ref.watch(ordersIdentityProvider);
    _priceChanges = const [];
    _priceCart = null;
    _priceAddress = null;
    return false;
  }

  bool _owns(Object? owner) =>
      ref.mounted &&
      owner != null &&
      _owner == owner &&
      ref.read(ordersIdentityProvider) == owner;

  Future<OrderActionResult> place(
    String addressId, {
    List<ApiFieldError>? acceptedPriceChanges,
  }) async {
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
      var offered = <ApiFieldError>[];
      final result = await ref.read(cartControllerProvider.notifier).checkout((
        cart,
      ) async {
        if (!_owns(owner)) throw const AppFailure.unauthorized();
        // An acceptance is valid only for the exact cart/address/session that
        // received the conflict. Coupon or quantity mutations invalidate it.
        final accepted = acceptedPriceChanges ?? const <ApiFieldError>[];
        if (acceptedPriceChanges != null &&
            (!identical(acceptedPriceChanges, _priceChanges) ||
                accepted.isEmpty ||
                !identical(cart, _priceCart) ||
                addressId != _priceAddress)) {
          _priceChanges = const [];
          throw const AppFailure(FailureKind.validation);
        }
        _priceChanges = const [];
        Order order;
        try {
          order = await repository.placeOrder(
            addressId: addressId,
            couponCode: cart.couponCode,
            acceptedPriceVersions: [
              for (final change in accepted)
                (
                  variantId: change.variantId!,
                  priceVersion: change.newPriceVersion!,
                ),
            ],
          );
        } on AppFailure catch (error) {
          if (_owns(owner) &&
              error.statusCode == 409 &&
              error.code == 'PRICE_CHANGED' &&
              _validPriceChanges(error.errors, cart)) {
            offered = List.unmodifiable(error.errors);
            _priceChanges = offered;
            _priceCart = cart;
            _priceAddress = addressId;
          }
          rethrow;
        }
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
      return OrderActionResult(
        switch (result.status) {
          CartMutationStatus.duplicate => OrderActionStatus.duplicate,
          CartMutationStatus.superseded => OrderActionStatus.superseded,
          _ => OrderActionStatus.failed,
        },
        error: result.error,
        priceChanges: offered,
      );
    } catch (error, stack) {
      return _owns(owner)
          ? OrderActionResult(
              OrderActionStatus.failed,
              error: actionFailure(error, stack),
            )
          : const OrderActionResult(OrderActionStatus.superseded);
    } finally {
      if (_owns(owner)) state = false;
      keepAlive.close();
    }
  }

  bool _validPriceChanges(List<ApiFieldError> changes, Cart cart) {
    if (changes.isEmpty) return false;
    final variants = <String>{};
    return changes.every(
      (change) =>
          change.code == 'PRICE_CHANGED' &&
          change.variantId != null &&
          cart.items.any((item) => item.variantId == change.variantId) &&
          variants.add(change.variantId!) &&
          change.newPriceVersion != null &&
          change.newPriceVersion!.isNotEmpty &&
          change.newPriceVersion!.length <= 64 &&
          change.oldPrice != null &&
          change.oldPrice!.isFinite &&
          change.oldPrice! >= 0 &&
          change.newPrice != null &&
          change.newPrice!.isFinite &&
          change.newPrice! >= 0,
    );
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

  Future<OrderActionResult> cancel({required int version}) async {
    if (!ref.mounted) {
      return const OrderActionResult(OrderActionStatus.superseded);
    }
    final owner = ref.read(ordersIdentityProvider);
    if (!_owns(owner)) {
      return const OrderActionResult(OrderActionStatus.superseded);
    }
    if (state) return const OrderActionResult(OrderActionStatus.duplicate);
    if (version < 1) {
      return const OrderActionResult(
        OrderActionStatus.failed,
        error: AppFailure(FailureKind.validation),
      );
    }
    final keepAlive = ref.keepAlive();
    state = true;
    try {
      final order = await ref
          .read(orderRepositoryProvider)
          .cancelOrder(orderId, version: version);
      if (!_owns(owner)) {
        return const OrderActionResult(OrderActionStatus.superseded);
      }
      ref
        ..invalidate(orderProvider(orderId))
        ..invalidate(orderTrackingProvider(orderId))
        ..invalidate(ordersProvider);
      return OrderActionResult(OrderActionStatus.succeeded, order: order);
    } catch (error, stack) {
      if (_owns(owner) && error is AppFailure && error.statusCode == 409) {
        ref
          ..invalidate(orderProvider(orderId))
          ..invalidate(orderTrackingProvider(orderId))
          ..invalidate(ordersProvider);
      }
      return _owns(owner)
          ? OrderActionResult(
              OrderActionStatus.failed,
              error: actionFailure(error, stack),
            )
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

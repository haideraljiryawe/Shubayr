import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/error/response_decode.dart';
import '../../../../core/storage/pending_request_store.dart';
import '../../domain/order_repository.dart';
import 'pending_checkout_provider.dart';
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
          final slot = ref.read(pendingCheckoutSlotProvider)!;
          final store = ref.read(pendingRequestStoreProvider);
          if (await store.read(slot) != null) {
            throw const AppFailure(
              FailureKind.conflict,
              code: 'PENDING_REQUEST',
            );
          }
          if (!_owns(owner)) throw const AppFailure.unauthorized();
          final request = await store.prepare(slot, {
            'address_id': addressId,
            'coupon_code': ?cart.couponCode,
            'payment_method': 'cod',
            if (accepted.isNotEmpty)
              'accepted_price_versions': [
                for (final change in accepted)
                  {
                    'variant_id': change.variantId!,
                    'price_version': change.newPriceVersion!,
                  },
              ],
          });
          if (!_owns(owner)) throw const AppFailure.unauthorized();
          try {
            order = await _sendPending(repository, request);
          } catch (error) {
            // Only a definitive rejection of this first attempt releases its
            // key. Unknown outcomes remain durable until explicit recovery.
            if (isDefinitiveWriteRejection(error)) {
              await store.complete(slot, request.id);
            }
            rethrow;
          }
          await store.complete(slot, request.id);
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
      if (_owns(owner)) {
        state = false;
        ref.invalidate(pendingCheckoutProvider);
      }
      keepAlive.close();
    }
  }

  /// Explicitly resolves a previous uncertain order, using its original payload.
  /// It may have already consumed the cart, so do not require a nonempty cart.
  Future<OrderActionResult> recover() async {
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
      final slot = ref.read(pendingCheckoutSlotProvider)!;
      final store = ref.read(pendingRequestStoreProvider);
      final repository = ref.read(orderRepositoryProvider);
      final request = await store.read(slot);
      if (!_owns(owner)) {
        return const OrderActionResult(OrderActionStatus.superseded);
      }
      if (request == null) {
        return const OrderActionResult(
          OrderActionStatus.failed,
          error: AppFailure(FailureKind.validation),
        );
      }
      Order? placed;
      final result = await ref
          .read(cartControllerProvider.notifier)
          .recoverCheckout(() async {
            if (!_owns(owner)) throw const AppFailure.unauthorized();
            // Even a later 4xx cannot establish that the original attempt failed.
            final order = await _sendPending(repository, request);
            await store.complete(slot, request.id);
            if (!_owns(owner)) return;
            placed = order;
            ref.invalidate(ordersProvider);
          });
      if (!_owns(owner)) {
        return const OrderActionResult(OrderActionStatus.superseded);
      }
      if (placed != null) {
        return OrderActionResult(OrderActionStatus.succeeded, order: placed);
      }
      return OrderActionResult(OrderActionStatus.failed, error: result.error);
    } catch (error, stack) {
      return _owns(owner)
          ? OrderActionResult(
              OrderActionStatus.failed,
              error: actionFailure(error, stack),
            )
          : const OrderActionResult(OrderActionStatus.superseded);
    } finally {
      if (_owns(owner)) {
        state = false;
        ref.invalidate(pendingCheckoutProvider);
      }
      keepAlive.close();
    }
  }

  Future<Order> _sendPending(
    OrderRepository repository,
    PendingRequest request,
  ) => decodeResponse(() async {
    final body = request.body;
    if (body['address_id'] is! String ||
        (body['address_id'] as String).isEmpty ||
        body['payment_method'] != 'cod' ||
        body.keys.any(
          (key) => !const {
            'address_id',
            'coupon_code',
            'payment_method',
            'accepted_price_versions',
          }.contains(key),
        )) {
      throw const FormatException('Invalid saved checkout');
    }
    final accepted = body['accepted_price_versions'] as List? ?? const [];
    final versions = <({String variantId, String priceVersion})>[];
    for (final value in accepted) {
      final line = value as Map;
      final variant = line['variant_id'] as String;
      final version = line['price_version'] as String;
      if (variant.isEmpty || version.isEmpty || version.length > 64) {
        throw const FormatException('Invalid saved acceptance');
      }
      versions.add((variantId: variant, priceVersion: version));
    }
    return repository.placeOrder(
      idempotencyKey: request.id,
      addressId: body['address_id'] as String,
      couponCode: body['coupon_code'] as String?,
      acceptedPriceVersions: versions,
    );
  });

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

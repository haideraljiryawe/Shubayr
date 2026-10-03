import '../../../../core/utils/quantity.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/cart.dart';
import '../../data/cart_repository_mock.dart';
import '../../data/cart_repository_remote.dart';
import '../../domain/cart_repository.dart';

/// Mock ⇄ remote switch for the cart.
final cartRepositoryProvider = Provider<CartRepository>((ref) {
  ref.watch(_cartSessionProvider);
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => CartRepositoryMock(),
    DataSource.remote => CartRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// A narrow ownership key, renewed even on logout/login to the same customer.
/// Profile edits with the same customer ID do not restart the cart workflow.
final _cartSessionProvider = Provider<Object?>((ref) {
  final customerId = ref.watch(
    sessionControllerProvider.select((value) {
      final session = value.asData?.value;
      return session?.isSignedIn == true && session?.role == UserRole.customer
          ? session?.user?.id
          : null;
    }),
  );
  return customerId == null || customerId.isEmpty ? null : Object();
});

enum CartMutationStatus { succeeded, failed, superseded, duplicate }

/// The outcome of one action, separate from the last valid cart snapshot.
class CartMutationResult {
  const CartMutationResult(this.status, {this.error});
  final CartMutationStatus status;
  final Object? error;
}

/// Serializes reads and writes of the shared cart aggregate within a session.
/// API v9 has no cart revision or conditional-write contract to order snapshots.
class CartController extends AsyncNotifier<Cart> {
  Object? _owner;
  Future<void> _operations = Future.value();
  Set<Object> _pending = {};
  int _loadGeneration = 0;

  @override
  Future<Cart> build() {
    final owner = ref.watch(_cartSessionProvider);
    final repository = ref.watch(cartRepositoryProvider);
    _loadGeneration++;
    if (_owner != owner) {
      _owner = owner;
      _operations = Future.value();
      _pending = {};
      // Consumers of AsyncValue.value (including the badge) must not see the
      // previous customer's snapshot while the new customer's read is pending.
      state = const AsyncData(Cart());
      // Keep provider.future pending until the new session has actually loaded.
      state = const AsyncLoading();
    }
    if (owner == null) return Future.value(const Cart());
    return _enqueue(() async {
      if (!_owns(owner)) return const Cart();
      return repository.fetchCart();
    });
  }

  Future<CartMutationResult> add({
    required String productId,
    String? variantId,
    num quantity = 1,
  }) => _run((r) {
    if (!isValidQuantity(quantity, max: 99)) {
      throw const AppFailure(FailureKind.validation);
    }
    return r.addItem(
      productId: productId,
      variantId: variantId,
      quantity: quantity,
    );
  }, duplicateKey: ('add', productId, variantId, quantity));

  Future<CartMutationResult> setQuantity(String itemId, num quantity) =>
      _run((r) {
        if (!isValidQuantity(quantity, max: 99)) {
          throw const AppFailure(FailureKind.validation);
        }
        return r.updateItem(itemId, quantity);
      });

  Future<CartMutationResult> remove(String itemId) =>
      _run((r) => r.removeItem(itemId), duplicateKey: ('remove', itemId));

  Future<CartMutationResult> applyCoupon(String code) => _run(
    (r) => r.applyCoupon(code),
    duplicateKey: ('coupon', code),
    requireFreshSnapshot: true,
  );

  Future<CartMutationResult> removeCoupon() => _run(
    (r) => r.removeCoupon(),
    duplicateKey: 'remove-coupon',
    requireFreshSnapshot: true,
  );

  /// Order placement consumes the cart, so it shares the existing mutation
  /// queue. Orders owns the POST; Cart owns ordering and its server re-read.
  Future<CartMutationResult> checkout(Future<void> Function(Cart) placeOrder) {
    if (!ref.mounted) {
      return Future.value(
        const CartMutationResult(CartMutationStatus.superseded),
      );
    }
    final owner = ref.read(_cartSessionProvider);
    final generation = _loadGeneration;
    return _run((repository) async {
      final previous = state;
      final cart = previous.asData?.value;
      if (previous.isLoading ||
          previous.hasError ||
          cart == null ||
          !cart.canCheckout) {
        throw const AppFailure(FailureKind.validation);
      }
      state = const AsyncLoading();
      try {
        await placeOrder(cart);
      } catch (_) {
        if (owner != null && _owns(owner) && generation == _loadGeneration) {
          state = previous;
        }
        rethrow;
      }
      if (owner == null || !_owns(owner)) return const Cart();
      try {
        return await repository.fetchCart();
      } catch (error, stack) {
        if (_owns(owner) && generation == _loadGeneration) {
          state = AsyncError(error, stack);
        }
        rethrow;
      }
    }, duplicateKey: 'checkout');
  }

  bool _owns(Object owner) =>
      ref.mounted && ref.read(_cartSessionProvider) == owner;

  Future<T> _enqueue<T>(Future<T> Function() operation) {
    final task = _operations.then((_) => operation());
    // A failure belongs to its caller and must never poison the queue.
    _operations = task.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return task;
  }

  Future<CartMutationResult> _run(
    Future<Cart> Function(CartRepository) operation, {
    Object? duplicateKey,
    bool requireFreshSnapshot = false,
  }) {
    if (!ref.mounted) {
      return Future.value(
        const CartMutationResult(CartMutationStatus.superseded),
      );
    }
    final owner = ref.read(_cartSessionProvider);
    if (owner == null) {
      return Future.value(
        const CartMutationResult(
          CartMutationStatus.failed,
          error: AppFailure.unauthorized(),
        ),
      );
    }
    // An old notifier handle may be called before its dependency rebuild.
    if (owner != _owner) {
      return Future.value(
        const CartMutationResult(CartMutationStatus.superseded),
      );
    }
    final pending = _pending;
    if (duplicateKey != null && !pending.add(duplicateKey)) {
      return Future.value(
        const CartMutationResult(CartMutationStatus.duplicate),
      );
    }
    final repository = ref.read(cartRepositoryProvider);
    final generation = _loadGeneration;
    return _enqueue(() async {
      try {
        if (!_owns(owner)) {
          return const CartMutationResult(CartMutationStatus.superseded);
        }
        if (requireFreshSnapshot && generation == _loadGeneration) {
          state = const AsyncLoading();
        }
        final cart = await operation(repository);
        if (!_owns(owner)) {
          return const CartMutationResult(CartMutationStatus.superseded);
        }
        // A refresh queued behind this write owns the next displayed snapshot.
        if (generation == _loadGeneration) state = AsyncData(cart);
        return const CartMutationResult(CartMutationStatus.succeeded);
      } catch (error, stack) {
        if (!_owns(owner)) {
          return const CartMutationResult(CartMutationStatus.superseded);
        }
        // Coupon application can succeed before the reprice read fails. Until
        // retry verifies the server cart, its former totals are not trustworthy.
        if (requireFreshSnapshot && generation == _loadGeneration) {
          state = AsyncError(error, stack);
        }
        // Ordinary line mutations retain the last valid cart (C02).
        return CartMutationResult(CartMutationStatus.failed, error: error);
      } finally {
        if (duplicateKey != null) pending.remove(duplicateKey);
      }
    });
  }
}

final cartControllerProvider = AsyncNotifierProvider<CartController, Cart>(
  CartController.new,
);

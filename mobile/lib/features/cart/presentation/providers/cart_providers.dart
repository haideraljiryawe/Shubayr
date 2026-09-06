import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/cart.dart';
import '../../data/cart_repository_mock.dart';
import '../../data/cart_repository_remote.dart';
import '../../domain/cart_repository.dart';

/// Mock ⇄ remote switch for the cart.
final cartRepositoryProvider = Provider<CartRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => CartRepositoryMock(),
    DataSource.remote => CartRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// Owns the current cart. Loads from the server while signed in and is empty
/// for a guest; every mutation replaces the state with the server's truth.
class CartController extends AsyncNotifier<Cart> {
  @override
  Future<Cart> build() async {
    final signedIn = ref.watch(
      sessionControllerProvider.select(
        (s) => s.valueOrNull?.isSignedIn ?? false,
      ),
    );
    if (!signedIn) return const Cart();
    return ref.read(cartRepositoryProvider).fetchCart();
  }

  Future<void> add({
    required String productId,
    String? variantId,
    int quantity = 1,
  }) => _run(
    (r) => r.addItem(
      productId: productId,
      variantId: variantId,
      quantity: quantity,
    ),
  );

  Future<void> setQuantity(String itemId, int quantity) =>
      _run((r) => r.updateItem(itemId, quantity));

  Future<void> remove(String itemId) => _run((r) => r.removeItem(itemId));

  Future<void> _run(Future<Cart> Function(CartRepository) op) async {
    final repo = ref.read(cartRepositoryProvider);
    state = await AsyncValue.guard(() => op(repo));
  }
}

final cartControllerProvider = AsyncNotifierProvider<CartController, Cart>(
  CartController.new,
);

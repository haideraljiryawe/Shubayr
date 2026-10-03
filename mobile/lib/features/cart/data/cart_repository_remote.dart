import '../../../core/error/failure.dart';
import '../../../core/utils/quantity.dart';
import '../../../core/network/api_client.dart';
import '../domain/cart_repository.dart';
import 'cart.dart';

class CartRepositoryRemote implements CartRepository {
  const CartRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Cart> fetchCart() async =>
      Cart.fromJson(await _api.get<Map<String, dynamic>>('/cart'));

  @override
  Future<Cart> addItem({
    required String productId,
    String? variantId,
    num quantity = 1,
  }) async => Cart.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/cart/items',
      body: {
        'product_id': productId,
        'variant_id': ?variantId,
        'quantity': _validatedQuantity(quantity),
      },
    ),
  );

  @override
  Future<Cart> updateItem(String itemId, num quantity) async => Cart.fromJson(
    await _api.patch<Map<String, dynamic>>(
      '/cart/items/$itemId',
      body: {'quantity': _validatedQuantity(quantity)},
    ),
  );

  @override
  Future<Cart> removeItem(String itemId) async {
    // DELETE returns 204 (no body); re-read the cart for the updated state.
    await _api.deleteVoid('/cart/items/$itemId');
    return fetchCart();
  }
}

num _validatedQuantity(num quantity) {
  if (!isValidQuantity(quantity, max: 99)) {
    throw const AppFailure(FailureKind.validation);
  }
  return quantity;
}

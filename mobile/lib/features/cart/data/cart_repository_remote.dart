import '../../../core/error/failure.dart';
import '../../../core/utils/quantity.dart';
import '../../../core/network/api_client.dart';
import '../../../core/error/response_decode.dart';
import '../domain/cart_repository.dart';
import 'cart.dart';

class CartRepositoryRemote implements CartRepository {
  const CartRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<Cart> fetchCart() => decodeResponse(
    () async => Cart.fromJson(await _api.get<Map<String, dynamic>>('/cart')),
  );

  @override
  Future<Cart> applyCoupon(String code) => decodeResponse(() async {
    try {
      await _api.post<Map<String, dynamic>>(
        '/coupons/validate',
        body: {'code': code},
      );
    } on AppFailure catch (failure) {
      // API 11: this operation's 404 means invalid, expired or exhausted code.
      // A subsequent cart-read failure is not a coupon rejection.
      if (failure.kind == FailureKind.notFound) {
        throw const AppFailure(
          FailureKind.notFound,
          statusCode: 404,
          code: 'COUPON_REJECTED',
        );
      }
      rethrow;
    }
    return fetchCart();
  });

  @override
  Future<Cart> removeCoupon() => decodeResponse(
    () async =>
        Cart.fromJson(await _api.delete<Map<String, dynamic>>('/cart/coupon')),
  );

  @override
  Future<Cart> addItem({
    required String idempotencyKey,
    required String productId,
    String? variantId,
    num quantity = 1,
  }) => decodeResponse(
    () async => Cart.fromJson(
      await _api.post<Map<String, dynamic>>(
        '/cart/items',
        headers: {'Idempotency-Key': idempotencyKey},
        body: {
          'product_id': productId,
          'variant_id': ?variantId,
          'quantity': _validatedQuantity(quantity),
        },
      ),
    ),
  );

  @override
  Future<Cart> updateItem(String itemId, num quantity) => decodeResponse(
    () async => Cart.fromJson(
      await _api.patch<Map<String, dynamic>>(
        '/cart/items/$itemId',
        body: {'quantity': _validatedQuantity(quantity)},
      ),
    ),
  );

  @override
  Future<Cart> removeItem(String itemId) => decodeResponse(() async {
    // DELETE returns 204 (no body); re-read the cart for the updated state.
    await _api.deleteVoid('/cart/items/$itemId');
    return fetchCart();
  });
}

num _validatedQuantity(num quantity) {
  if (!isValidQuantity(quantity, max: 99)) {
    throw const AppFailure(FailureKind.validation);
  }
  return quantity;
}

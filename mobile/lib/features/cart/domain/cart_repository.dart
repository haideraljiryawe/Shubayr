import '../data/cart.dart';

/// The cart is server-side and user-scoped (auth required). Every mutation
/// returns the updated [Cart] so the UI always renders the server's truth.
abstract interface class CartRepository {
  /// `GET /cart`.
  Future<Cart> fetchCart();

  /// `POST /coupons/validate`, then `GET /cart` for authoritative totals.
  Future<Cart> applyCoupon(String code);

  /// `DELETE /cart/coupon` returns the repriced cart.
  Future<Cart> removeCoupon();

  /// `POST /cart/items`.
  Future<Cart> addItem({
    required String productId,
    String? variantId,
    num quantity = 1,
  });

  /// `PATCH /cart/items/{id}`.
  Future<Cart> updateItem(String itemId, num quantity);

  /// `DELETE /cart/items/{id}`.
  Future<Cart> removeItem(String itemId);
}

import '../data/wishlist_item.dart';

/// The wishlist is server-side and user-scoped (auth required).
abstract interface class WishlistRepository {
  /// `GET /wishlist`.
  Future<WishlistPage> fetchWishlist({int page = 1, int perPage = 20});

  /// `POST /wishlist` — add a product; returns the created item.
  Future<WishlistItem> add(String productId);

  /// `DELETE /wishlist/{productId}` — remove a product.
  Future<void> remove(String productId);
}

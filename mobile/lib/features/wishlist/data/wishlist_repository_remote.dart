import '../../../core/network/api_client.dart';
import '../domain/wishlist_repository.dart';
import 'wishlist_item.dart';

class WishlistRepositoryRemote implements WishlistRepository {
  const WishlistRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<WishlistPage> fetchWishlist() async => WishlistPage.fromJson(
    await _api.get<Map<String, dynamic>>('/wishlist'),
  );

  @override
  Future<WishlistItem> add(String productId) async => WishlistItem.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/wishlist',
      body: {'product_id': productId},
    ),
  );

  @override
  Future<void> remove(String productId) =>
      _api.deleteVoid('/wishlist/$productId');
}

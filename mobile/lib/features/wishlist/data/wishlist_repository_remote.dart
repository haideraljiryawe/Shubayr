import '../../../core/network/api_client.dart';
import '../../../core/error/response_decode.dart';
import '../domain/wishlist_repository.dart';
import 'wishlist_item.dart';

class WishlistRepositoryRemote implements WishlistRepository {
  const WishlistRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<WishlistPage> fetchWishlist({int page = 1, int perPage = 20}) =>
      decodeResponse(
        () async => WishlistPage.fromJson(
          await _api.get<Map<String, dynamic>>(
            '/wishlist',
            query: {'page': '$page', 'per_page': '$perPage'},
          ),
        ),
      );

  @override
  Future<WishlistItem> add(String productId) => decodeResponse(
    () async => WishlistItem.fromJson(
      await _api.post<Map<String, dynamic>>(
        '/wishlist',
        body: {'product_id': productId},
      ),
    ),
  );

  @override
  Future<void> remove(String productId) =>
      _api.deleteVoid('/wishlist/$productId');
}

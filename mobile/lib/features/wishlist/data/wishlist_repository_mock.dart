import '../domain/wishlist_repository.dart';
import 'wishlist_item.dart';

/// In-memory wishlist for development. Stores product ids (the screen looks
/// each product up from the catalog, like the cart does) and seeds a couple so
/// the list isn't empty on a fresh account.
class WishlistRepositoryMock implements WishlistRepository {
  WishlistRepositoryMock({this.delay = const Duration(milliseconds: 300)}) {
    final now = DateTime.now();
    _items.addAll([
      WishlistItem(
        id: 'wl-p2',
        productId: 'p2',
        addedAt: now.subtract(const Duration(days: 1)),
      ),
      WishlistItem(
        id: 'wl-p5',
        productId: 'p5',
        addedAt: now.subtract(const Duration(days: 3)),
      ),
    ]);
  }

  final Duration delay;
  final List<WishlistItem> _items = [];

  @override
  Future<WishlistPage> fetchWishlist() async {
    await Future<void>.delayed(delay);
    final data = [..._items]..sort((a, b) {
      final at = a.addedAt, bt = b.addedAt;
      if (at == null || bt == null) return 0;
      return bt.compareTo(at); // newest first
    });
    return WishlistPage(total: data.length, data: data);
  }

  @override
  Future<WishlistItem> add(String productId) async {
    await Future<void>.delayed(delay);
    for (final w in _items) {
      if (w.productId == productId) return w; // already saved — idempotent
    }
    final item = WishlistItem(
      id: 'wl-$productId',
      productId: productId,
      addedAt: DateTime.now(),
    );
    _items.add(item);
    return item;
  }

  @override
  Future<void> remove(String productId) async {
    await Future<void>.delayed(delay);
    _items.removeWhere((w) => w.productId == productId);
  }
}

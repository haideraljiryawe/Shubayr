import '../domain/wishlist_repository.dart';
import 'wishlist_item.dart';

/// In-memory wishlist for development. Stores product ids (the screen looks
/// each product up from the catalog, like the cart does) and seeds ten so
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
      for (final (index, productId) in [
        'p3',
        'p4',
        'p6',
        'p7',
        'p8',
        'p9',
        'p10',
        'p11',
      ].indexed)
        WishlistItem(
          id: 'wl-$productId',
          productId: productId,
          addedAt: now.subtract(Duration(days: 4 + index)),
        ),
    ]);
  }

  final Duration delay;
  final List<WishlistItem> _items = [];

  @override
  Future<WishlistPage> fetchWishlist({int page = 1, int perPage = 20}) async {
    await Future<void>.delayed(delay);
    final data = [..._items]
      ..sort((a, b) {
        final at = a.addedAt, bt = b.addedAt;
        if (at == null || bt == null) return 0;
        return bt.compareTo(at); // newest first
      });
    return WishlistPage(
      page: page,
      perPage: perPage,
      total: data.length,
      data: data.skip((page - 1) * perPage).take(perPage).toList(),
    );
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

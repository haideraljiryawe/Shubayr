import '../../catalog/data/catalog_repository_mock.dart';
import '../domain/cart_repository.dart';
import 'cart.dart';

/// In-memory cart for development. Prices lines from the catalog mock, merges
/// duplicate product/variant lines, and recomputes the subtotal — the same
/// shape the server returns.
class CartRepositoryMock implements CartRepository {
  CartRepositoryMock({this.delay = const Duration(milliseconds: 250)});

  final Duration delay;
  final List<CartItem> _items = [];
  var _seq = 0;

  Cart _cart() {
    final subtotal = _items.fold<num>(0, (sum, i) => sum + i.lineTotal);
    return Cart(
      id: 'mock-cart',
      items: List.unmodifiable(_items),
      subtotal: subtotal,
    );
  }

  @override
  Future<Cart> fetchCart() async {
    await Future<void>.delayed(delay);
    return _cart();
  }

  @override
  Future<Cart> addItem({
    required String productId,
    String? variantId,
    int quantity = 1,
  }) async {
    await Future<void>.delayed(delay);
    final i = _items.indexWhere(
      (it) => it.productId == productId && it.variantId == variantId,
    );
    if (i >= 0) {
      _items[i] = _items[i].copyWith(quantity: _items[i].quantity + quantity);
    } else {
      _items.add(
        CartItem(
          id: 'ci-${_seq++}',
          productId: productId,
          variantId: variantId,
          quantity: quantity,
          unitPrice: CatalogRepositoryMock.unitPrice(productId, variantId),
        ),
      );
    }
    return _cart();
  }

  @override
  Future<Cart> updateItem(String itemId, int quantity) async {
    await Future<void>.delayed(delay);
    final i = _items.indexWhere((it) => it.id == itemId);
    if (i >= 0) _items[i] = _items[i].copyWith(quantity: quantity);
    return _cart();
  }

  @override
  Future<Cart> removeItem(String itemId) async {
    await Future<void>.delayed(delay);
    _items.removeWhere((it) => it.id == itemId);
    return _cart();
  }
}

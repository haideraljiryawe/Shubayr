import '../../../core/utils/quantity.dart';
import '../../../core/error/failure.dart';
import '../../orders/data/coupon.dart';
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
  Coupon? _coupon;

  Cart _cart() {
    final subtotal = _items.fold<num>(0, (sum, i) => sum + i.lineTotal);
    return Cart(
      id: 'mock-cart',
      items: List.unmodifiable(_items),
      subtotal: subtotal,
      discount: _coupon?.discountOn(subtotal) ?? 0,
      total: subtotal - (_coupon?.discountOn(subtotal) ?? 0),
      couponCode: _coupon?.code,
      currency: 'IQD',
    );
  }

  @override
  Future<Cart> fetchCart() async {
    await Future<void>.delayed(delay);
    return _cart();
  }

  @override
  Future<Cart> applyCoupon(String code) async {
    await Future<void>.delayed(delay);
    _coupon = switch (code.trim().toUpperCase()) {
      'SAVE10' => const Coupon(code: 'SAVE10', type: 'percentage', value: 10),
      'WELCOME' => const Coupon(code: 'WELCOME', type: 'fixed', value: 5000),
      _ => throw const AppFailure(FailureKind.notFound),
    };
    return _cart();
  }

  @override
  Future<Cart> removeCoupon() async {
    await Future<void>.delayed(delay);
    _coupon = null;
    return _cart();
  }

  @override
  Future<Cart> addItem({
    required String productId,
    String? variantId,
    num quantity = 1,
  }) async {
    await Future<void>.delayed(delay);
    final i = _items.indexWhere(
      (it) => it.productId == productId && it.variantId == variantId,
    );
    if (i >= 0) {
      final updatedQuantity = addQuantity(_items[i].quantity, quantity);
      _items[i] = _items[i].copyWith(
        quantity: updatedQuantity,
        lineTotal: _items[i].unitPrice * updatedQuantity,
      );
    } else {
      _items.add(
        CartItem(
          id: 'ci-${_seq++}',
          productId: productId,
          variantId: variantId,
          quantity: quantity,
          unitPrice: CatalogRepositoryMock.unitPrice(productId, variantId),
          lineTotal:
              CatalogRepositoryMock.unitPrice(productId, variantId) * quantity,
          currency: 'IQD',
          available: true,
          availableQty: 99,
        ),
      );
    }
    return _cart();
  }

  @override
  Future<Cart> updateItem(String itemId, num quantity) async {
    await Future<void>.delayed(delay);
    final i = _items.indexWhere((it) => it.id == itemId);
    if (i >= 0) {
      _items[i] = _items[i].copyWith(
        quantity: quantity,
        lineTotal: _items[i].unitPrice * quantity,
      );
    }
    return _cart();
  }

  @override
  Future<Cart> removeItem(String itemId) async {
    await Future<void>.delayed(delay);
    _items.removeWhere((it) => it.id == itemId);
    return _cart();
  }
}

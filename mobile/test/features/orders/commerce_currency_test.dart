import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/orders/data/order.dart';

void main() {
  test('server currency survives decoding, snapshots and local copies', () {
    final product = Product.fromJson({
      'id': 'p1',
      'category_id': 'c1',
      'name_ar': 'منتج',
      'name_en': 'Product',
      'price': 12.75,
      'currency': 'USD',
      'variants': [
        {'id': 'v1', 'attributes': null, 'currency': 'USD'},
      ],
    }).copyWith(images: []);
    expect(product.currency, 'USD');
    expect(product.variants.single.currency, 'USD');
    expect(product.variants.single.attributes, isEmpty);
    final cart = Cart.fromJson({
      'currency': 'USD',
      'subtotal': 12.75,
      'items': [
        {
          'id': 'i1',
          'product_id': 'p1',
          'unit_price': 12.75,
          'currency': 'USD',
        },
      ],
    });
    expect(cart.currency, 'USD');
    final updated = cart.items.single.copyWith(quantity: 2);
    expect(updated.currency, 'USD');
    expect(updated.lineTotal, 25.5);
    final order = Order.fromJson({
      'id': 'o1',
      'currency': 'USD',
      'total': 12.75,
      'items': [
        {
          'id': 'i1',
          'product_id': 'p1',
          'unit_price': 12.75,
          'currency': 'USD',
        },
      ],
    });
    final saved = Order.fromJson(order.toJson());
    expect(saved.currency, 'USD');
    expect(saved.items.single.currency, 'USD');
    expect(saved.items.single.unitPrice, 12.75);
    final delivery = Delivery.fromJson({
      'id': 'd1',
      'order_id': 'o1',
      'status': 'assigned',
      'currency': 'USD',
      'delivery_fee': 1.25,
    });
    expect(delivery.currency, 'USD');
    expect(delivery.deliveryFee, 1.25);
    expect(Order.fromJson({'id': 'legacy'}).currency, isNull);
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';

void main() {
  test('adds, merges, updates and removes with a running subtotal', () async {
    final cart = CartRepositoryMock(delay: Duration.zero);

    var c = await cart.addItem(
      idempotencyKey: 'test-add-key-0',
      productId: 'p1',
      quantity: 2,
    );
    expect(c.items.length, 1);
    expect(c.items.single.quantity, 2);

    // Same product/variant merges into the existing line.
    c = await cart.addItem(
      idempotencyKey: 'test-add-key-1',
      productId: 'p1',
      quantity: 1,
    );
    expect(c.items.length, 1);
    expect(c.items.single.quantity, 3);

    c = await cart.addItem(
      idempotencyKey: 'test-add-key-2',
      productId: 'p4',
      quantity: 1,
    );
    expect(c.items.length, 2);

    final expected =
        CatalogRepositoryMock.unitPrice('p1', null) * 3 +
        CatalogRepositoryMock.unitPrice('p4', null);
    expect(c.subtotal, expected);

    final p1Item = c.items.firstWhere((i) => i.productId == 'p1');
    c = await cart.updateItem(p1Item.id, 1);
    expect(c.items.firstWhere((i) => i.productId == 'p1').quantity, 1);

    c = await cart.removeItem(p1Item.id);
    expect(c.items.length, 1);
    expect(c.items.single.productId, 'p4');
  });
}

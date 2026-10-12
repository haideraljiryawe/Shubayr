import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/data/stock_availability.dart';

void main() {
  test('server labels survive decoding and product image updates', () {
    for (final (wire, label) in [
      ('out_of_stock', StockAvailability.outOfStock),
      ('low_stock', StockAvailability.lowStock),
      ('in_stock', StockAvailability.inStock),
    ]) {
      final product = Product.fromJson({
        'id': 'p',
        'category_id': 'c',
        'name_en': 'P',
        'name_ar': 'منتج',
        'price': 1000,
        'availability': wire,
      });
      expect(product.copyWith(media: []).availability, label);
      expect(product.toJson()['availability'], wire);
      expect(
        ProductVariant.fromJson({
          'id': 'v',
          'effective_price': 1000,
          'availability': wire,
        }).availability,
        label,
      );
      final availability = ProductAvailability.fromJson({
        'product_id': 'p',
        'available_qty': 0.125,
        'in_stock': true,
        'availability': wire,
        'variants': [
          {
            'variant_id': 'v',
            'available_qty': 0.125,
            'in_stock': true,
            'whole_units_only': false,
            'availability': wire,
          },
        ],
      });
      expect(availability.availability, label);
      expect(availability.forVariant('v')!.availability, label);
      expect(availability.forVariant('v')!.availableQty, 0.125);
      expect(availability.forVariant('v')!.wholeUnitsOnly, false);
    }
  });
}

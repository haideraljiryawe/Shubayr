import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/orders/data/order.dart';

Map<String, dynamic> pricedLine() => {
  'id': 'i',
  'product_id': 'p',
  'variant_id': 'v',
  'quantity': 0.125,
  'unit_price': 10000,
  'line_total': 1234,
  'currency': 'IQD',
  'available': true,
  'available_qty': 0.5,
};
Map<String, dynamic> pricedCart() => {
  'id': 'c',
  'items': [pricedLine()],
  'subtotal': 4321,
  'discount': 321,
  'delivery_fee': 750,
  'total': 4750,
  'coupon_code': 'SAVE',
  'currency': 'IQD',
};

void main() {
  test(
    'server line total survives fractional quantities and serialization',
    () {
      final item = CartItem.fromJson(pricedLine());
      expect(item.quantity, 0.125);
      expect(item.lineTotal, 1234); // Deliberately not 10000 * .125.
      expect(item.toJson()['line_total'], 1234);
      expect(item.copyWith(quantity: 0.25).lineTotal, 1234);
    },
  );
  test(
    'cart preserves every server summary value without reconstructing it',
    () {
      final cart = Cart.fromJson(pricedCart());
      for (final key in [
        'subtotal',
        'discount',
        'delivery_fee',
        'total',
        'coupon_code',
      ]) {
        expect(cart.toJson()[key], pricedCart()[key], reason: key);
      }
    },
  );
  for (final key in ['subtotal', 'discount', 'delivery_fee', 'total']) {
    for (final invalid in [null, '123', double.nan]) {
      test('invalid required cart $key ($invalid) fails explicitly', () {
        expect(
          () => Cart.fromJson({...pricedCart(), key: invalid}),
          throwsA(isA<AppFailure>()),
        );
      });
    }
    test('missing required cart $key fails explicitly', () {
      expect(
        () => Cart.fromJson(pricedCart()..remove(key)),
        throwsA(isA<AppFailure>()),
      );
    });
  }
  for (final key in ['unit_price', 'line_total']) {
    test(
      'missing required line $key is not replaced with arithmetic or zero',
      () {
        expect(
          () => CartItem.fromJson(pricedLine()..remove(key)),
          throwsA(isA<AppFailure>()),
        );
      },
    );
  }
  test(
    'SKU effective price and currency are preserved independently of delta',
    () {
      final variant = ProductVariant.fromJson({
        'id': 'v',
        'price_delta': 5000,
        'effective_price': 17000,
        'currency_code': 'USD',
      });
      expect(variant.toJson()['effective_price'], 17000);
      expect(variant.toJson()['currency_code'], 'USD');
      expect(variant.priceDelta, 5000);
    },
  );
  test('missing or malformed SKU effective price does not invent a price', () {
    for (final json in <Map<String, dynamic>>[
      {'id': 'v', 'price_delta': 5000},
      {'id': 'v', 'effective_price': null},
      {'id': 'v', 'effective_price': '17000'},
    ]) {
      expect(() => ProductVariant.fromJson(json), throwsA(isA<AppFailure>()));
    }
  });
  test(
    'optional product pricing precedence uses server values, never a schedule calculation',
    () {
      final base = <String, dynamic>{
        'id': 'p',
        'category_id': 'c',
        'name_en': 'P',
        'name_ar': 'P',
        'price': 10000,
      };
      expect(Product.fromJson(base).effectivePrice, 10000);
      expect(
        Product.fromJson({
          ...base,
          'on_sale': false,
          'discounted_price': 8000,
        }).effectivePrice,
        10000,
      );
      expect(
        Product.fromJson({
          ...base,
          'on_sale': true,
          'discounted_price': 8000,
        }).effectivePrice,
        8000,
      );
      expect(
        Product.fromJson({
          ...base,
          'on_sale': true,
          'discounted_price': 8000,
          'effective_price': 7000,
        }).effectivePrice,
        7000,
      );
      for (final invalid in [
        {...base, 'effective_price': null},
        {...base, 'effective_price': '7000'},
        {...base, 'on_sale': true},
        {...base, 'discount_type': 'percentage', 'discount_value': 20},
        {...base}..remove('price'),
      ]) {
        expect(() => Product.fromJson(invalid), throwsA(isA<AppFailure>()));
      }
    },
  );
  test(
    'checkout eligibility follows server availability, including fractional stock',
    () {
      expect(Cart.fromJson(pricedCart()).canCheckout, isTrue);
      expect(
        Cart.fromJson({
          ...pricedCart(),
          'items': [
            {...pricedLine(), 'available': false},
          ],
        }).canCheckout,
        isFalse,
      );
      expect(
        Cart.fromJson({...pricedCart(), 'items': []}).canCheckout,
        isFalse,
      );
      expect(
        () => CartItem.fromJson(pricedLine()..remove('available')),
        throwsA(isA<AppFailure>()),
      );
      expect(
        () => Cart.fromJson(pricedCart()..remove('currency')),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test('historical prices survive catalog repricing', () {
    final order = Order.fromJson({
      'id': 'o',
      'subtotal': 1234,
      'discount': 200,
      'delivery_fee': 500,
      'total': 1534,
      'currency': 'IQD',
      'items': [pricedLine()],
    });
    final changedProduct = Product.fromJson({
      'id': 'p',
      'category_id': 'c',
      'name_en': 'P',
      'name_ar': 'P',
      'price': 99000,
      'effective_price': 88000,
    });
    expect(changedProduct.salePrice, 88000);
    expect(order.items.single.unitPrice, 10000);
    expect(order.items.single.lineTotal, 1234);
    expect(order.total, 1534);
    expect(Order.fromJson(order.toJson()).total, 1534);
  });
}

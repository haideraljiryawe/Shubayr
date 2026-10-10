import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/orders/presentation/providers/after_sales_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/cart_repository_remote.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/return_request.dart';
import 'package:shubayr/features/orders/data/after_sales_repository_remote.dart';
import 'package:shubayr/features/monitoring/data/monitor_repository.dart';

void main() {
  test('SKU metadata and all stock fields preserve their scale', () {
    final variant = ProductVariant.fromJson({
      'id': 'v',
      'effective_price': 10000,
      'whole_units_only': false,
      'base_unit': 'kg',
      'available_qty': 0.125,
      'low_stock_threshold': 0.5,
    });
    expect(variant.wholeUnitsOnly, isFalse);
    expect(variant.baseUnit, 'kg');
    expect(variant.availableQty, 0.125);
    expect(variant.lowStockThreshold, 0.5);
    final row = VariantAvailability.fromJson({
      'variant_id': 'v',
      'whole_units_only': false,
      'base_unit': 'kg',
      'available_qty': 0.125,
      'low_stock_threshold': 0.5,
      'in_stock': true,
    });
    expect(row.wholeUnitsOnly, isFalse);
    expect(row.toJson()['available_qty'], 0.125);
    expect(row.lowStockThreshold, 0.5);
    final cart = CartItem.fromJson({
      'id': 'i',
      'product_id': 'p',
      'unit_price': 10000,
      'line_total': 1250,
      'currency': 'IQD',
      'available': true,
      'price_version': 'fixture-v1',
      'current_price_version': 'fixture-v1',
      'price_changed': false,
      'current_unit_price': 10000,
      'available_qty': 0.5,
    });
    expect(cart.availableQty, 0.5);
    expect(cart.copyWith(quantity: 0.125).availableQty, 0.5);
  });
  test('persisted pending returns consume fractions without binary drift', () {
    final eligibility = ReturnEligibility(
      const Order(
        id: "o",
        status: "delivered",
        items: [OrderItem(id: "i", productId: "p", quantity: 1)],
      ),
      [
        for (final q in [0.1, 0.2])
          ReturnRequest(
            id: 'r$q',
            orderId: 'o',
            reason: 'Damaged',
            items: [ReturnRequestItem(orderItemId: 'i', quantity: q)],
          ),
      ],
    );
    expect(eligibility.remaining['i'], 0.7);
    expect(eligibility.remaining['other'], isNull);
  });
  test('invalid cart and return quantities never reach transport', () async {
    final dio = Dio();
    addTearDown(dio.close);
    var calls = 0;
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          calls++;
          handler.reject(DioException(requestOptions: options));
        },
      ),
    );
    final cart = CartRepositoryRemote(ApiClient(dio));
    for (final q in [0, 0.0001, 99.001, double.nan]) {
      await expectLater(
        cart.addItem(
          idempotencyKey: 'test-add-key-0',
          productId: 'p',
          quantity: q,
        ),
        throwsA(isA<AppFailure>()),
      );
      await expectLater(cart.updateItem('i', q), throwsA(isA<AppFailure>()));
    }
    await expectLater(
      AfterSalesRepositoryRemote(ApiClient(dio)).requestReturn(
        orderId: 'o',
        items: const [ReturnRequestItem(orderItemId: 'i', quantity: 0.0001)],
      ),
      throwsA(isA<AppFailure>()),
    );
    expect(calls, 0);
  });

  for (final quantity in [1.5, 0.125, 2]) {
    test('cart quantity $quantity survives JSON round trip', () {
      final item = CartItem.fromJson({
        'id': 'line',
        'product_id': 'product',
        'unit_price': 10000,
        'line_total': 1250,
        'currency': 'IQD',
        'available': true,
        'price_version': 'fixture-v1',
        'current_price_version': 'fixture-v1',
        'price_changed': false,
        'current_unit_price': 10000,
        'available_qty': 10,
        'quantity': quantity,
      });
      expect(item.quantity, quantity);
      expect(
        CartItem.fromJson(jsonDecode(jsonEncode(item.toJson()))).quantity,
        quantity,
      );
    });
    test('historical and monitoring order quantity $quantity is preserved', () {
      final json = {
        'id': 'line',
        'product_id': 'product',
        'quantity': quantity,
        'product_name_en': 'Historical name',
        'line_total': 123,
      };
      final item = OrderItem.fromJson(json);
      expect(item.quantity, quantity);
      expect(item.toJson()['quantity'], quantity);
      expect(item.lineTotal, 123);
      expect(
        MonitorOrder.fromJson({
          'id': 'order',
          'customer_phone': '123',
          'items': [json],
        }).order.items.single.quantity,
        quantity,
      );
    });
    test('return quantity $quantity survives JSON round trip', () {
      final item = ReturnRequestItem.fromJson({
        'order_item_id': 'line',
        'quantity': quantity,
      });
      expect(item.quantity, quantity);
      expect(item.toJson()['quantity'], quantity);
    });
  }
  test('product and per-SKU availability retain 0.5', () {
    final product = Product.fromJson({
      'id': 'p',
      'category_id': 'c',
      'name_en': 'Coffee',
      'effective_price': 10000,
      'name_ar': '',
      'available_qty': 0.5,
    });
    expect(product.availableQty, 0.5);
    final availability = ProductAvailability.fromJson({
      'product_id': 'p',
      'in_stock': true,
      'available_qty': 0.5,
      'variants': [
        {'variant_id': 'v', 'in_stock': true, 'available_qty': 0.5},
      ],
    });
    expect(availability.availableQty, 0.5);
    expect(availability.forVariant('v')!.availableQty, 0.5);
  });
  test(
    'fractional cart add/update and return quantities reach the wire',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            requests.add(options);
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: options.path == '/returns'
                    ? {
                        'id': 'r',
                        'order_id': 'o',
                        'status': 'requested',
                        'items': options.data['items'],
                      }
                    : {
                        'id': 'c',
                        'subtotal': 1250,
                        'discount': 0,
                        'delivery_fee': 0,
                        'total': 1250,
                        'coupon_code': null,
                        'currency': 'IQD',
                        'items': [
                          {
                            'id': 'i',
                            'product_id': 'p',
                            'unit_price': 10000,
                            'line_total': 1250,
                            'currency': 'IQD',
                            'available': true,
                            'price_version': 'fixture-v1',
                            'current_price_version': 'fixture-v1',
                            'price_changed': false,
                            'current_unit_price': 10000,
                            'available_qty': 10,
                            'quantity': options.data['quantity'],
                          },
                        ],
                      },
              ),
            );
          },
        ),
      );
      final cart = CartRepositoryRemote(ApiClient(dio));
      final item = CartItem.fromJson({
        'id': 'i',
        'product_id': 'p',
        'unit_price': 10000,
        'line_total': 1250,
        'currency': 'IQD',
        'available': true,
        'price_version': 'fixture-v1',
        'current_price_version': 'fixture-v1',
        'price_changed': false,
        'current_unit_price': 10000,
        'available_qty': 10,
        'quantity': 0.125,
      });
      expect(
        (await cart.addItem(
          idempotencyKey: 'test-add-key-1',
          productId: 'p',
          quantity: item.quantity,
        )).items.single.quantity,
        0.125,
      );
      await cart.updateItem('i', item.quantity);
      expect(requests[0].data['quantity'], 0.125);
      expect(requests[1].data['quantity'], 0.125);
      final returned = await AfterSalesRepositoryRemote(ApiClient(dio))
          .requestReturn(
            orderId: 'o',
            reason: 'Damaged',
            items: [
              ReturnRequestItem.fromJson({
                'order_item_id': 'i',
                'quantity': 0.125,
              }),
            ],
          );
      expect(returned.items.single.quantity, 0.125);
      expect(requests.last.data['items'][0]['quantity'], 0.125);
    },
  );
}

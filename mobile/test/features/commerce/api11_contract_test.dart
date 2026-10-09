import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/error/error_mapper.dart';
import 'package:shubayr/features/orders/data/order_repository_remote.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_remote.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/after_sales_repository_remote.dart';
import 'package:shubayr/features/orders/data/return_request.dart';

void main() {
  test(
    'remote writes send exactly the contract versions and explicit acceptance tokens',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      final requests = <RequestOptions>[];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            requests.add(request);
            handler.resolve(
              Response(
                requestOptions: request,
                data: request.path.startsWith('/deliveries')
                    ? {
                        'id': 'd',
                        'order_id': 'o',
                        'status': 'failed',
                        'amount_due': 25000,
                        'order_version': 9,
                      }
                    : {'id': 'o', 'version': 8},
              ),
            );
          },
        ),
      );
      final orders = OrderRepositoryRemote(ApiClient(dio));
      await orders.placeOrder(addressId: 'a');
      expect(requests.last.data, {'address_id': 'a', 'payment_method': 'cod'});
      await orders.placeOrder(
        addressId: 'a',
        acceptedPriceVersions: [
          (variantId: 'v', priceVersion: 'opaque-from-conflict'),
        ],
      );
      expect(requests.last.data, {
        'address_id': 'a',
        'payment_method': 'cod',
        'accepted_price_versions': [
          {'variant_id': 'v', 'price_version': 'opaque-from-conflict'},
        ],
      });
      await orders.cancelOrder('o', version: 7);
      expect(requests.last.data, {'version': 7});
      await DeliveryRepositoryRemote(
        ApiClient(dio),
      ).updateStatus('d', 'failed', orderVersion: 8, reason: 'No answer');
      expect(requests.last.data, {
        'status': 'failed',
        'order_version': 8,
        'reason': 'No answer',
      });
    },
  );
  test(
    'structured price and stale-version error fields survive HTTP mapping',
    () {
      final request = RequestOptions(path: '/orders');
      final error = mapDioException(
        DioException(
          requestOptions: request,
          type: DioExceptionType.badResponse,
          response: Response(
            requestOptions: request,
            statusCode: 409,
            data: {
              'code': 'PRICE_CHANGED',
              'message': 'Changed',
              'errors': [
                {
                  'field': 'variant.v',
                  'code': 'PRICE_CHANGED',
                  'message': 'Changed',
                  'variant_id': 'v',
                  'sku': 'SKU',
                  'old_price': 12.25,
                  'new_price': 10.5,
                  'new_price_version': 'opaque',
                  'current_status': 'confirmed',
                  'current_version': 7,
                },
              ],
            },
          ),
        ),
      );
      expect(error.code, 'PRICE_CHANGED');
      expect(error.errors.single.newPriceVersion, 'opaque');
      expect(error.errors.single.oldPrice, 12.25);
      expect(error.errors.single.newPrice, 10.5);
      expect(error.errors.single.currentVersion, 7);
      expect(error.errors.single.currentStatus, 'confirmed');
    },
  );
  test(
    'missing or noninteger versions never become fabricated write versions',
    () {
      expect(Order.fromJson({'id': 'o'}).version, isNull);
      for (final invalid in [null, 0, 1.5, '2']) {
        expect(
          () => Order.fromJson({'id': 'o', 'version': invalid}),
          throwsA(isA<AppFailure>()),
        );
        expect(
          () => Delivery.fromJson({
            'id': 'd',
            'order_id': 'o',
            'status': 'assigned',
            'amount_due': 25000,
            'order_version': invalid,
          }),
          throwsA(isA<AppFailure>()),
        );
      }
      expect(
        () => Delivery.fromJson({
          'id': 'd',
          'order_id': 'o',
          'status': 'assigned',
          'amount_due': 25000,
        }),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test('order preserves the server version for a later mutation', () {
    expect(Order.fromJson({'id': 'o', 'version': 17}).toJson()['version'], 17);
  });
  test('failed delivery can retry and preserves concurrency metadata', () {
    final delivery = Delivery.fromJson({
      'id': 'd',
      'order_id': 'o',
      'status': 'failed',
      'amount_due': 25000,
      'order_version': 12,
      'failure_reason': 'No answer',
      'retry_count': 2,
    });
    expect(delivery.nextStatuses, ['out_for_delivery']);
    expect(delivery.toJson()['order_version'], 12);
    expect(delivery.toJson()['failure_reason'], 'No answer');
  });
  test('cart keeps seen totals and current price metadata separately', () {
    final item = CartItem.fromJson({
      'id': 'i',
      'product_id': 'p',
      'variant_id': 'v',
      'quantity': .125,
      'unit_price': 8000,
      'line_total': 1000,
      'currency': 'IQD',
      'available': true,
      'available_qty': 2,
      'price_version': 'seen',
      'current_unit_price': 10000,
      'current_price_version': 'current',
      'price_changed': true,
    });
    expect(item.lineTotal, 1000);
    expect(item.copyWith(quantity: .25).toJson()['current_unit_price'], 10000);
    expect(item.toJson()['price_version'], 'seen');
    expect(item.toJson()['current_price_version'], 'current');
    expect(item.toJson()['price_changed'], true);
  });
  for (final valid in [true, false]) {
    test('return validates and sends per-item reason: valid=$valid', () async {
      final dio = Dio();
      addTearDown(dio.close);
      final requests = <RequestOptions>[];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            requests.add(request);
            handler.resolve(
              Response(
                requestOptions: request,
                statusCode: 201,
                data: {
                  'id': 'r',
                  'order_id': 'o',
                  'status': 'requested',
                  'items': [
                    {'order_item_id': 'i', 'quantity': .125},
                  ],
                },
              ),
            );
          },
        ),
      );
      final result = AfterSalesRepositoryRemote(ApiClient(dio)).requestReturn(
        orderId: 'o',
        reason: valid ? 'Damaged' : '  ',
        items: [const ReturnRequestItem(orderItemId: 'i', quantity: .125)],
      );
      if (valid) {
        await result;
        expect((requests.single.data as Map)['items'], [
          {'order_item_id': 'i', 'quantity': .125, 'reason': 'Damaged'},
        ]);
      } else {
        await expectLater(result, throwsA(isA<AppFailure>()));
        expect(requests, isEmpty);
      }
    });
  }
}

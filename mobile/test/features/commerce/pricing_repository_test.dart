import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/cart/data/cart_repository_remote.dart';
import 'pricing_contract_test.dart' show pricedCart;

void main() {
  test(
    'coupon apply reads repriced cart; removal uses returned cart; writes send no prices',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            requests.add(request);
            handler.resolve(
              Response(
                requestOptions: request,
                statusCode: 200,
                data: request.path == '/coupons/validate'
                    ? {
                        'code': 'SAVE',
                        'type': 'percentage',
                        'value': 10,
                        'currency': 'IQD',
                      }
                    : {
                        ...pricedCart(),
                        if (request.method == 'DELETE') ...{
                          'coupon_code': null,
                          'discount': 0,
                          'total': 5071,
                        },
                      },
              ),
            );
          },
        ),
      );
      final repository = CartRepositoryRemote(ApiClient(dio));
      final applied = await repository.applyCoupon('SAVE');
      expect(requests.map((r) => '${r.method} ${r.path}'), [
        'POST /coupons/validate',
        'GET /cart',
      ]);
      expect(requests.first.data, {'code': 'SAVE'});
      expect(applied.total, 4750);
      expect(applied.discount, 321); // Not 10% of the subtotal.
      final removed = await repository.removeCoupon();
      expect(requests.last.method, 'DELETE');
      expect(requests.last.path, '/cart/coupon');
      expect(removed.couponCode, isNull);
      expect(removed.total, 5071);
      final added = await repository.addItem(
        productId: 'p',
        variantId: 'v',
        quantity: .125,
      );
      expect(requests.last.data, {
        'product_id': 'p',
        'variant_id': 'v',
        'quantity': .125,
      });
      expect(added.items.single.lineTotal, 1234);
      final updated = await repository.updateItem('i', .25);
      expect(requests.last.data, {'quantity': .25});
      expect(updated.total, 4750);
    },
  );
  test(
    'malformed required commerce fields fail through the repository',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            handler.resolve(
              Response(
                requestOptions: request,
                data: pricedCart()..remove('total'),
              ),
            );
          },
        ),
      );
      await expectLater(
        CartRepositoryRemote(ApiClient(dio)).fetchCart(),
        throwsA(isA<AppFailure>()),
      );
    },
  );
}

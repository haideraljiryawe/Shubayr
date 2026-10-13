import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/error/error_mapper.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/auth/data/auth_repository_remote.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_remote.dart';
import 'package:shubayr/features/cart/data/cart_repository_remote.dart';
import '../commerce/pricing_contract_test.dart' show pricedCart;

void main() {
  test(
    'missing required commerce total is rejected at remote boundary',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) => h.resolve(
            Response(
              requestOptions: r,
              data: {...pricedCart()}..remove('total'),
            ),
          ),
        ),
      );
      await expectLater(
        CartRepositoryRemote(ApiClient(dio)).fetchCart(),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  for (final failingPath in ['/coupons/validate', '/cart']) {
    test(
      'coupon rejection is scoped to validation endpoint: $failingPath',
      () async {
        final dio = Dio();
        addTearDown(dio.close);
        dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              if (r.path == failingPath) {
                h.reject(
                  DioException(
                    requestOptions: r,
                    type: DioExceptionType.badResponse,
                    response: Response(
                      requestOptions: r,
                      statusCode: 404,
                      data: {'code': 'NOT_FOUND'},
                    ),
                  ),
                );
              } else {
                h.resolve(Response(requestOptions: r, data: {'code': 'SAVE'}));
              }
            },
          ),
        );
        await expectLater(
          CartRepositoryRemote(ApiClient(dio)).applyCoupon('SAVE'),
          throwsA(
            isA<AppFailure>().having(
              (e) => e.code,
              'code',
              failingPath == '/coupons/validate'
                  ? 'COUPON_REJECTED'
                  : 'NOT_FOUND',
            ),
          ),
        );
      },
    );
  }
  test(
    'repository decoding failures become a predictable application failure',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) =>
              h.resolve(Response(requestOptions: r, data: {'id': 42})),
        ),
      );
      await expectLater(
        AuthRepositoryRemote(ApiClient(dio)).currentUser(),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test(
    'unexpected response top-level shape becomes an application failure',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) => h.resolve(
            Response(requestOptions: r, data: {'unexpected': true}),
          ),
        ),
      );
      await expectLater(
        CatalogRepositoryRemote(ApiClient(dio)).fetchCategories(),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test(
    'logout uses the normalized transport path even for empty responses',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) => h.reject(
            DioException(
              requestOptions: r,
              type: DioExceptionType.connectionError,
            ),
          ),
        ),
      );
      await expectLater(
        AuthRepositoryRemote(ApiClient(dio)).logout('secret'),
        throwsA(
          isA<AppFailure>().having((e) => e.kind, 'kind', FailureKind.network),
        ),
      );
    },
  );
  test('malformed error-envelope fields do not escape the error mapper', () {
    final request = RequestOptions(path: '/me');
    final error = mapDioException(
      DioException(
        requestOptions: request,
        type: DioExceptionType.badResponse,
        response: Response(
          requestOptions: request,
          statusCode: 422,
          data: {
            'code': 42,
            'errors': [
              {'field': 42, 'code': false, 'message': 'invalid'},
            ],
          },
        ),
      ),
    );
    expect(error, isA<AppFailure>());
  });
}

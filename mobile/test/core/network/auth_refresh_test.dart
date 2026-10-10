import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/interceptors/auth_interceptor.dart';

void main() {
  for (final type in [
    DioExceptionType.connectionError,
    DioExceptionType.receiveTimeout,
  ]) {
    test(
      'refresh $type leaves credentials available for a later retry',
      () async {
        var signOuts = 0;
        var retries = 0;
        final failure = DioException(
          requestOptions: RequestOptions(path: '/auth/refresh'),
          type: type,
        );
        final dio = Dio();
        addTearDown(dio.close);
        dio.interceptors.add(
          AuthInterceptor(
            readToken: () async => 'stored-token',
            onUnauthorized: () async {
              signOuts++;
            },
            refresh: () => Future.error(failure),
            retry: (request) async {
              retries++;
              return Response(requestOptions: request);
            },
          ),
        );
        dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (request, handler) {
              handler.reject(
                DioException(
                  requestOptions: request,
                  response: Response(requestOptions: request, statusCode: 401),
                  type: DioExceptionType.badResponse,
                ),
                true,
              );
            },
          ),
        );
        await expectLater(dio.get('/me'), throwsA(same(failure)));
        expect(signOuts, 0);
        expect(retries, 0);
      },
    );
  }

  test(
    'concurrent 401 responses rotate once and retry with the new app token',
    () async {
      var token = 'old';
      var refreshes = 0;
      var signOuts = 0;
      final pending = Completer<bool>();
      final dio = Dio();
      dio.interceptors.add(
        AuthInterceptor(
          readToken: () async => token,
          onUnauthorized: () async {
            signOuts++;
          },
          refresh: () {
            refreshes++;
            return pending.future;
          },
          retry: dio.fetch<dynamic>,
        ),
      );
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) {
            if (r.headers['Authorization'] == 'Bearer new') {
              h.resolve(Response(requestOptions: r, data: {'ok': true}));
            } else {
              h.reject(
                DioException(
                  requestOptions: r,
                  response: Response(requestOptions: r, statusCode: 401),
                  type: DioExceptionType.badResponse,
                ),
                true,
              );
            }
          },
        ),
      );
      final first = dio.get('/me');
      final second = dio.get('/deliveries/assigned');
      await Future<void>.delayed(const Duration(milliseconds: 10));
      token = 'new';
      pending.complete(true);
      expect((await first).data, {'ok': true});
      expect((await second).data, {'ok': true});
      expect(refreshes, 1);
      expect(signOuts, 0);
    },
  );
  test('invalid OTP is not a request to clear another session', () async {
    var signOuts = 0;
    final dio = Dio()
      ..interceptors.add(
        AuthInterceptor(
          readToken: () async => 'existing',
          onUnauthorized: () async {
            signOuts++;
          },
        ),
      );
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (r, h) {
          expect(r.headers.containsKey('Authorization'), isFalse);
          h.reject(
            DioException(
              requestOptions: r,
              response: Response(requestOptions: r, statusCode: 401),
              type: DioExceptionType.badResponse,
            ),
            true,
          );
        },
      ),
    );
    await expectLater(
      dio.post('/auth/verify-otp'),
      throwsA(isA<DioException>()),
    );
    expect(signOuts, 0);
  });
  test(
    'a late 401 from an old account does not replay using a new account',
    () async {
      var token = 'old';
      var retries = 0;
      var signOuts = 0;
      final dio = Dio()
        ..interceptors.add(
          AuthInterceptor(
            readToken: () async => token,
            onUnauthorized: () async {
              signOuts++;
            },
            refresh: () async {
              retries++;
              return true;
            },
            retry: (r) async {
              retries++;
              return Response(requestOptions: r);
            },
          ),
        );
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) {
            token = 'another-account';
            h.reject(
              DioException(
                requestOptions: r,
                response: Response(requestOptions: r, statusCode: 401),
                type: DioExceptionType.badResponse,
              ),
            );
          },
        ),
      );
      await expectLater(dio.get('/orders'), throwsA(isA<DioException>()));
      expect(retries, 0);
      expect(signOuts, 0);
    },
  );
}

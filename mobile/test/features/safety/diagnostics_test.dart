import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/diagnostics/diagnostics.dart';
import 'package:shubayr/core/error/error_mapper.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/error/response_decode.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/network/interceptors/auth_interceptor.dart';
import 'package:shubayr/core/network/interceptors/logging_interceptor.dart';

void main() {
  test(
    'diagnostics retain exception type and stack without secret material',
    () {
      final records = <DiagnosticRecord>[];
      final previous = Diagnostics.sink;
      addTearDown(() => Diagnostics.sink = previous);
      Diagnostics.sink = records.add;
      Diagnostics.report(
        StateError('Bearer access-secret phone=07712345678'),
        StackTrace.fromString(
          '#0      Repository.decode (package:shubayr/data.dart:12:3)\n'
          '#1      send (https://example.com/?otp=otp-secret:1:1)\n'
          'refresh-secret\n<asynchronous suspension>',
        ),
        boundary: 'response.decode',
      );
      final record = records.single;
      expect(record.exception.toString(), contains('StateError'));
      expect(
        record.stackTrace.toString(),
        contains('package:shubayr/data.dart:12:3'),
      );
      final output = '${record.exception} ${record.stackTrace}';
      for (final secret in [
        'access-secret',
        '07712345678',
        'otp-secret',
        'refresh-secret',
        'https://',
      ]) {
        expect(output, isNot(contains(secret)));
      }
      Diagnostics.sink = (_) => throw StateError('sink unavailable');
      expect(
        () => actionFailure(StateError('secret'), StackTrace.current),
        returnsNormally,
      );
    },
  );

  test(
    'HTTP logging redacts query, identity, headers, bodies and error messages',
    () async {
      final logs = <String>[];
      final dio = Dio();
      addTearDown(dio.close);
      dio.options.headers['Authorization'] = 'Bearer header-secret';
      dio.interceptors.add(LoggingInterceptor(log: logs.add));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) => h.reject(
            DioException(
              requestOptions: r,
              type: DioExceptionType.connectionError,
              error: 'refresh-secret',
              message: 'otp-secret',
            ),
          ),
        ),
      );
      await expectLater(
        ApiClient(dio).post<Map<String, dynamic>>(
          '/orders/customer-secret?phone=phone-secret',
          body: {'otp': 'otp-secret', 'token': 'access-secret'},
        ),
        throwsA(isA<AppFailure>()),
      );
      final output = logs.join('\n');
      expect(output, contains('/orders/{id}'));
      expect(output, contains('POST'));
      for (final secret in [
        'customer-secret',
        'phone-secret',
        'otp-secret',
        'access-secret',
        'refresh-secret',
        'header-secret',
        '?',
      ]) {
        expect(output, isNot(contains(secret)));
      }
    },
  );

  test(
    'format decoding is normalized but programmer StateError stays distinct',
    () async {
      await expectLater(
        decodeResponse(() async => throw const FormatException('secret')),
        throwsA(
          isA<AppFailure>().having((e) => e.code, 'code', 'MALFORMED_RESPONSE'),
        ),
      );
      await expectLater(
        decodeResponse(() async => throw StateError('bug')),
        throwsA(isA<StateError>()),
      );
    },
  );

  test('conflict semantics and stable fields survive normalized errors', () {
    AppFailure mapped(int status, String code) {
      final r = RequestOptions(path: '/orders/o/cancel');
      return mapDioException(
        DioException(
          requestOptions: r,
          type: DioExceptionType.badResponse,
          response: Response(
            requestOptions: r,
            statusCode: status,
            data: {
              'code': code,
              'errors': [
                {
                  'field': 'version',
                  'message': 'conflict',
                  'current_version': 7,
                },
              ],
            },
          ),
        ),
      );
    }

    final conflict = mapped(409, 'VERSION_CONFLICT');
    expect(conflict.kind, FailureKind.conflict);
    expect(conflict.code, 'VERSION_CONFLICT');
    expect(conflict.errors.single.currentVersion, 7);
    expect(conflict.hasFieldError('version'), isTrue);
    expect(mapped(422, 'VALIDATION_ERROR').kind, FailureKind.validation);
  });

  test(
    'unexpected token storage failure settles interceptor without hanging',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        AuthInterceptor(
          readToken: () async => throw StateError('storage-secret'),
          onUnauthorized: () async {},
        ),
      );
      await expectLater(
        ApiClient(dio).get<Map<String, dynamic>>('/me'),
        throwsA(
          isA<AppFailure>().having((e) => e.kind, 'kind', FailureKind.unknown),
        ),
      );
    },
  );
}

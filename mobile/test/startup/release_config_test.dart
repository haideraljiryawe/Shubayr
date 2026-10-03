import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';

void main() {
  for (final url in [
    '',
    'http://api.vendor.org/api/v1',
    'https://localhost/api/v1',
    'https://127.0.0.1',
    'https://127.1',
    'https://2130706433',
    'https://[::1]',
    'https://10.0.2.2',
    'https://192.168.1.1',
    'https://api.local',
    'https://api.test',
    'https://api.internal',
    'https://dev.vendor.org',
    'https://staging.vendor.org',
    'https://example.com',
    'https://intranet',
    'https://api.vendor.org:0',
    'https://api.vendor.org:65536',
    'not a URL',
    '//api.vendor.org',
    'https://user:secret@api.vendor.org',
    'https://api.vendor.org?token=secret',
    'https://api.vendor.org#secret',
    ' https://api.vendor.org',
  ]) {
    test('production rejects unsafe/missing configuration: $url', () {
      final config = AppConfig(apiBaseUrl: url, dataSource: DataSource.remote);
      expect(
        () => config.validate(production: true),
        throwsA(
          isA<AppFailure>().having(
            (e) => e.code,
            'code',
            'INVALID_API_CONFIGURATION',
          ),
        ),
      );
    });
  }
  test('production accepts an explicit HTTPS DNS base URL', () {
    const AppConfig(
      apiBaseUrl: 'https://api.vendor.org/api/v1',
      dataSource: DataSource.remote,
    ).validate(production: true);
  });
  test('production rejects fixture configuration even with a valid URL', () {
    expect(
      () => const AppConfig(
        apiBaseUrl: 'https://api.vendor.org/api/v1',
        dataSource: DataSource.mock,
      ).validate(production: true),
      throwsA(isA<AppFailure>()),
    );
  });
  test(
    'debug development stays convenient and environment never selects fixtures',
    () {
      const AppConfig(
        apiBaseUrl: 'http://localhost:8000/api/v1',
        dataSource: DataSource.remote,
      ).validate(production: false);
      expect(AppConfig.fromEnvironment().dataSource, DataSource.remote);
    },
  );
}

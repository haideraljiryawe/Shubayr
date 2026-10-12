import 'package:flutter/foundation.dart';
import '../error/failure.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Where repositories read their data from.
enum DataSource {
  /// In-memory fixtures available only through explicit test overrides.
  mock,

  /// Live HTTP calls against [AppConfig.apiBaseUrl].
  remote,
}

/// Build-time configuration, supplied with `--dart-define`.
///
/// ```
/// flutter run --dart-define=API_URL=http://localhost:8000/api/v1
/// ```
class AppConfig {
  const AppConfig({required this.apiBaseUrl, required this.dataSource});

  factory AppConfig.fromEnvironment() {
    final config = AppConfig(
      apiBaseUrl: const String.fromEnvironment(
        'API_URL',
        defaultValue: kDebugMode ? 'http://localhost:8000/api/v1' : '',
      ),
      dataSource: DataSource.remote,
    );
    config.validate(production: !kDebugMode);
    return config;
  }

  /// Profile/release require an explicitly configured HTTPS production host.
  /// This also protects iOS/web; native transport settings are not the only gate.
  void validate({required bool production}) {
    if (!production) return;
    final uri = Uri.tryParse(apiBaseUrl);
    final host = uri?.host.toLowerCase() ?? '';
    final labels = host.split('.');
    const reserved = {
      'localhost',
      'local',
      'internal',
      'test',
      'invalid',
      'example',
      'dev',
      'development',
      'staging',
      'debug',
    };
    final reservedHost =
        labels.any(reserved.contains) ||
        const {'example.com', 'example.org', 'example.net'}.contains(host);
    // Require DNS for production, avoiding platform-dependent numeric IP forms,
    // private/link-local addresses and emulator/loopback aliases altogether.
    final dnsHost =
        labels.length > 1 &&
        RegExp(r'^[a-z][a-z0-9-]*$').hasMatch(labels.last) &&
        labels.every(
          (label) =>
              RegExp(r'^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$').hasMatch(label),
        );
    if (dataSource != DataSource.remote ||
        uri == null ||
        uri.scheme != 'https' ||
        !uri.hasAuthority ||
        (uri.hasPort && (uri.port < 1 || uri.port > 65535)) ||
        !dnsHost ||
        reservedHost ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        apiBaseUrl != apiBaseUrl.trim()) {
      throw const AppFailure(
        FailureKind.unknown,
        code: 'INVALID_API_CONFIGURATION',
      );
    }
  }

  final String apiBaseUrl;
  final DataSource dataSource;

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 20);
}

/// Overridden in tests; read by the repository providers.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);

/// Production always uses remote. Tests explicitly override this provider or
/// individual repositories to avoid contacting a backend.
final dataSourceProvider = Provider<DataSource>(
  (ref) => ref.watch(appConfigProvider).dataSource,
);

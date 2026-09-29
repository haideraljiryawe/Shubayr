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
/// flutter run --dart-define=API_URL=http://localhost:8000/api/v1 \
///             --dart-define=DATA_SOURCE=remote
/// ```
class AppConfig {
  const AppConfig({required this.apiBaseUrl, required this.dataSource});

  factory AppConfig.fromEnvironment() => AppConfig(
    apiBaseUrl: const String.fromEnvironment(
      'API_URL',
      defaultValue: 'http://localhost:8000/api/v1',
    ),
    dataSource: DataSource.remote,
  );

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

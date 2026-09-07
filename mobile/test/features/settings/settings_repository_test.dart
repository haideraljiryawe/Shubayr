import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/features/settings/data/settings_repository_mock.dart';
import 'package:shubayr/features/settings/data/settings_repository_remote.dart';
import 'package:shubayr/features/settings/domain/settings_repository.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

/// Serves canned responses so the Dio repository can be tested without a
/// server and without adding a mocking package.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.body);

  final Object body;
  static const int statusCode = 200;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

SettingsRepository _remoteReturning(Object body) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:8000/api/v1'))
    ..httpClientAdapter = _FakeAdapter(body);
  return SettingsRepositoryRemote(ApiClient(dio));
}

Future<PrefsStore> _prefs() async {
  SharedPreferences.setMockInitialValues({});
  return PrefsStore(await SharedPreferences.getInstance());
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('SettingsRepository implementations agree on the contract shape', () {
    test('mock returns a StoreSettings without inventing fields', () async {
      final settings = await const SettingsRepositoryMock(
        delay: Duration.zero,
      ).fetch();
      expect(settings.currency, 'IQD');
      expect(settings.toJson().keys, {
        'store_name',
        'logo_url',
        'primary_color',
        'currency',
      });
    });

    test('remote parses the documented StoreSettings payload', () async {
      final repository = _remoteReturning({
        'store_name': 'Test Store',
        'logo_url': 'https://example.test/logo.png',
        'primary_color': '#3366CC',
        'currency': 'USD',
      });

      final settings = await repository.fetch();
      expect(settings.storeName, 'Test Store');
      expect(settings.logoUrl, 'https://example.test/logo.png');
      expect(settings.primaryColor, '#3366CC');
      expect(settings.currency, 'USD');
    });

    test('remote tolerates a partial payload', () async {
      final settings = await _remoteReturning({'currency': 'IQD'}).fetch();
      expect(settings.storeName, isNull);
      expect(settings.primaryColor, isNull);
      expect(settings.currency, 'IQD');
    });
  });

  group('brandProvider', () {
    Future<ProviderContainer> containerWith(
      SettingsRepository repository,
    ) async {
      final prefs = await _prefs();
      return ProviderContainer(
        overrides: [
          prefsStoreProvider.overrideWithValue(prefs),
          settingsRepositoryProvider.overrideWithValue(repository),
        ],
      );
    }

    test('uses the bundled brand before any settings arrive', () async {
      final container = await containerWith(
        const SettingsRepositoryMock(delay: Duration.zero),
      );
      addTearDown(container.dispose);

      final brand = container.read(brandProvider);
      expect(brand.primaryColor, const Color(0xFF438C59));
      expect(brand.currencyCode, 'IQD');
      expect(brand.name, isNull);
    });

    test('applies the remote primary colour once settings load', () async {
      final container = await containerWith(
        _remoteReturning({
          'store_name': 'Test Store',
          'primary_color': '#3366CC',
          'currency': 'USD',
        }),
      );
      addTearDown(container.dispose);

      await container.read(storeSettingsProvider.notifier).refresh();

      final brand = container.read(brandProvider);
      expect(brand.primaryColor, const Color(0xFF3366CC));
      expect(brand.name, 'Test Store');
      expect(brand.currencyCode, 'USD');
    });

    test(
      'keeps bundled values when the payload is partial or malformed',
      () async {
        final container = await containerWith(
          _remoteReturning({'primary_color': 'not-a-colour', 'currency': ''}),
        );
        addTearDown(container.dispose);

        await container.read(storeSettingsProvider.notifier).refresh();

        final brand = container.read(brandProvider);
        expect(brand.primaryColor, const Color(0xFF438C59));
        expect(brand.currencyCode, 'IQD');
      },
    );

    test(
      'caches settings so the next launch paints the brand immediately',
      () async {
        final prefs = await _prefs();
        final overrides = [
          prefsStoreProvider.overrideWithValue(prefs),
          settingsRepositoryProvider.overrideWithValue(
            _remoteReturning({'primary_color': '#3366CC', 'currency': 'USD'}),
          ),
        ];

        final first = ProviderContainer(overrides: overrides);
        await first.read(storeSettingsProvider.notifier).refresh();
        first.dispose();

        // A fresh container reads the cache synchronously — no network needed.
        final second = ProviderContainer(overrides: overrides);
        addTearDown(second.dispose);
        expect(
          second.read(brandProvider).primaryColor,
          const Color(0xFF3366CC),
        );
      },
    );

    test('data source switch selects the repository implementation', () async {
      final prefs = await _prefs();
      final mockContainer = ProviderContainer(
        overrides: [
          prefsStoreProvider.overrideWithValue(prefs),
          appConfigProvider.overrideWithValue(
            const AppConfig(
              apiBaseUrl: 'http://localhost:8000/api/v1',
              dataSource: DataSource.mock,
            ),
          ),
        ],
      );
      addTearDown(mockContainer.dispose);
      expect(
        mockContainer.read(settingsRepositoryProvider),
        isA<SettingsRepositoryMock>(),
      );

      final remoteContainer = ProviderContainer(
        overrides: [
          prefsStoreProvider.overrideWithValue(prefs),
          appConfigProvider.overrideWithValue(
            const AppConfig(
              apiBaseUrl: 'http://localhost:8000/api/v1',
              dataSource: DataSource.remote,
            ),
          ),
        ],
      );
      addTearDown(remoteContainer.dispose);
      expect(
        remoteContainer.read(settingsRepositoryProvider),
        isA<SettingsRepositoryRemote>(),
      );
    });
  });
}

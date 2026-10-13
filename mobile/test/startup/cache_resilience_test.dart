import 'package:dio/dio.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/settings/data/settings_repository_remote.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/theme/theme_mode_controller.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'server schema errors stay strict even when local cache reading is tolerant',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) => handler.resolve(
            Response(requestOptions: request, data: {'store_name': 42}),
          ),
        ),
      );
      await expectLater(
        SettingsRepositoryRemote(ApiClient(dio)).fetch(),
        throwsA(
          isA<AppFailure>().having((e) => e.code, 'code', 'MALFORMED_RESPONSE'),
        ),
      );
    },
  );
  for (final value in [
    '{',
    '[]',
    'null',
    '42',
    '{"store_name":42}',
    '{"logo_url":{}}',
    '{"currency":false}',
    '{"primary_color":[]}',
  ]) {
    test('disposable settings corruption is ignored: $value', () async {
      SharedPreferences.setMockInitialValues({
        'store.settings_json': value,
        'app.locale': 'en',
        'app.theme_mode': 'dark',
      });
      final c = ProviderContainer(
        overrides: [
          prefsStoreProvider.overrideWithValue(
            PrefsStore(await SharedPreferences.getInstance()),
          ),
        ],
      );
      addTearDown(c.dispose);
      expect(c.read(storeSettingsProvider), isNull);
      expect(c.read(brandProvider), const Brand.bundled());
      expect(c.read(localeControllerProvider), const Locale('en'));
      expect(c.read(themeModeControllerProvider), ThemeMode.dark);
    });
  }
  for (final key in ['app.locale', 'app.theme_mode', 'store.settings_json']) {
    for (final value in [
      42,
      true,
      <String>['obsolete'],
    ]) {
      test(
        'invalid preference type only affects its own key: $key $value',
        () async {
          SharedPreferences.setMockInitialValues({
            'app.locale': 'en',
            'app.theme_mode': 'dark',
            'store.settings_json': '{"store_name":"Store"}',
            key: value,
          });
          final c = ProviderContainer(
            overrides: [
              prefsStoreProvider.overrideWithValue(
                PrefsStore(await SharedPreferences.getInstance()),
              ),
            ],
          );
          addTearDown(c.dispose);
          expect(
            c.read(localeControllerProvider),
            Locale(key == 'app.locale' ? 'ar' : 'en'),
          );
          expect(
            c.read(themeModeControllerProvider),
            key == 'app.theme_mode' ? ThemeMode.system : ThemeMode.dark,
          );
          expect(
            c.read(storeSettingsProvider)?.storeName,
            key == 'store.settings_json' ? null : 'Store',
          );
        },
      );
    }
  }
  for (final value in [
    '{}',
    '{"store_name":null}',
    '{"obsolete":true,"currency":"IQD"}',
  ]) {
    test(
      'compatible partial, nullable and obsolete settings survive: $value',
      () async {
        SharedPreferences.setMockInitialValues({
          'store.settings_json': value,
          'app.locale': 'obsolete',
          'app.theme_mode': 'obsolete',
        });
        final c = ProviderContainer(
          overrides: [
            prefsStoreProvider.overrideWithValue(
              PrefsStore(await SharedPreferences.getInstance()),
            ),
          ],
        );
        addTearDown(c.dispose);
        expect(c.read(storeSettingsProvider), isNotNull);
        expect(c.read(localeControllerProvider), const Locale('ar'));
        expect(c.read(themeModeControllerProvider), ThemeMode.system);
      },
    );
  }
}

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/storage/prefs_store.dart';
import '../../../../core/theme/brand.dart';
import '../../../../core/utils/hex_color.dart';
import '../../data/settings_repository_mock.dart';
import '../../data/settings_repository_remote.dart';
import '../../data/store_settings.dart';
import '../../domain/settings_repository.dart';

/// Mock ⇄ remote switch. Overriding this single provider (globally via
/// `DATA_SOURCE`, or locally in a `ProviderScope`) swaps the data source
/// without touching a line of UI code.
final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => const SettingsRepositoryMock(),
    DataSource.remote => SettingsRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// Store settings with a cache-first lifecycle:
///
///   bundled defaults → cached last-known settings → remote refresh
///
/// The first two are synchronous, so the app never waits on the network to
/// paint its first frame.
class StoreSettingsController extends Notifier<StoreSettings?> {
  @override
  StoreSettings? build() => _readCache();

  StoreSettings? _readCache() {
    final raw = ref.read(prefsStoreProvider).readStoreSettingsJson();
    if (raw == null) return null;
    try {
      return StoreSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on FormatException {
      return null;
    }
  }

  /// Fetches fresh settings in the background. Failures are swallowed on
  /// purpose: branding must never block or break the app.
  Future<void> refresh() async {
    try {
      final settings = await ref.read(settingsRepositoryProvider).fetch();
      state = settings;
      await ref
          .read(prefsStoreProvider)
          .writeStoreSettingsJson(jsonEncode(settings.toJson()));
    } on Object {
      // Keep whatever we already had (cache or bundled defaults).
    }
  }
}

final storeSettingsProvider =
    NotifierProvider<StoreSettingsController, StoreSettings?>(
      StoreSettingsController.new,
    );

/// The brand the theme is built from. Falls back field-by-field, so a partial
/// `StoreSettings` payload still yields a complete brand.
final brandProvider = Provider<Brand>((ref) {
  final settings = ref.watch(storeSettingsProvider);
  const bundled = Brand.bundled();
  if (settings == null) return bundled;

  return Brand(
    name: settings.storeName?.trim().isEmpty ?? true
        ? bundled.name
        : settings.storeName,
    logoUrl: settings.logoUrl,
    primaryColor:
        tryParseHexColor(settings.primaryColor) ?? bundled.primaryColor,
    currencyCode: settings.currency?.trim().isEmpty ?? true
        ? bundled.currencyCode
        : settings.currency!,
  );
});

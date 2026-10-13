import 'dart:async';
import 'package:flutter/services.dart';
import '../diagnostics/diagnostics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Non-sensitive local state: selected locale and the last known store
/// settings (so the app can paint the right brand before the network answers).
class PrefsStore {
  const PrefsStore(this._prefs);
  const PrefsStore.unavailable() : _prefs = null;

  static Future<PrefsStore> load({
    Future<SharedPreferences> Function()? loader,
  }) async {
    try {
      return PrefsStore(
        await (loader ?? SharedPreferences.getInstance)().timeout(
          const Duration(seconds: 5),
        ),
      );
    } on PlatformException catch (error, stack) {
      Diagnostics.report(error, stack, boundary: 'preferences.load');
    } on TimeoutException catch (error, stack) {
      Diagnostics.report(error, stack, boundary: 'preferences.load');
    } on FormatException catch (error, stack) {
      Diagnostics.report(error, stack, boundary: 'preferences.load');
    } on TypeError catch (error, stack) {
      Diagnostics.report(error, stack, boundary: 'preferences.load');
    }
    // Non-sensitive preferences may be unavailable for this launch. Auth never
    // uses this store, and no disk values are deleted or replaced here.
    return const PrefsStore.unavailable();
  }

  static const _localeKey = 'app.locale';
  static const _themeModeKey = 'app.theme_mode';
  static const _settingsKey = 'store.settings_json';

  final SharedPreferences? _prefs;

  String? _string(String key) {
    final value = _prefs?.get(key);
    if (value == null || value is String) return value as String?;
    Diagnostics.report(
      const FormatException('Invalid preference type'),
      StackTrace.current,
      boundary: 'preferences.decode',
    );
    return null;
  }

  String? readLocaleCode() => _string(_localeKey);

  Future<void> writeLocaleCode(String? code) async {
    if (code == null) {
      await _prefs?.remove(_localeKey);
    } else {
      await _prefs?.setString(_localeKey, code);
    }
  }

  /// One of `system` / `light` / `dark`; null before the user has chosen.
  String? readThemeMode() => _string(_themeModeKey);

  Future<void> writeThemeMode(String? mode) async {
    if (mode == null) {
      await _prefs?.remove(_themeModeKey);
    } else {
      await _prefs?.setString(_themeModeKey, mode);
    }
  }

  String? readStoreSettingsJson() => _string(_settingsKey);

  Future<void> writeStoreSettingsJson(String json) async {
    await _prefs?.setString(_settingsKey, json);
  }
}

/// Overridden in `bootstrap.dart` once SharedPreferences has loaded, and in
/// tests with an in-memory instance.
final prefsStoreProvider = Provider<PrefsStore>(
  (ref) => throw UnimplementedError('prefsStoreProvider must be overridden'),
);

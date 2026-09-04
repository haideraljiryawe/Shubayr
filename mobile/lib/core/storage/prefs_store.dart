import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Non-sensitive local state: selected locale and the last known store
/// settings (so the app can paint the right brand before the network answers).
class PrefsStore {
  const PrefsStore(this._prefs);

  static const _localeKey = 'app.locale';
  static const _settingsKey = 'store.settings_json';

  final SharedPreferences _prefs;

  String? readLocaleCode() => _prefs.getString(_localeKey);

  Future<void> writeLocaleCode(String? code) async {
    if (code == null) {
      await _prefs.remove(_localeKey);
    } else {
      await _prefs.setString(_localeKey, code);
    }
  }

  String? readStoreSettingsJson() => _prefs.getString(_settingsKey);

  Future<void> writeStoreSettingsJson(String json) =>
      _prefs.setString(_settingsKey, json);
}

/// Overridden in `bootstrap.dart` once SharedPreferences has loaded, and in
/// tests with an in-memory instance.
final prefsStoreProvider = Provider<PrefsStore>(
  (ref) => throw UnimplementedError('prefsStoreProvider must be overridden'),
);

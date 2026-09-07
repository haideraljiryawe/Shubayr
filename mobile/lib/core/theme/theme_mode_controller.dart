import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/prefs_store.dart';

/// Holds the active [ThemeMode] and persists the user's choice.
///
/// Mirrors `LocaleController`: the default is [ThemeMode.system], so the app
/// follows the device's light/dark setting until the user picks explicitly.
class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => _parse(ref.read(prefsStoreProvider).readThemeMode());

  Future<void> setMode(ThemeMode mode) async {
    if (state == mode) return;
    state = mode;
    await ref.read(prefsStoreProvider).writeThemeMode(_encode(mode));
  }

  static ThemeMode _parse(String? raw) => switch (raw) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };

  static String _encode(ThemeMode mode) => switch (mode) {
    ThemeMode.light => 'light',
    ThemeMode.dark => 'dark',
    ThemeMode.system => 'system',
  };
}

final themeModeControllerProvider =
    NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

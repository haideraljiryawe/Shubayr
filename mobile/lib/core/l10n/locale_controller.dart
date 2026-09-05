import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/prefs_store.dart';

/// Locales the app ships with. Arabic is the default — this is an
/// Arabic-first product, English is the secondary locale.
abstract final class AppLocales {
  static const Locale arabic = Locale('ar');
  static const Locale english = Locale('en');

  static const List<Locale> supported = [arabic, english];
  static const Locale fallback = arabic;

  static Locale fromCode(String? code) => switch (code) {
    'en' => english,
    'ar' => arabic,
    _ => fallback,
  };
}

/// Holds the active locale and persists the user's choice.
class LocaleController extends Notifier<Locale> {
  @override
  Locale build() =>
      AppLocales.fromCode(ref.read(prefsStoreProvider).readLocaleCode());

  Future<void> setLocale(Locale locale) async {
    if (state == locale) return;
    state = locale;
    await ref.read(prefsStoreProvider).writeLocaleCode(locale.languageCode);
  }
}

final localeControllerProvider = NotifierProvider<LocaleController, Locale>(
  LocaleController.new,
);

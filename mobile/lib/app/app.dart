import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/l10n/generated/app_localizations.dart';
import '../core/l10n/locale_controller.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/theme_mode_controller.dart';
import '../core/theme/tokens/app_motion.dart';
import '../features/settings/presentation/providers/settings_providers.dart';
import 'router/app_router.dart';

/// The application root.
///
/// Theme, locale and title are all derived from providers, so a white-label
/// settings refresh or a language switch re-themes the app in place — no
/// restart, no rebuild of the router.
class ShubayrApp extends ConsumerWidget {
  const ShubayrApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = ref.watch(brandProvider);
    final locale = ref.watch(localeControllerProvider);
    final themeMode = ref.watch(themeModeControllerProvider);
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      onGenerateTitle: (context) =>
          brand.name ?? AppLocalizations.of(context).storeFallbackName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(brand),
      darkTheme: AppTheme.dark(brand),
      themeMode: themeMode,
      themeAnimationDuration: AppMotion.medium,
      themeAnimationCurve: AppMotion.standard,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      routerConfig: router,
    );
  }
}

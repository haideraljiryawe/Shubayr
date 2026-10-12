import '../core/config/store_identity.dart';
import '../features/notifications/presentation/notification_providers.dart';
import '../features/cart/presentation/providers/cart_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/l10n/generated/app_localizations.dart';
import '../core/theme/theme_context.dart';
import '../core/l10n/locale_controller.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/theme_mode_controller.dart';
import '../core/theme/tokens/app_motion.dart';
import '../features/settings/presentation/providers/settings_providers.dart';
import 'router/app_router.dart';
import 'shell/monitor_frame.dart';

/// The application root.
///
/// Theme, locale and title are all derived from providers, so a white-label
/// settings refresh or a language switch re-themes the app in place — no
/// restart, no rebuild of the router.
class ShubayrApp extends ConsumerWidget {
  const ShubayrApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(notificationSyncProvider);
    // The cart backs an app-wide badge and session-owned mutations. Keep its
    // subscription above the route TickerModes: a covered shell pauses watches,
    // and resuming its stale identity graph during Overlay build can invalidate
    // another active provider while Riverpod's scope cannot rebuild.
    ref.listen(cartControllerProvider, (_, _) {});
    final brand = ref.watch(brandProvider);
    final locale = ref.watch(localeControllerProvider);
    final themeMode = ref.watch(themeModeControllerProvider);
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      onGenerateTitle: (context) =>
          brand.name ??
          StoreIdentity.name(Localizations.localeOf(context).languageCode),
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
      builder: (context, child) {
        // Consume horizontal device insets once, before page padding. SafeArea
        // clears those insets for descendant AppBars and page-level SafeAreas.
        return ColoredBox(
          color: context.colors.background,
          child: SafeArea(
            top: false,
            bottom: false,
            child: MonitorFrame(router: router, child: child!),
          ),
        );
      },
    );
  }
}

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'core/diagnostics/diagnostics.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'app/splash_screen.dart';
import 'core/config/app_config.dart';
import 'core/error/response_decode.dart';
import 'core/l10n/generated/app_localizations.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/brand.dart';
import 'app/startup_assets.dart';
import 'core/storage/prefs_store.dart';
import 'features/auth/presentation/providers/auth_providers.dart';
import 'features/settings/presentation/providers/settings_providers.dart';

/// Startup sequence:
///
///   blank native launch (local assets) → Flutter startup (2s + session readiness)
///                                  → existing role/return-to destination
///
/// Local preferences and startup artwork/font readiness precede runApp, so
/// the first Flutter frame has a complete identity and the saved appearance.
/// The existing router covers session restoration (including /me when a token exists); optional
/// settings refresh and page content never hold the startup screen open.
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterError.onError = (details) => Diagnostics.report(
    details.exception,
    details.stack ?? StackTrace.current,
    boundary: 'flutter.unhandled',
  );
  PlatformDispatcher.instance.onError = (error, stack) {
    Diagnostics.report(error, stack, boundary: 'platform.unhandled');
    return true;
  };

  await startApplication(launch: runApp);
}

/// One pre-runApp boundary: unexpected mandatory failures remain visible with
/// diagnostics, rather than silently replacing configuration/security state.
Future<void> startApplication({
  required void Function(Widget) launch,
  Future<ProviderContainer> Function()? prepare,
}) async {
  ProviderContainer? container;
  try {
    container = await (prepare ?? prepareApplication)();
    launch(
      UncontrolledProviderScope(
        container: container,
        child: const ShubayrApp(),
      ),
    );
  } catch (error, stack) {
    container?.dispose();
    final failure = actionFailure(error, stack);
    var retrying = false;
    launch(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        localeResolutionCallback: (locale, _) =>
            Locale(locale?.languageCode == 'en' ? 'en' : 'ar'),
        theme: AppTheme.light(const Brand.bundled()),
        darkTheme: AppTheme.dark(const Brand.bundled()),
        home: SplashScreen(
          error: failure,
          // Immutable build configuration cannot be repaired by retrying it.
          onRetry: failure.code == 'INVALID_API_CONFIGURATION'
              ? null
              : () {
                  if (retrying) return;
                  retrying = true;
                  unawaited(startApplication(launch: launch, prepare: prepare));
                },
        ),
      ),
    );
  }
}

Future<ProviderContainer> prepareApplication({
  AppConfig Function()? configuration,
  Future<PrefsStore> Function()? preferences,
  Future<void> Function()? assets,
}) async {
  final config = (configuration ?? AppConfig.fromEnvironment)();
  final prefs = await (preferences ?? PrefsStore.load)();
  // Native launch stays background-only until the normal artwork is ready.
  // Optional asset failures are handled at their own resource boundary.
  await (assets ?? StartupAssets.prepare)();
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      prefsStoreProvider.overrideWithValue(prefs),
      appConfigProvider.overrideWithValue(config),
    ],
  );
  try {
    container.read(sessionControllerProvider);
    unawaited(container.read(storeSettingsProvider.notifier).refresh());
    return container;
  } catch (_) {
    container.dispose();
    rethrow;
  }
}

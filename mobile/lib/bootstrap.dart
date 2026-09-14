import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
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

  // Keep the native launch screen until local presentation assets are ready.
  // This waits for real decoding/font loading, never a display-duration timer.
  final prefs = await SharedPreferences.getInstance();
  await StartupAssets.prepare();
  final container = ProviderContainer(
    // Preserve explicit user retries; Riverpod 3 retries failed builds by default.
    retry: (retryCount, error) => null,
    overrides: [prefsStoreProvider.overrideWithValue(PrefsStore(prefs))],
  );

  // Restore the session in parallel with the Flutter minimum display window.
  container.read(sessionControllerProvider);

  // Refresh white-label settings without blocking the first frame.
  unawaited(container.read(storeSettingsProvider.notifier).refresh());

  runApp(
    UncontrolledProviderScope(container: container, child: const ShubayrApp()),
  );
}

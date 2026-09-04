import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
import 'core/storage/prefs_store.dart';
import 'features/auth/presentation/providers/auth_providers.dart';
import 'features/settings/presentation/providers/settings_providers.dart';

/// Startup sequence:
///
///   native splash → local preferences → first frame (cached brand + locale)
///                → session restore and brand refresh in the background
///
/// Only the local read is awaited. Nothing waits on the network, so the app
/// paints immediately and screens show their own loading states.
Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  final prefs = await SharedPreferences.getInstance();
  final container = ProviderContainer(
    overrides: [prefsStoreProvider.overrideWithValue(PrefsStore(prefs))],
  );

  // Start restoring the session; the router shows the splash until it lands.
  container.read(sessionControllerProvider);

  // Refresh white-label settings without blocking the first frame.
  unawaited(container.read(storeSettingsProvider.notifier).refresh());

  runApp(
    UncontrolledProviderScope(container: container, child: const ShubayrApp()),
  );
}

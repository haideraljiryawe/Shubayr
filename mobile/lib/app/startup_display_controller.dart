import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/tokens/app_motion.dart';

/// One minimum display window per app container, independent of auth readiness.
class StartupDisplayController extends Notifier<bool> {
  Timer? _timer;

  @override
  bool build() {
    ref.onDispose(() => _timer?.cancel());
    return false;
  }

  /// Called after the first Flutter startup frame, not during native launch.
  void beginDisplay() {
    if (state || _timer != null) return;
    _timer = Timer(AppMotion.startupMinimum, () => state = true);
  }
}

final startupDisplayReadyProvider =
    NotifierProvider<StartupDisplayController, bool>(
      StartupDisplayController.new,
    );

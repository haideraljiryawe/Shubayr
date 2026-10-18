import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/presentation/providers/auth_providers.dart';

final sessionVerificationBlockedProvider = Provider<bool>((ref) {
  final signedIn = ref.watch(
    sessionControllerProvider.select(
      (session) => session.asData?.value.isSignedIn == true,
    ),
  );
  final check = ref.watch(sessionRevalidationProvider);
  return signedIn && (check.isLoading || check.hasError);
});

/// One observer per Navigator, including shell branches. The app-level cover
/// sits above Router, where a PopScope cannot register with the covered route.
/// Use the same route pop mechanism without changing pages or redirect policy.
class SessionNavigationGuard extends NavigatorObserver {
  SessionNavigationGuard(Ref ref) {
    ref.listen(sessionVerificationBlockedProvider, (_, blocked) {
      _entry.canPopNotifier.value = !blocked;
    }, fireImmediately: true);
    ref.onDispose(() {
      _route?.unregisterPopEntry(_entry);
      _entry.canPopNotifier.dispose();
    });
  }

  final _entry = _SessionPopEntry();
  ModalRoute<dynamic>? _route;

  @override
  void didChangeTop(Route<dynamic> topRoute, Route<dynamic>? previousTopRoute) {
    _route?.unregisterPopEntry(_entry);
    _route = topRoute is ModalRoute<dynamic> ? topRoute : null;
    _route?.registerPopEntry(_entry);
  }
}

class _SessionPopEntry extends PopEntry<Object?> {
  @override
  final ValueNotifier<bool> canPopNotifier = ValueNotifier(true);
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/theme_context.dart';
import '../core/widgets/state_views.dart';
import '../features/auth/presentation/providers/auth_providers.dart';
import 'router/session_navigation_guard.dart';

/// Hide, rather than unmount, the current route while its session is unverified.
/// Backgrounding arms the cover before the first resumed frame can be painted.
class SessionVerificationGate extends ConsumerStatefulWidget {
  const SessionVerificationGate({required this.child, super.key});
  final Widget child;

  @override
  ConsumerState<SessionVerificationGate> createState() =>
      _SessionVerificationGateState();
}

class _SessionVerificationGateState
    extends ConsumerState<SessionVerificationGate> {
  late final AppLifecycleListener _lifecycle;
  bool _backgrounded = false;

  @override
  void initState() {
    super.initState();
    final initial = WidgetsBinding.instance.lifecycleState;
    _backgrounded =
        initial == AppLifecycleState.hidden ||
        initial == AppLifecycleState.paused;
    _lifecycle = AppLifecycleListener(
      onHide: _hide,
      onPause: _hide,
      onResume: () {
        if (!_backgrounded) return;
        _backgrounded = false;
        unawaited(ref.read(sessionControllerProvider.notifier).revalidate());
      },
    );
  }

  void _hide() {
    _backgrounded = true;
    ref.read(sessionControllerProvider.notifier).requireVerification();
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final check = ref.watch(sessionRevalidationProvider);
    final blocked = ref.watch(sessionVerificationBlockedProvider);
    return Stack(
      fit: StackFit.expand,
      children: [
        ExcludeFocus(
          excluding: blocked,
          child: Offstage(offstage: blocked, child: widget.child),
        ),
        if (blocked)
          Positioned.fill(
            child: Material(
              color: context.colors.background,
              child: SafeArea(
                child: check.hasError
                    ? AppErrorView(
                        error: check.error,
                        onRetry: () => unawaited(
                          ref
                              .read(sessionControllerProvider.notifier)
                              .revalidate(),
                        ),
                      )
                    : const AppLoadingView(),
              ),
            ),
          ),
      ],
    );
  }
}

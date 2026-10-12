import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/l10n/l10n_context.dart';
import '../core/widgets/app_snackbar.dart';
import '../features/notifications/domain/push_client.dart';
import '../features/notifications/domain/push_lifecycle.dart';
import '../features/notifications/presentation/push_providers.dart';
import '../features/notifications/presentation/notification_providers.dart';
import 'router/app_router.dart';
import 'router/app_routes.dart';
import 'startup_display_controller.dart';

/// Payloads have no documented deep-link data. Open the current customer's
/// authenticated inbox; never interpret arbitrary push strings as app routes.
class PushNotificationBridge extends ConsumerStatefulWidget {
  const PushNotificationBridge({required this.child, super.key});
  final Widget child;
  @override
  ConsumerState<PushNotificationBridge> createState() =>
      _PushNotificationBridgeState();
}

class _PushNotificationBridgeState
    extends ConsumerState<PushNotificationBridge> {
  PushOwner? _pendingOpen;
  void _openWhenReady() {
    final owner = _pendingOpen;
    if (owner == null || !ref.read(startupDisplayReadyProvider)) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted ||
          _pendingOpen != owner ||
          ref.read(pushOwnerProvider) != owner) {
        return;
      }
      _pendingOpen = null;
      ref.read(routerProvider).go(AppRoutes.pushNotifications);
    });
  }

  void _event(OwnedPushEvent value) {
    if (ref.read(pushOwnerProvider) != value.owner) return;
    ref.invalidate(unreadCountProvider);
    ref.invalidate(inboxProvider);
    if (value.event == PushEvent.opened) {
      _pendingOpen = value.owner;
      _openWhenReady();
      return;
    }
    final router = ref.read(routerProvider);
    final navigatorContext = router.routerDelegate.navigatorKey.currentContext;
    if (navigatorContext == null) return;
    showAppSnackBarMessage(
      navigatorContext,
      message: context.l10n.pushReceived,
      actionLabel: context.l10n.notificationsTitle,
      onAction: () {
        if (mounted && ref.read(pushOwnerProvider) == value.owner) {
          router.go(AppRoutes.pushNotifications);
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(pushSyncProvider);
    ref.listen(pushEventsProvider, (_, next) {
      if (next.hasValue) _event(next.requireValue);
    });
    ref.listen(startupDisplayReadyProvider, (_, _) => _openWhenReady());
    ref.listen(pushOwnerProvider, (_, next) {
      if (next != _pendingOpen) _pendingOpen = null;
    });
    return widget.child;
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n_context.dart';
import 'notification_providers.dart';

class NotificationButton extends ConsumerWidget {
  const NotificationButton({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(notificationIdentityProvider).signedIn) {
      return const SizedBox.shrink();
    }
    final count = ref.watch(unreadCountProvider).value ?? 0;
    return IconButton(
      tooltip: context.l10n.notificationsTitle,
      onPressed: () => context.push(AppRoutes.notifications),
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: const Icon(Icons.notifications_outlined),
      ),
    );
  }
}

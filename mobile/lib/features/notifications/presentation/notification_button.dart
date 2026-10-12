import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n_context.dart';
import '../../../core/theme/tokens/app_spacing.dart';
import 'notification_providers.dart';

class NotificationButton extends ConsumerWidget {
  const NotificationButton({super.key, this.iconSize});

  final double? iconSize;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(notificationIdentityProvider).signedIn) {
      return const SizedBox.shrink();
    }
    final count = ref.watch(unreadCountProvider).value ?? 0;
    return IconButton(
      iconSize: iconSize,
      tooltip: context.l10n.notificationsTitle,
      onPressed: () => context.push(AppRoutes.notifications),
      icon: _NotificationIcon(count: count),
    );
  }
}

class _NotificationIcon extends StatelessWidget {
  const _NotificationIcon({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) => Stack(
    clipBehavior: Clip.none,
    children: [
      const Icon(Icons.notifications_outlined),
      if (count > 0)
        PositionedDirectional(
          top: -AppSpacing.xs,
          end: -AppSpacing.xs,
          child: Badge(
            // Grow inward from the trailing edge. Bound long counts so the
            // badge stays inside the button's touch target in either direction.
            label: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: IconTheme.of(context).size!,
              ),
              child: FittedBox(fit: BoxFit.scaleDown, child: Text('$count')),
            ),
          ),
        ),
    ],
  );
}

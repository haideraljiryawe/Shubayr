import 'notification_destination.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/error/response_decode.dart';
import '../../../core/layout/app_layout.dart';
import '../../../core/l10n/l10n_context.dart';
import '../../../core/theme/theme_context.dart';
import '../../../core/theme/tokens/app_spacing.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_snackbar.dart';
import '../../../core/widgets/async_value_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../../../core/widgets/state_views.dart';
import '../../auth/presentation/providers/auth_providers.dart';
import '../data/notification_repository.dart';
import 'notification_providers.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  String? _opening;
  Future<void> _open(InboxNotification item) async {
    if (_opening != null) return;
    setState(() => _opening = item.id);
    final session = ref.read(sessionControllerProvider).value;
    try {
      final success = await ref.read(inboxProvider.notifier).markRead(item);
      if (!mounted ||
          !success ||
          session != ref.read(sessionControllerProvider).value) {
        return;
      }
      final destination = item.destination(session!.role);
      if (destination != null) await context.push(destination);
    } catch (error, stack) {
      if (mounted && session == ref.read(sessionControllerProvider).value) {
        showAppSnackBarMessage(
          context,
          message: (actionFailure(error, stack)).localizedMessage(context.l10n),
        );
      }
    } finally {
      if (mounted) setState(() => _opening = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final language = Localizations.localeOf(context).languageCode;
    if (ModalRoute.isCurrentOf(context) ?? true) {
      ref.watch(inboxSyncProvider);
    }
    final value = ref.watch(inboxProvider);
    final controller = ref.read(inboxProvider.notifier);
    return Scaffold(
      appBar: AppBar(title: Text(l.notificationsTitle)),
      body: AsyncValueView(
        value: value,
        loading: ResponsiveCardList(
          minItemWidth: AppLayout.orderMinWidth,
          itemCount: 4,
          itemBuilder: (_, _) => const _NotificationSkeleton(),
        ),
        onRetry: controller.refresh,
        builder: (context, data) => RefreshIndicator(
          onRefresh: controller.refresh,
          child: data.items.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    AppEmptyView(title: l.notificationsEmpty, message: ''),
                  ],
                )
              : ResponsiveCardList(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: AppLayout.pageInsets(context),
                  minItemWidth: AppLayout.orderMinWidth,
                  itemCount: data.items.length,
                  itemKeyBuilder: (i) => data.items[i].id,
                  itemBuilder: (context, index) {
                    final item = data.items[index];
                    return AppCard(
                      onTap: _opening == null ? () => _open(item) : null,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                item.readAt == null
                                    ? Icons.mark_email_unread_outlined
                                    : Icons.drafts_outlined,
                                color: item.readAt == null
                                    ? context.colors.notificationUnread
                                    : context.colors.notificationRead,
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Text(
                                  language == 'ar'
                                      ? item.titleAr
                                      : item.titleEn,
                                  style: context.text.titleSmall,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(language == 'ar' ? item.bodyAr : item.bodyEn),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            DateFormat('yyyy/MM/dd HH:mm', 'en').format(
                              item.createdAt.toUtc().add(
                                const Duration(hours: 3),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                  footer: Column(
                    children: [
                      if (data.syncError != null)
                        AppErrorView(
                          error: data.syncError,
                          onRetry: controller.sync,
                        ),
                      if (data.appendError != null)
                        AppErrorView(
                          error: data.appendError,
                          onRetry: controller.loadMore,
                        )
                      else if (data.loadingMore)
                        const _NotificationSkeleton()
                      else if (data.page.hasMore)
                        TextButton(
                          onPressed: controller.loadMore,
                          child: Text(l.actionLoadMore),
                        ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}

class _NotificationSkeleton extends StatelessWidget {
  const _NotificationSkeleton();
  @override
  Widget build(BuildContext context) => const AppCard(
    child: Column(
      children: [
        Skeleton.line(),
        SizedBox(height: AppSpacing.md),
        Skeleton.line(),
        SizedBox(height: AppSpacing.sm),
        Skeleton.line(),
      ],
    ),
  );
}

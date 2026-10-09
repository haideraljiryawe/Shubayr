import 'delivery_status_dialog.dart';
import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/utils/display_date.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/error/response_decode.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../notifications/presentation/notification_button.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/delivery.dart';
import '../delivery_status.dart';
import '../providers/delivery_providers.dart';

class DeliveryHomeScreen extends ConsumerWidget {
  const DeliveryHomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(
      title: Text(context.l10n.deliveryTitle),
      actions: [
        const NotificationButton(),
        IconButton(
          onPressed: () => context.push(AppRoutes.settings),
          icon: const Icon(Icons.person_outline),
          tooltip: context.l10n.accountTitle,
        ),
      ],
    ),
    body: ref.watch(sessionControllerProvider).value?.role == UserRole.delivery
        ? const _DeliveriesList()
        : AppEmptyView(title: context.l10n.deliveryNoAccess, message: ''),
  );
}

class _DeliveriesList extends ConsumerWidget {
  const _DeliveriesList();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedbackContext = context;
    final value = ref.watch(deliveriesProvider);
    final selected = ref.watch(deliveryStatusFilterProvider);
    final controller = ref.read(deliveriesProvider.notifier);
    void loadIfNearEnd(ScrollMetrics metrics) {
      final list = ref.read(deliveriesProvider).value;
      if (metrics.axis == Axis.vertical &&
          metrics.extentAfter < metrics.viewportDimension &&
          list?.loadMoreError == null) {
        controller.loadMore();
      }
    }

    return Column(
      children: [
        _DeliveryStatusFilterBar(
          selected: selected,
          enabled: value.value?.updatingId == null && !controller.isRefreshing,
          onSelected: ref.read(deliveryStatusFilterProvider.notifier).select,
        ),
        Expanded(
          child: AsyncValueView(
            value: value,
            skipLoadingOnReload: controller.isRefreshing,
            loading: ResponsiveCardList(
              itemCount: 4,
              minItemWidth: AppLayout.orderMinWidth,
              physics: const NeverScrollableScrollPhysics(),
              itemBuilder: (_, _) => const _DeliverySkeleton(),
            ),
            onRetry: controller.refresh,
            builder: (context, list) => RefreshIndicator(
              onRefresh: controller.refresh,
              child: NotificationListener<ScrollMetricsNotification>(
                onNotification: (event) {
                  if (event.depth == 0) loadIfNearEnd(event.metrics);
                  return false;
                },
                child: NotificationListener<ScrollNotification>(
                  onNotification: (event) {
                    if (event.depth == 0) loadIfNearEnd(event.metrics);
                    return false;
                  },
                  child: list.items.isEmpty
                      ? CustomScrollView(
                          key: ValueKey(selected),
                          physics: const AlwaysScrollableScrollPhysics(),
                          slivers: [
                            SliverFillRemaining(
                              hasScrollBody: false,
                              child: AppEmptyView(
                                icon: Icons.local_shipping_outlined,
                                title: selected == null
                                    ? context.l10n.deliveryEmptyTitle
                                    : context.l10n.deliveryFilterEmpty,
                                message: selected == null
                                    ? context.l10n.deliveryEmptyMessage
                                    : null,
                              ),
                            ),
                          ],
                        )
                      : ResponsiveCardList(
                          key: ValueKey(selected),
                          minItemWidth: AppLayout.orderMinWidth,
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: AppLayout.pageInsets(context),
                          itemCount: list.items.length,
                          itemKeyBuilder: (i) => list.items[i].id,
                          footer: list.loadMoreError != null
                              ? AppErrorView(
                                  error: list.loadMoreError,
                                  onRetry: controller.loadMore,
                                )
                              : list.loadingMore
                              ? const _DeliverySkeleton()
                              : null,
                          itemBuilder: (context, index) {
                            return _DeliveryCard(
                              key: ValueKey(list.items[index].id),
                              delivery: list.items[index],
                              busy: list.updatingId == list.items[index].id,
                              enabled:
                                  !value.isLoading && list.updatingId == null,
                              onUpdated: () {
                                if (feedbackContext.mounted) {
                                  showAppSnackBarMessage(
                                    feedbackContext,
                                    message: feedbackContext
                                        .l10n
                                        .deliveryStatusUpdated,
                                  );
                                }
                              },
                              onFailed: (failure) {
                                if (feedbackContext.mounted) {
                                  showAppSnackBarMessage(
                                    feedbackContext,
                                    message: failure.statusCode == 409
                                        ? feedbackContext
                                              .l10n
                                              .deliveryStatusConflict
                                        : failure.localizedMessage(
                                            feedbackContext.l10n,
                                          ),
                                  );
                                }
                              },
                            );
                          },
                        ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DeliveryStatusFilterBar extends StatelessWidget {
  const _DeliveryStatusFilterBar({
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });
  final String? selected;
  final bool enabled;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    padding: AppLayout.pageInsets(
      context,
      top: AppSpacing.xs,
      bottom: AppSpacing.xs,
    ),
    child: Row(
      children: [
        for (final status in <String?>[null, ...Delivery.statuses])
          Padding(
            padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
            child: ChoiceChip(
              label: Text(
                status == null
                    ? context.l10n.deliveryFilterAll
                    : deliveryStatusLabel(context.l10n, status),
              ),
              selected: selected == status,
              showCheckmark: false,
              onSelected: enabled ? (_) => onSelected(status) : null,
            ),
          ),
      ],
    ),
  );
}

class _DeliveryCard extends ConsumerStatefulWidget {
  const _DeliveryCard({
    super.key,
    required this.delivery,
    required this.busy,
    required this.enabled,
    required this.onUpdated,
    required this.onFailed,
  });
  final VoidCallback onUpdated;
  final ValueChanged<AppFailure> onFailed;
  final Delivery delivery;
  final bool busy;
  final bool enabled;
  @override
  ConsumerState<_DeliveryCard> createState() => _DeliveryCardState();
}

class _DeliveryCardState extends ConsumerState<_DeliveryCard> {
  bool _dialogOpen = false;
  Future<void> _update() async {
    if (_dialogOpen) return;
    setState(() => _dialogOpen = true);
    final id = widget.delivery.id;
    final onUpdated = widget.onUpdated;
    final onFailed = widget.onFailed;
    try {
      final controller = ref.read(deliveriesProvider.notifier);
      final pending = await controller.pendingCollection(id);
      if (!mounted) return;
      final choice = await showDialog<DeliveryStatusChoice>(
        context: context,
        builder: (_) =>
            DeliveryStatusDialog(delivery: widget.delivery, pending: pending),
      );
      if (choice == null || !mounted) return;
      final saved = await controller.updateStatus(
        id,
        choice.status,
        reason: choice.reason,
        collection: choice.collection,
      );
      if (saved) onUpdated();
    } catch (error, stack) {
      final failure = actionFailure(error, stack);
      onFailed(failure);
    } finally {
      if (mounted) setState(() => _dialogOpen = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final delivery = widget.delivery;
    final l10n = context.l10n;
    final colors = context.colors;
    final brand = ref.watch(brandProvider);
    final statusColor = deliveryStatusColor(colors, delivery.status);
    final fee = formatMoney(
      delivery.deliveryFee,
      currencyCode: delivery.currency ?? brand.currencyCode,
      localeCode: Localizations.localeOf(context).languageCode,
    );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.20),
              borderRadius: AppRadii.smAll,
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Text(
                deliveryStatusLabel(l10n, delivery.status),
                style: context.text.labelMedium?.copyWith(
                  color: statusColor,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            l10n.deliveryOrderId,
            style: context.text.bodySmall?.copyWith(
              color: colors.textSecondary,
            ),
          ),
          Text(
            delivery.orderId,
            textDirection: TextDirection.ltr,
            style: context.text.titleSmall,
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            '${l10n.deliveryFee}: $fee',
            style: context.text.titleSmall?.copyWith(color: colors.primaryDark),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            '${l10n.deliveryAmountDue}: ${formatMoney(delivery.amountDue, currencyCode: 'IQD', localeCode: Localizations.localeOf(context).languageCode)}',
            style: context.text.titleSmall,
          ),
          if (delivery.dispatchedAt != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              '${l10n.deliveryDispatchedAt}: ${DisplayDate.localDateTime(delivery.dispatchedAt!)}',
              style: context.text.bodySmall,
            ),
          ],
          if (delivery.failureReason != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(delivery.failureReason!),
          ],
          if (delivery.retryCount > 0) ...[
            const SizedBox(height: AppSpacing.sm),
            Text('${l10n.deliveryRetryCount}: ${delivery.retryCount}'),
          ],
          if (delivery.deliveredAt != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              '${l10n.deliveryDeliveredAt}: ${DisplayDate.localDateTime(delivery.deliveredAt!)}',
              style: context.text.bodySmall,
            ),
          ],
          if (delivery.nextStatuses.isNotEmpty &&
              delivery.orderVersion != null &&
              delivery.orderVersion! >= 1) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: l10n.deliveryUpdateStatus,
              variant: AppButtonVariant.secondary,
              isLoading: widget.busy,
              onPressed: widget.enabled && !_dialogOpen ? _update : null,
            ),
          ],
        ],
      ),
    );
  }
}

class _DeliverySkeleton extends StatelessWidget {
  const _DeliverySkeleton();
  @override
  Widget build(BuildContext context) => const AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Skeleton.line(),
        SizedBox(height: AppSpacing.md),
        Skeleton.line(),
        SizedBox(height: AppSpacing.xs),
        Skeleton.line(),
        SizedBox(height: AppSpacing.md),
        Skeleton.line(),
        SizedBox(height: AppSpacing.sm),
        Skeleton.line(),
        SizedBox(height: AppSpacing.md),
        Skeleton.box(height: AppSpacing.xxxl, width: double.infinity),
      ],
    ),
  );
}

import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../../../app/router/app_routes.dart';
import '../../../../core/error/failure.dart';
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
import '../../../auth/domain/permissions.dart';
import '../../../auth/presentation/widgets/permission_gate.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/delivery.dart';
import '../delivery_status.dart';
import '../providers/delivery_providers.dart';

class DeliveryHomeScreen extends StatelessWidget {
  const DeliveryHomeScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(context.l10n.deliveryTitle),
      actions: [
        IconButton(
          onPressed: () => context.push(AppRoutes.settings),
          icon: const Icon(Icons.person_outline),
          tooltip: context.l10n.accountTitle,
        ),
      ],
    ),
    body: PermissionGate(
      permission: Permissions.deliveryAssigned,
      fallback: AppEmptyView(
        icon: Icons.lock_outline,
        title: context.l10n.deliveryNoAccess,
        message: '',
      ),
      child: const _DeliveriesList(),
    ),
  );
}

class _DeliveriesList extends ConsumerWidget {
  const _DeliveriesList();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(deliveriesProvider);
    final controller = ref.read(deliveriesProvider.notifier);
    void loadIfNearEnd(ScrollMetrics metrics) {
      final list = ref.read(deliveriesProvider).value;
      if (metrics.axis == Axis.vertical &&
          metrics.extentAfter < metrics.viewportDimension &&
          list?.loadMoreError == null) {
        controller.loadMore();
      }
    }

    return AsyncValueView(
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
                    physics: const AlwaysScrollableScrollPhysics(),
                    slivers: [
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: AppEmptyView(
                          icon: Icons.local_shipping_outlined,
                          title: context.l10n.deliveryEmptyTitle,
                          message: context.l10n.deliveryEmptyMessage,
                        ),
                      ),
                    ],
                  )
                : ResponsiveCardList(
                    minItemWidth: AppLayout.orderMinWidth,
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: AppLayout.pageInsets(context),
                    itemCount: list.items.length,
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
                        enabled: !value.isLoading && list.updatingId == null,
                      );
                    },
                  ),
          ),
        ),
      ),
    );
  }
}

class _DeliveryCard extends ConsumerStatefulWidget {
  const _DeliveryCard({
    super.key,
    required this.delivery,
    required this.busy,
    required this.enabled,
  });
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
    final l10n = context.l10n;
    final id = widget.delivery.id;
    final previousStatus = widget.delivery.status;
    String? selection;
    try {
      final status = await showDialog<String>(
        context: context,
        builder: (context) => StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: Text(l10n.deliveryUpdateStatus),
            content: DropdownButtonFormField<String>(
              isExpanded: true,
              decoration: InputDecoration(labelText: l10n.deliverySelectStatus),
              items: [
                for (final status in Delivery.updateStatuses)
                  if (status != previousStatus)
                    DropdownMenuItem(
                      value: status,
                      child: Text(deliveryStatusLabel(l10n, status)),
                    ),
              ],
              onChanged: (value) => setDialogState(() => selection = value),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(l10n.actionCancel),
              ),
              TextButton(
                onPressed: selection == null
                    ? null
                    : () => Navigator.pop(context, selection),
                child: Text(l10n.actionSave),
              ),
            ],
          ),
        ),
      );
      if (status == null || !mounted) return;
      final saved = await ref
          .read(deliveriesProvider.notifier)
          .updateStatus(id, status);
      if (saved && mounted) {
        showAppSnackBarMessage(context, message: l10n.deliveryStatusUpdated);
      }
    } catch (error) {
      if (!mounted) return;
      final failure = error is AppFailure ? error : const AppFailure.unknown();
      showAppSnackBarMessage(context, message: failure.localizedMessage(l10n));
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
      currencyCode: brand.currencyCode,
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
          if (delivery.dispatchedAt != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              '${l10n.deliveryDispatchedAt}: ${DateFormat('yyyy/MM/dd HH:mm', 'en').format(delivery.dispatchedAt!.toLocal())}',
              style: context.text.bodySmall,
            ),
          ],
          if (delivery.deliveredAt != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              '${l10n.deliveryDeliveredAt}: ${DateFormat('yyyy/MM/dd HH:mm', 'en').format(delivery.deliveredAt!.toLocal())}',
              style: context.text.bodySmall,
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: l10n.deliveryUpdateStatus,
            variant: AppButtonVariant.secondary,
            isLoading: widget.busy,
            onPressed: widget.enabled && !_dialogOpen ? _update : null,
          ),
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

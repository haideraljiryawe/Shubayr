import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/order.dart';
import '../order_status.dart';
import '../providers/order_providers.dart';
import '../widgets/order_status_pill.dart';

/// The statuses offered as filter chips, in lifecycle order after "All".
const _filterStatuses = [
  'pending',
  'confirmed',
  'processing',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'cancelled',
  'return_requested',
  'returned',
];

/// The customer's orders, newest first, with a status-filter chip bar on top.
/// Each card opens the order's details and tracking. Pull to refresh restarts
/// the active repository query; scrolling appends subsequent pages.
class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final orders = ref.watch(ordersProvider);
    final status = ref.watch(orderStatusFilterProvider);
    final controller = ref.read(ordersProvider.notifier);

    void loadIfNearEnd(ScrollMetrics metrics) {
      final current = ref.read(ordersProvider).valueOrNull;
      if (metrics.axis == Axis.vertical &&
          metrics.extentAfter < metrics.viewportDimension &&
          current?.loadMoreError == null) {
        controller.loadMore();
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.ordersTitle)),
      body: Column(
        children: [
          _StatusFilterBar(
            selected: status,
            onSelected: (value) =>
                ref.read(orderStatusFilterProvider.notifier).state = value,
          ),
          Expanded(
            child: AsyncValueView(
              value: orders,
              loading: const Padding(
                padding: EdgeInsets.all(AppSpacing.screenH),
                child: SkeletonCardList(),
              ),
              onRetry: controller.refresh,
              builder: (context, list) => RefreshIndicator(
                onRefresh: controller.refresh,
                child: NotificationListener<ScrollMetricsNotification>(
                  // Also fill a viewport taller than the first page, without
                  // requiring a scroll gesture on a list that cannot scroll.
                  onNotification: (notification) {
                    if (notification.depth == 0) {
                      loadIfNearEnd(notification.metrics);
                    }
                    return false;
                  },
                  child: NotificationListener<ScrollNotification>(
                    onNotification: (notification) {
                      if (notification.depth == 0) {
                        loadIfNearEnd(notification.metrics);
                      }
                      return false;
                    },
                    child: list.items.isEmpty
                        ? ListView(
                            key: ValueKey(status),
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: [
                              SizedBox(
                                height: 320,
                                child: AppEmptyView(
                                  icon: status == null
                                      ? Icons.receipt_long_outlined
                                      : Icons.inbox_outlined,
                                  title: status == null
                                      ? l10n.ordersEmptyTitle
                                      : l10n.ordersFilterEmpty,
                                  message: status == null
                                      ? l10n.ordersEmptyMessage
                                      : null,
                                ),
                              ),
                            ],
                          )
                        : ListView.separated(
                            key: ValueKey(status),
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.all(AppSpacing.screenH),
                            itemCount:
                                list.items.length +
                                (list.loadingMore || list.loadMoreError != null
                                    ? 1
                                    : 0),
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: AppSpacing.md),
                            itemBuilder: (_, i) {
                              if (i < list.items.length) {
                                return _OrderCard(order: list.items[i]);
                              }
                              if (list.loadMoreError != null) {
                                return AppErrorView(
                                  error: list.loadMoreError,
                                  onRetry: controller.loadMore,
                                );
                              }
                              return const SkeletonCardList(itemCount: 1);
                            },
                          ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Horizontal, scrollable status filter — "All" plus a chip per status, each
/// carrying the same icon and colour it has in the order cards.
class _StatusFilterBar extends StatelessWidget {
  const _StatusFilterBar({required this.selected, required this.onSelected});

  final String? selected;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    // (filter value, leading icon, icon colour, label)
    final filters = <(String?, IconData, Color, String)>[
      (
        null,
        Icons.receipt_long_outlined,
        colors.textSecondary,
        l10n.ordersFilterAll,
      ),
      for (final s in _filterStatuses)
        (
          s,
          orderStatusIcon(s),
          orderStatusColor(colors, s),
          orderStatusLabel(l10n, s),
        ),
    ];

    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenH,
          vertical: AppSpacing.xs,
        ),
        children: [
          for (final (status, icon, color, label) in filters)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
              child: ChoiceChip(
                avatar: Icon(icon, size: 18, color: color),
                label: Text(label),
                selected: selected == status,
                showCheckmark: false,
                onSelected: (_) => onSelected(status),
              ),
            ),
        ],
      ),
    );
  }
}

class _OrderCard extends ConsumerWidget {
  const _OrderCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    final brand = ref.watch(brandProvider);
    final count = order.items.fold<int>(0, (s, i) => s + i.quantity);
    final placedAt = order.placedAt;

    return AppCard(
      onTap: () => context.pushNamed(
        AppRoutes.orderDetailName,
        pathParameters: {'id': order.id},
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(order.orderNumber, style: context.text.titleSmall),
              ),
              OrderStatusPill(status: order.status),
            ],
          ),
          if (placedAt != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              DateFormat('yyyy/MM/dd').format(placedAt),
              style: context.text.bodySmall?.copyWith(color: colors.textMuted),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Text(
                l10n.orderItemsCount('$count'),
                style: context.text.bodySmall?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
              const Spacer(),
              Text(
                formatMoney(
                  order.total,
                  currencyCode: brand.currencyCode,
                  localeCode: lang,
                ),
                style: context.text.titleSmall?.copyWith(
                  color: colors.primaryDark,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

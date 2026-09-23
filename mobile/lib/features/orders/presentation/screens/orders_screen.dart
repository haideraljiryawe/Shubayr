import '../../../../core/config/app_config.dart';
import '../../../../core/layout/app_layout.dart';
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
      final current = ref.read(ordersProvider).value;
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
            statuses: ref.watch(dataSourceProvider) == DataSource.remote
                ? remoteOrderStatuses
                : _filterStatuses,
            onSelected: (value) =>
                ref.read(orderStatusFilterProvider.notifier).state = value,
          ),
          Expanded(
            child: AsyncValueView(
              value: orders,
              loading: Padding(
                padding: AppLayout.pageInsets(context),
                child: SkeletonCardList(minItemWidth: AppLayout.cardMinWidth),
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
                        : ResponsiveCardList(
                            key: ValueKey(status),
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: AppLayout.pageInsets(context),
                            itemCount: list.items.length,
                            footer: list.loadMoreError != null
                                ? AppErrorView(
                                    error: list.loadMoreError,
                                    onRetry: controller.loadMore,
                                  )
                                : list.loadingMore
                                ? const SkeletonCardList(itemCount: 1)
                                : null,
                            itemBuilder: (_, i) {
                              return _OrderCard(order: list.items[i]);
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
  const _StatusFilterBar({
    required this.selected,
    required this.onSelected,
    required this.statuses,
  });

  final List<String> statuses;
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
      for (final s in statuses)
        (
          s,
          orderStatusIcon(s),
          orderStatusColor(colors, s),
          orderStatusLabel(l10n, s),
        ),
    ];

    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: AppLayout.pageInsets(
          context,
          top: AppSpacing.xs,
          bottom: AppSpacing.xs,
        ),
        child: Row(
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

import '../../../core/widgets/app_text_selection_toolbar.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/layout/app_layout.dart';
import '../../../core/l10n/l10n_context.dart';
import '../../../core/theme/theme_context.dart';
import '../../../core/theme/tokens/app_spacing.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/async_value_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../../../core/widgets/state_views.dart';
import '../../notifications/presentation/notification_button.dart';
import '../../orders/data/order.dart';
import '../../orders/presentation/order_status.dart';
import '../../orders/presentation/widgets/order_status_pill.dart';
import '../../settings/presentation/providers/settings_providers.dart';
import '../data/monitor_repository.dart';
import 'monitor_providers.dart';

class MonitorOrdersScreen extends ConsumerStatefulWidget {
  const MonitorOrdersScreen({super.key});
  @override
  ConsumerState<MonitorOrdersScreen> createState() =>
      _MonitorOrdersScreenState();
}

class _MonitorOrdersScreenState extends ConsumerState<MonitorOrdersScreen> {
  late final _search = TextEditingController(
    text: ref.read(monitorFilterProvider).search,
  );
  Timer? _debounce;
  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _select({
    String? status,
    bool setStatus = false,
    String? search,
    DateTimeRange? dates,
    bool setDates = false,
  }) {
    final old = ref.read(monitorFilterProvider);
    ref
        .read(monitorFilterProvider.notifier)
        .select(
          MonitorQuery(
            status: setStatus ? status : old.status,
            search: search ?? old.search,
            from: setDates ? dates?.start : old.from,
            to: setDates ? dates?.end : old.to,
          ),
        );
  }

  Future<void> _dates() async {
    final old = ref.read(monitorFilterProvider);
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(1900),
      lastDate: DateTime(DateTime.now().year + 1, 12, 31),
      initialDateRange: old.from != null && old.to != null
          ? DateTimeRange(start: old.from!, end: old.to!)
          : null,
      builder: (_, child) => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: AppLayout.dateRangeWidth),
          child: child!,
        ),
      ),
    );
    if (mounted && range != null) _select(dates: range, setDates: true);
  }

  Widget _loadNearEnd(Widget child) {
    void load(ScrollMetrics metrics) {
      if (metrics.axis == Axis.vertical &&
          metrics.extentAfter < metrics.viewportDimension &&
          ref.read(monitorOrdersProvider).value?.appendError == null) {
        ref.read(monitorOrdersProvider.notifier).loadMore();
      }
    }

    return NotificationListener<ScrollMetricsNotification>(
      onNotification: (event) {
        if (event.depth == 0) load(event.metrics);
        return false;
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: (event) {
          if (event.depth == 0) load(event.metrics);
          return false;
        },
        child: child,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    ref.listen(monitorIdentityProvider, (_, _) {
      _debounce?.cancel();
      _search.clear();
    });
    final query = ref.watch(monitorFilterProvider);
    final value = ref.watch(monitorOrdersProvider);
    final controller = ref.read(monitorOrdersProvider.notifier);
    final counts = value.value?.page.counts ?? const <String, int>{};
    return Scaffold(
      appBar: AppBar(
        title: Text(l.monitorTitle),
        actions: [
          const NotificationButton(),
          if (!AppLayout.usesWideHeader(context))
            IconButton(
              onPressed: () => context.push(AppRoutes.settings),
              icon: const Icon(Icons.person_outline),
              tooltip: l.accountTitle,
            ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: AppLayout.pageInsets(context),
            child: ResponsiveFields(
              children: [
                TextField(
                  contextMenuBuilder: appTextSelectionToolbar,
                  controller: _search,
                  maxLength: 80,
                  decoration: InputDecoration(
                    hintText: l.adminOrderSearch,
                    counterText: '',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(
                      tooltip: l.adminOrderClearSearch,
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _debounce?.cancel();
                        _search.clear();
                        _select(search: '');
                      },
                    ),
                  ),
                  onChanged: (text) {
                    _debounce?.cancel();
                    _debounce = Timer(const Duration(milliseconds: 300), () {
                      if (mounted) _select(search: text);
                    });
                  },
                ),
                Wrap(
                  spacing: AppSpacing.sm,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _dates,
                      icon: const Icon(Icons.date_range),
                      label: Text(
                        query.from == null
                            ? l.adminOrderDateRange
                            : '${MonitorQuery.date(query.from!)} – ${MonitorQuery.date(query.to!)}',
                      ),
                    ),
                    if (query.from != null)
                      IconButton(
                        onPressed: () => _select(setDates: true),
                        tooltip: l.adminOrderClearDates,
                        icon: const Icon(Icons.clear),
                      ),
                  ],
                ),
              ],
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
            child: Row(
              children: [
                for (final status in [null, ...remoteOrderStatuses])
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      end: AppSpacing.sm,
                    ),
                    child: ChoiceChip(
                      label: Text(
                        '${status == null ? l.ordersFilterAll : orderStatusLabel(l, status)} (${status == null ? counts['all'] ?? 0 : counts[status] ?? 0})',
                      ),
                      selected: query.status == status,
                      onSelected: (_) =>
                          _select(status: status, setStatus: true),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: AsyncValueView(
              value: value,
              loading: const MonitorListSkeleton(),
              onRetry: controller.refresh,
              builder: (context, list) => _loadNearEnd(
                RefreshIndicator(
                  onRefresh: controller.refresh,
                  child: list.items.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            AppEmptyView(
                              title: l.ordersEmptyTitle,
                              message: l.adminOrderEmptyHint,
                            ),
                          ],
                        )
                      : ResponsiveCardList(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: AppLayout.pageInsets(context),
                          minItemWidth: AppLayout.orderMinWidth,
                          itemCount: list.items.length,
                          itemKeyBuilder: (i) => list.items[i].order.id,
                          itemBuilder: (_, index) =>
                              _OrderCard(item: list.items[index]),
                          footer: list.appendError != null
                              ? AppErrorView(
                                  error: list.appendError,
                                  onRetry: controller.loadMore,
                                )
                              : list.loadingMore
                              ? const MonitorCardSkeleton()
                              : list.page.hasMore
                              ? Center(
                                  child: TextButton(
                                    onPressed: controller.loadMore,
                                    child: Text(l.actionLoadMore),
                                  ),
                                )
                              : null,
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

class _OrderCard extends ConsumerWidget {
  const _OrderCard({required this.item});
  final MonitorOrder item;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = item.order;
    return AppCard(
      onTap: () =>
          context.push('${AppRoutes.monitor}/${Uri.encodeComponent(item.id)}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(order.orderNumber, style: context.text.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          OrderStatusPill(status: order.status),
          const SizedBox(height: AppSpacing.sm),
          if (item.customerName?.trim().isNotEmpty == true)
            Text(item.customerName!),
          Text(item.customerPhone, textDirection: TextDirection.ltr),
          const SizedBox(height: AppSpacing.sm),
          Text(
            formatMoney(
              order.total,
              currencyCode: ref.watch(brandProvider).currencyCode,
              localeCode: Localizations.localeOf(context).languageCode,
            ),
            style: context.text.titleSmall,
          ),
          if (order.placedAt != null)
            Text(
              MonitorQuery.date(
                order.placedAt!.toUtc().add(const Duration(hours: 3)),
              ),
            ),
        ],
      ),
    );
  }
}

class MonitorCardSkeleton extends StatelessWidget {
  const MonitorCardSkeleton({super.key});
  @override
  Widget build(BuildContext context) => const AppCard(
    child: Column(
      children: [
        Skeleton.line(),
        SizedBox(height: AppSpacing.md),
        Skeleton.line(),
        SizedBox(height: AppSpacing.md),
        Skeleton.line(),
        SizedBox(height: AppSpacing.md),
        Skeleton.line(),
      ],
    ),
  );
}

class MonitorListSkeleton extends StatelessWidget {
  const MonitorListSkeleton({super.key});
  @override
  Widget build(BuildContext context) => ResponsiveCardList(
    itemCount: 4,
    minItemWidth: AppLayout.orderMinWidth,
    itemBuilder: (_, _) => const MonitorCardSkeleton(),
  );
}

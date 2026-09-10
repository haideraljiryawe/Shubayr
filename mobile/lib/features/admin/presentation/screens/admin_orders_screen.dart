import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../auth/domain/permissions.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../orders/data/order.dart';
import '../../../orders/presentation/order_status.dart';
import '../../../orders/presentation/widgets/order_status_pill.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../domain/admin_order_repository.dart';
import '../providers/admin_order_providers.dart';
import '../providers/admin_providers.dart';

class AdminOrdersScreen extends ConsumerStatefulWidget {
  const AdminOrdersScreen({super.key});
  @override
  ConsumerState<AdminOrdersScreen> createState() => _AdminOrdersScreenState();
}

class _AdminOrdersScreenState extends ConsumerState<AdminOrdersScreen> {
  late final _search = TextEditingController(
    text: ref.read(adminOrderFilterProvider).search,
  );
  Timer? _debounce;
  bool _dialogOpen = false;
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
    DateTimeRange? range,
    bool setDates = false,
  }) {
    final old = ref.read(adminOrderFilterProvider);
    ref
        .read(adminOrderFilterProvider.notifier)
        .select(
          AdminOrderQuery(
            status: setStatus ? status : old.status,
            search: search ?? old.search,
            from: setDates ? range?.start : old.from,
            to: setDates ? range?.end : old.to,
          ),
        );
  }

  Future<void> _dates() async {
    final query = ref.read(adminOrderFilterProvider);
    final now = DateTime.now();
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(1900),
      lastDate: DateTime(now.year + 1, 12, 31),
      initialDateRange: query.from == null || query.to == null
          ? null
          : DateTimeRange(start: query.from!, end: query.to!),
    );
    if (range != null && mounted) _select(range: range, setDates: true);
  }

  Future<void> _update(Order order, {bool confirm = false}) async {
    if (_dialogOpen) return;
    setState(() => _dialogOpen = true);
    final l = context.l10n;
    final sessionAtOpen = ref.read(adminSessionProvider);
    String? selection = confirm ? 'confirmed' : null;
    try {
      final status = await showDialog<String>(
        context: context,
        builder: (context) => StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: Text(confirm ? l.adminOrderConfirm : l.adminOrderUpdate),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(order.orderNumber.isEmpty ? order.id : order.orderNumber),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  '${l.adminOrderCurrentStatus}: ${orderStatusLabel(l, order.status)}',
                ),
                const SizedBox(height: AppSpacing.md),
                if (confirm)
                  Text(l.adminOrderConfirmMessage)
                else
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: l.adminOrderNewStatus,
                    ),
                    items: [
                      for (final status in adminOrderStatuses)
                        if (status != order.status)
                          DropdownMenuItem(
                            value: status,
                            child: Text(orderStatusLabel(l, status)),
                          ),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => selection = value),
                  ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(l.actionCancel),
              ),
              TextButton(
                onPressed: selection == null
                    ? null
                    : () => Navigator.pop(context, selection),
                child: Text(confirm ? l.adminOrderConfirm : l.actionSave),
              ),
            ],
          ),
        ),
      );
      if (status == null || !mounted) return;
      if (ref.read(adminSessionProvider) != sessionAtOpen) return;
      final saved = await ref
          .read(adminOrdersProvider.notifier)
          .updateStatus(order.id, status, expectedStatus: order.status);
      if (saved && mounted) {
        showAppSnackBarMessage(context, message: l.adminOrderUpdated);
      }
    } catch (error) {
      if (mounted) {
        showAppSnackBarMessage(
          context,
          message: (error is AppFailure ? error : const AppFailure.unknown())
              .localizedMessage(l),
        );
      }
    } finally {
      if (mounted) setState(() => _dialogOpen = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    ref.listen(adminSessionProvider, (previous, next) {
      if (previous != null && previous != next) {
        _debounce?.cancel();
        _search.clear();
      }
    });
    final session = ref.watch(adminSessionProvider);
    final permissions = ref.watch(sessionControllerProvider).valueOrNull;
    if (!session.staff || permissions?.can(Permissions.ordersView) != true) {
      return Scaffold(
        appBar: AppBar(title: Text(l.adminSectionOrders)),
        body: AppEmptyView(message: l.adminNoAccess),
      );
    }
    final query = ref.watch(adminOrderFilterProvider),
        value = ref.watch(adminOrdersProvider);
    final controller = ref.read(adminOrdersProvider.notifier);
    void nearEnd(ScrollMetrics metrics) {
      if (metrics.axis == Axis.vertical &&
          metrics.extentAfter < metrics.viewportDimension &&
          ref.read(adminOrdersProvider).valueOrNull?.appendError == null) {
        controller.loadMore();
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(l.adminSectionOrders)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.screenH),
            child: TextField(
              controller: _search,
              decoration: InputDecoration(
                hintText: l.adminOrderSearch,
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
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
                setState(() {});
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 300), () {
                  if (mounted) _select(search: text.trim());
                });
              },
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
            child: Row(
              children: [
                for (final status in [null, ...adminOrderStatuses])
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      end: AppSpacing.sm,
                    ),
                    child: ChoiceChip(
                      label: Text(
                        status == null
                            ? l.ordersFilterAll
                            : orderStatusLabel(l, status),
                      ),
                      selected: query.status == status,
                      showCheckmark: false,
                      onSelected: (_) =>
                          _select(status: status, setStatus: true),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenH,
              vertical: AppSpacing.sm,
            ),
            child: Wrap(
              spacing: AppSpacing.sm,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                TextButton.icon(
                  onPressed: _dates,
                  icon: const Icon(Icons.date_range_outlined),
                  label: Text(
                    query.from == null
                        ? l.adminOrderDateRange
                        : '${AdminOrderQuery.date(query.from!)} — ${AdminOrderQuery.date(query.to!)}',
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
          ),
          Expanded(
            child: AsyncValueView(
              value: value,
              loading: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenH),
                children: const [
                  _OrderSkeleton(),
                  SizedBox(height: AppSpacing.md),
                  _OrderSkeleton(),
                ],
              ),
              onRetry: controller.refresh,
              builder: (_, list) => RefreshIndicator(
                onRefresh: controller.refresh,
                child: NotificationListener<ScrollMetricsNotification>(
                  onNotification: (event) {
                    if (event.depth == 0) nearEnd(event.metrics);
                    return false;
                  },
                  child: NotificationListener<ScrollNotification>(
                    onNotification: (event) {
                      if (event.depth == 0) nearEnd(event.metrics);
                      return false;
                    },
                    child: list.items.isEmpty
                        ? CustomScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            slivers: [
                              SliverFillRemaining(
                                hasScrollBody: false,
                                child: AppEmptyView(
                                  title: l.adminEmpty,
                                  message: l.adminOrderEmptyHint,
                                ),
                              ),
                            ],
                          )
                        : ListView.separated(
                            key: ValueKey(query),
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.all(AppSpacing.screenH),
                            itemCount:
                                list.items.length +
                                (list.loadingMore || list.appendError != null
                                    ? 1
                                    : 0),
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: AppSpacing.md),
                            itemBuilder: (_, index) {
                              if (index == list.items.length) {
                                return list.appendError != null
                                    ? AppErrorView(
                                        error: list.appendError,
                                        onRetry: controller.loadMore,
                                      )
                                    : const _OrderSkeleton();
                              }
                              final order = list.items[index];
                              final enabled =
                                  !value.isLoading &&
                                  !list.loadingMore &&
                                  list.updatingId == null &&
                                  !_dialogOpen;
                              return _OrderCard(
                                order: order,
                                busy: list.updatingId == order.id,
                                canUpdate:
                                    permissions?.can(
                                      Permissions.ordersUpdate,
                                    ) ==
                                    true,
                                onConfirm: enabled
                                    ? () => _update(order, confirm: true)
                                    : null,
                                onUpdate: enabled ? () => _update(order) : null,
                              );
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

class _OrderCard extends ConsumerWidget {
  const _OrderCard({
    required this.order,
    required this.busy,
    required this.canUpdate,
    this.onConfirm,
    this.onUpdate,
  });
  final Order order;
  final bool busy, canUpdate;
  final VoidCallback? onConfirm, onUpdate;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n, brand = ref.watch(brandProvider);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            order.orderNumber.isEmpty ? order.id : order.orderNumber,
            style: context.text.titleSmall,
          ),
          const SizedBox(height: AppSpacing.sm),
          OrderStatusPill(status: order.status),
          if (order.placedAt != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              DateFormat(
                'yyyy/MM/dd HH:mm',
                'en',
              ).format(order.placedAt!.toLocal()),
              style: context.text.bodySmall,
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.xs,
            children: [
              Text(
                l.orderItemsCount(
                  '${order.items.fold<int>(0, (total, item) => total + item.quantity)}',
                ),
                style: context.text.bodySmall,
              ),
              Text(
                formatMoney(
                  order.total,
                  currencyCode: brand.currencyCode,
                  localeCode: Localizations.localeOf(context).languageCode,
                ),
                style: context.text.titleSmall?.copyWith(
                  color: context.colors.primaryDark,
                ),
              ),
            ],
          ),
          if (canUpdate) ...[
            const SizedBox(height: AppSpacing.md),
            if (order.status == 'pending') ...[
              AppButton(
                label: l.adminOrderConfirm,
                onPressed: onConfirm,
                isLoading: busy,
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            AppButton(
              label: l.adminOrderUpdate,
              variant: AppButtonVariant.secondary,
              onPressed: onUpdate,
              isLoading: busy && order.status != 'pending',
            ),
          ],
        ],
      ),
    );
  }
}

class _OrderSkeleton extends StatelessWidget {
  const _OrderSkeleton();
  @override
  Widget build(BuildContext context) => const AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Skeleton.line(),
        SizedBox(height: AppSpacing.sm),
        Skeleton.line(),
        SizedBox(height: AppSpacing.sm),
        Skeleton.line(),
        SizedBox(height: AppSpacing.md),
        Skeleton.box(height: AppSpacing.xxxl, width: double.infinity),
      ],
    ),
  );
}

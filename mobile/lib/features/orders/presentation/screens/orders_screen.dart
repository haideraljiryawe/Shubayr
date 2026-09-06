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
import '../../../../core/widgets/state_views.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/order.dart';
import '../providers/order_providers.dart';
import '../widgets/order_status_pill.dart';

/// The customer's orders, newest first. Each card opens the order's details and
/// tracking. Pull to refresh re-reads the list.
class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final orders = ref.watch(ordersProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.ordersTitle)),
      body: AsyncValueView(
        value: orders,
        onRetry: () => ref.invalidate(ordersProvider),
        builder: (context, page) {
          if (page.data.isEmpty) {
            return AppEmptyView(
              icon: Icons.receipt_long_outlined,
              title: l10n.ordersEmptyTitle,
              message: l10n.ordersEmptyMessage,
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(ordersProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(AppSpacing.screenH),
              itemCount: page.data.length,
              separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (_, i) => _OrderCard(order: page.data[i]),
            ),
          );
        },
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

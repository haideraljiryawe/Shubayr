import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/layout/app_layout.dart';
import '../../../core/l10n/l10n_context.dart';
import '../../../core/theme/theme_context.dart';
import '../../../core/theme/tokens/app_spacing.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/async_value_view.dart';
import '../../orders/presentation/widgets/order_status_pill.dart';
import '../../settings/presentation/providers/settings_providers.dart';
import 'monitor_orders_screen.dart';
import 'monitor_providers.dart';

class MonitorDetailScreen extends ConsumerWidget {
  const MonitorDetailScreen({super.key, required this.orderId});
  final String orderId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final language = Localizations.localeOf(context).languageCode;
    String money(num value) => formatMoney(
      value,
      currencyCode: ref.watch(brandProvider).currencyCode,
      localeCode: language,
    );
    return Scaffold(
      appBar: AppBar(title: Text(l.orderDetailTitle)),
      body: AsyncValueView(
        value: ref.watch(monitorDetailProvider(orderId)),
        loading: const MonitorListSkeleton(),
        onRetry: () => ref.invalidate(monitorDetailProvider(orderId)),
        builder: (context, item) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(monitorDetailProvider(orderId));
            try {
              await ref.read(monitorDetailProvider(orderId).future);
            } catch (_) {
              // The provider owns the visible retry/error state.
            }
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: AppLayout.pageInsets(context),
            children: [
              ResponsiveFields(
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.order.orderNumber,
                          style: context.text.titleLarge,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        OrderStatusPill(status: item.order.status),
                        const SizedBox(height: AppSpacing.md),
                        if (item.customerName != null) Text(item.customerName!),
                        Text(
                          item.customerPhone,
                          textDirection: TextDirection.ltr,
                        ),
                        if (item.shipping['contact_phone'] != null &&
                            item.shipping['contact_phone'] !=
                                item.customerPhone)
                          Text(
                            item.shipping['contact_phone'] as String,
                            textDirection: TextDirection.ltr,
                          ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          ['city', 'area', 'street', 'details']
                              .map((key) => item.shipping[key])
                              .whereType<String>()
                              .where((s) => s.trim().isNotEmpty)
                              .join('، '),
                        ),
                      ],
                    ),
                  ),
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(l.checkoutCod, style: context.text.titleMedium),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          '${l.cartSubtotal}: ${money(item.order.subtotal)}',
                        ),
                        Text(
                          '${l.checkoutDelivery}: ${money(item.order.deliveryFee)}',
                        ),
                        Text(
                          '${l.checkoutDiscount}: ${money(item.order.discount)}',
                        ),
                        const Divider(),
                        Text(
                          '${l.checkoutTotal}: ${money(item.order.total)}',
                          style: context.text.titleMedium,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(l.orderItemsSection, style: context.text.titleMedium),
              const SizedBox(height: AppSpacing.md),
              for (final line in item.order.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          line.snapshotName(language) ?? line.productId,
                          style: context.text.titleSmall,
                        ),
                        Text('${line.quantity} × ${money(line.unitPrice)}'),
                        Text(money(line.lineTotal)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

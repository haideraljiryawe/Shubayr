import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../catalog/data/product.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/order.dart';
import '../../data/order_tracking.dart';
import '../order_status.dart';
import '../providers/order_providers.dart';
import '../widgets/order_status_pill.dart';

/// A single order: header, the status timeline, the items, the amount summary,
/// and — while the order can still be cancelled — a cancel action.
class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  bool _cancelling = false;

  String _money(num amount) {
    final brand = ref.read(brandProvider);
    return formatMoney(
      amount,
      currencyCode: brand.currencyCode,
      localeCode: Localizations.localeOf(context).languageCode,
    );
  }

  Future<void> _cancel() async {
    final l10n = context.l10n;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.orderCancelTitle),
        content: Text(l10n.orderCancelMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.orderKeepOrder),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: context.colors.danger),
            child: Text(l10n.orderCancel),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _cancelling = true);
    try {
      await ref.read(orderRepositoryProvider).cancelOrder(widget.orderId);
      ref
        ..invalidate(orderProvider(widget.orderId))
        ..invalidate(orderTrackingProvider(widget.orderId))
        ..invalidate(ordersProvider);
      if (!mounted) return;
      setState(() => _cancelling = false);
      showAppSnackBarMessage(context, message: l10n.orderCancelledDone);
    } on AppFailure catch (e) {
      if (!mounted) return;
      setState(() => _cancelling = false);
      showAppSnackBarMessage(context, message: e.localizedMessage(l10n));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final order = ref.watch(orderProvider(widget.orderId));

    return Scaffold(
      appBar: AppBar(title: Text(l10n.orderDetailTitle)),
      body: AsyncValueView(
        value: order,
        loading: const Padding(
          padding: EdgeInsets.all(AppSpacing.screenH),
          child: SkeletonCardList(itemCount: 4, height: 120),
        ),
        onRetry: () => ref.invalidate(orderProvider(widget.orderId)),
        builder: (context, o) => ListView(
          padding: const EdgeInsets.all(AppSpacing.screenH),
          children: [
            _Header(order: o),
            const SizedBox(height: AppSpacing.lg),
            _SectionTitle(l10n.orderTrackingTitle),
            _TrackingCard(orderId: widget.orderId),
            const SizedBox(height: AppSpacing.lg),
            _SectionTitle(l10n.orderItemsSection),
            AppCard(
              child: Column(
                children: [
                  for (var i = 0; i < o.items.length; i++) ...[
                    if (i > 0) const Divider(height: AppSpacing.xl),
                    _OrderItemTile(item: o.items[i], money: _money),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            _SectionTitle(l10n.orderSummary),
            _Summary(order: o, money: _money),
            if (o.status == 'delivered' && o.items.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: l10n.reviewOrderTitle,
                icon: Icons.star_outline,
                variant: AppButtonVariant.secondary,
                onPressed: () => context.pushNamed(
                  AppRoutes.orderReviewName,
                  pathParameters: {'id': o.id},
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: l10n.returnOrderTitle,
                icon: Icons.assignment_return_outlined,
                variant: AppButtonVariant.secondary,
                onPressed: () => context.pushNamed(
                  AppRoutes.orderReturnName,
                  pathParameters: {'id': o.id},
                ),
              ),
            ],
            if (isOrderCancellable(o.status)) ...[
              const SizedBox(height: AppSpacing.lg),
              Center(
                child: TextButton.icon(
                  onPressed: _cancelling ? null : _cancel,
                  style: TextButton.styleFrom(
                    foregroundColor: context.colors.danger,
                  ),
                  icon: _cancelling
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.cancel_outlined),
                  label: Text(l10n.orderCancel),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final placedAt = order.placedAt;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(order.orderNumber, style: context.text.titleMedium),
              ),
              OrderStatusPill(status: order.status),
            ],
          ),
          if (placedAt != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Icon(Icons.event_outlined, size: 16, color: colors.textMuted),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  '${l10n.orderDate}: ${DateFormat('yyyy/MM/dd').format(placedAt)}',
                  style: context.text.bodySmall?.copyWith(
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _TrackingCard extends ConsumerWidget {
  const _TrackingCard({required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tracking = ref.watch(orderTrackingProvider(orderId));
    return AppCard(
      child: tracking.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.sm),
          child: Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ),
        error: (_, _) => Text(
          context.l10n.actionRetry,
          style: TextStyle(color: context.colors.textMuted),
        ),
        data: (t) => Column(
          children: [
            for (var i = 0; i < t.events.length; i++)
              _TimelineRow(
                event: t.events[i],
                isFirst: i == 0,
                isLast: i == t.events.length - 1,
              ),
          ],
        ),
      ),
    );
  }
}

/// One node of the vertical tracking timeline: a coloured dot with a connector
/// line down to the next event, and the status label + timestamp beside it.
class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.event,
    required this.isFirst,
    required this.isLast,
  });

  final OrderEvent event;
  final bool isFirst;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final color = orderStatusColor(colors, event.status);
    final at = event.at;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  orderStatusIcon(event.status),
                  size: 16,
                  color: color,
                ),
              ),
              if (!isLast)
                Expanded(child: Container(width: 2, color: colors.divider)),
            ],
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    orderStatusLabel(context.l10n, event.status),
                    style: context.text.bodyMedium?.copyWith(
                      fontWeight: isLast ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                  if (event.note != null && event.note!.trim().isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      event.note!,
                      style: context.text.bodySmall?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                  if (at != null) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      DateFormat('yyyy/MM/dd — HH:mm').format(at),
                      style: context.text.labelMedium?.copyWith(
                        color: colors.textMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderItemTile extends ConsumerWidget {
  const _OrderItemTile({required this.item, required this.money});

  final OrderItem item;
  final String Function(num) money;

  String? _variantLabel(Product? product) {
    final variantId = item.variantId;
    if (product == null || variantId == null) return null;
    for (final v in product.variants) {
      if (v.id == variantId) {
        return v.attributes.values.isNotEmpty
            ? v.attributes.values.join(' · ')
            : v.sku;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    final product = ref.watch(productProvider(item.productId)).valueOrNull;
    final variantLabel = _variantLabel(product);

    return InkWell(
      onTap: () => context.pushNamed(
        AppRoutes.productName,
        pathParameters: {'id': item.productId},
      ),
      borderRadius: AppRadii.smAll,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Thumb(url: product?.primaryImage),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product?.localizedName(lang) ?? '',
                  style: context.text.titleSmall,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (variantLabel != null) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    variantLabel,
                    style: context.text.labelMedium?.copyWith(
                      color: colors.textMuted,
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  l10n.orderLineQuantity('${item.quantity}'),
                  style: context.text.bodySmall?.copyWith(
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            money(item.lineTotal),
            style: context.text.titleSmall?.copyWith(color: colors.primaryDark),
          ),
        ],
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    Widget fallback() => ColoredBox(
      color: colors.surfaceAlt,
      child: Icon(Icons.image_outlined, color: colors.textMuted, size: 20),
    );
    return ClipRRect(
      borderRadius: AppRadii.smAll,
      child: SizedBox(
        width: 52,
        height: 52,
        child: url == null
            ? fallback()
            : CachedNetworkImage(
                imageUrl: url!,
                fit: BoxFit.cover,
                placeholder: (_, _) => ColoredBox(color: colors.surfaceAlt),
                errorWidget: (_, _, _) => fallback(),
              ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.order, required this.money});

  final Order order;
  final String Function(num) money;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      child: Column(
        children: [
          _SummaryRow(label: l10n.cartSubtotal, value: money(order.subtotal)),
          const SizedBox(height: AppSpacing.sm),
          _SummaryRow(
            label: l10n.checkoutDelivery,
            value: money(order.deliveryFee),
          ),
          if (order.discount > 0) ...[
            const SizedBox(height: AppSpacing.sm),
            _SummaryRow(
              label: l10n.checkoutDiscount,
              value: '- ${money(order.discount)}',
              highlight: true,
            ),
          ],
          const Divider(height: AppSpacing.xl),
          _SummaryRow(
            label: l10n.checkoutTotal,
            value: money(order.total),
            emphasize: true,
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.highlight = false,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool highlight;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final valueColor = highlight
        ? colors.success
        : emphasize
        ? colors.primaryDark
        : colors.textPrimary;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: emphasize ? context.text.titleSmall : context.text.bodyMedium,
        ),
        Text(
          value,
          style:
              (emphasize ? context.text.titleMedium : context.text.bodyMedium)
                  ?.copyWith(color: valueColor, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(
      start: AppSpacing.xs,
      bottom: AppSpacing.sm,
    ),
    child: Text(text, style: context.text.titleSmall),
  );
}

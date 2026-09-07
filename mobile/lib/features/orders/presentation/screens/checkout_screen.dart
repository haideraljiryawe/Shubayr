import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../address/data/address.dart';
import '../../../address/presentation/providers/address_providers.dart';
import '../../../cart/presentation/providers/cart_providers.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/coupon.dart';
import '../../data/order.dart';
import '../providers/order_providers.dart';

/// Cash-on-Delivery checkout: pick a delivery address, optionally apply a
/// coupon, review the summary and place the order. Amounts other than the
/// subtotal (delivery fee, final total) are computed by the server and shown on
/// the confirmation.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _couponCtrl = TextEditingController();
  String? _addressId;
  Coupon? _coupon;
  String? _couponError;
  bool _applyingCoupon = false;
  bool _placing = false;
  Order? _placed;

  @override
  void dispose() {
    _couponCtrl.dispose();
    super.dispose();
  }

  String _money(num amount) {
    final brand = ref.read(brandProvider);
    return formatMoney(
      amount,
      currencyCode: brand.currencyCode,
      localeCode: Localizations.localeOf(context).languageCode,
    );
  }

  Address? _resolveAddress(List<Address> addresses) {
    if (addresses.isEmpty) return null;
    return addresses.firstWhere(
      (a) => a.id == _addressId,
      orElse: () => addresses.firstWhere(
        (a) => a.isDefault,
        orElse: () => addresses.first,
      ),
    );
  }

  Future<void> _applyCoupon() async {
    final code = _couponCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _applyingCoupon = true;
      _couponError = null;
    });
    try {
      final coupon = await ref
          .read(orderRepositoryProvider)
          .validateCoupon(code);
      if (!mounted) return;
      setState(() {
        _coupon = coupon;
        _applyingCoupon = false;
      });
    } on AppFailure {
      if (!mounted) return;
      setState(() {
        _applyingCoupon = false;
        _couponError = context.l10n.checkoutCouponInvalid;
      });
    }
  }

  Future<void> _placeOrder(String addressId) async {
    final l10n = context.l10n;
    setState(() => _placing = true);
    try {
      final order = await ref
          .read(orderRepositoryProvider)
          .placeOrder(addressId: addressId, couponCode: _coupon?.code);
      // The order consumed the cart; refresh so the badge and cart clear, and
      // refresh the orders list so the new order appears there.
      ref.invalidate(cartControllerProvider);
      ref.invalidate(ordersProvider);
      if (!mounted) return;
      setState(() {
        _placed = order;
        _placing = false;
      });
    } on AppFailure catch (e) {
      if (!mounted) return;
      setState(() => _placing = false);
      showAppSnackBarMessage(context, message: e.localizedMessage(l10n));
    }
  }

  Future<void> _pickAddress(List<Address> addresses, String currentId) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (_) =>
          _AddressPickerSheet(addresses: addresses, selectedId: currentId),
    );
    if (picked != null) setState(() => _addressId = picked);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final placed = _placed;
    if (placed != null) {
      return _SuccessView(order: placed, money: _money);
    }

    final cart = ref.watch(cartControllerProvider).valueOrNull;
    final addresses = ref.watch(addressesControllerProvider).valueOrNull;
    final subtotal = cart?.subtotal ?? 0;
    final discount = _coupon?.discountOn(subtotal) ?? 0;
    final estimatedTotal = subtotal - discount;
    final address = addresses == null ? null : _resolveAddress(addresses);
    final canPlace =
        address != null && (cart?.items.isNotEmpty ?? false) && !_placing;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.checkoutTitle)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenH),
        children: [
          _SectionTitle(l10n.checkoutAddress),
          _AddressSection(
            addresses: addresses,
            selected: address,
            onChange: address == null
                ? null
                : () => _pickAddress(addresses!, address.id),
          ),
          const SizedBox(height: AppSpacing.lg),
          _SectionTitle(l10n.checkoutCoupon),
          _CouponSection(
            controller: _couponCtrl,
            applied: _coupon,
            error: _couponError,
            busy: _applyingCoupon,
            onApply: _applyCoupon,
            onRemove: () => setState(() {
              _coupon = null;
              _couponError = null;
              _couponCtrl.clear();
            }),
            money: _money,
          ),
          const SizedBox(height: AppSpacing.lg),
          _SectionTitle(l10n.checkoutPayment),
          AppCard(
            child: Row(
              children: [
                Icon(Icons.payments_outlined, color: context.colors.primary),
                const SizedBox(width: AppSpacing.md),
                Text(l10n.checkoutCod, style: context.text.bodyLarge),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          _Summary(
            subtotal: subtotal,
            discount: discount,
            total: estimatedTotal,
            money: _money,
          ),
        ],
      ),
      bottomNavigationBar: _PlaceOrderBar(
        total: estimatedTotal,
        money: _money,
        enabled: canPlace,
        busy: _placing,
        onPlace: canPlace ? () => _placeOrder(address.id) : null,
      ),
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

class _AddressSection extends StatelessWidget {
  const _AddressSection({
    required this.addresses,
    required this.selected,
    required this.onChange,
  });

  final List<Address>? addresses;
  final Address? selected;
  final VoidCallback? onChange;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (addresses == null) {
      return const AppCard(
        child: Center(
          child: Padding(
            padding: EdgeInsets.all(AppSpacing.sm),
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ),
      );
    }
    if (selected == null) {
      return AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.addressEmptyTitle, style: context.text.bodyMedium),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: l10n.addressAdd,
              icon: Icons.add,
              expand: false,
              onPressed: () => context.pushNamed(AppRoutes.addressesName),
            ),
          ],
        ),
      );
    }
    final line = [
      selected!.city,
      selected!.area,
      selected!.street,
      selected!.details,
    ].where((s) => s != null && s.trim().isNotEmpty).join('، ');
    return AppCard(
      child: Row(
        children: [
          Icon(Icons.location_on_outlined, color: context.colors.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  selected!.label.isNotEmpty ? selected!.label : selected!.city,
                  style: context.text.titleSmall,
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  line,
                  style: context.text.bodySmall?.copyWith(
                    color: context.colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onChange,
            child: Text(l10n.checkoutChangeAddress),
          ),
        ],
      ),
    );
  }
}

class _CouponSection extends StatelessWidget {
  const _CouponSection({
    required this.controller,
    required this.applied,
    required this.error,
    required this.busy,
    required this.onApply,
    required this.onRemove,
    required this.money,
  });

  final TextEditingController controller;
  final Coupon? applied;
  final String? error;
  final bool busy;
  final VoidCallback onApply;
  final VoidCallback onRemove;
  final String Function(num) money;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    if (applied != null) {
      return AppCard(
        child: Row(
          children: [
            Icon(Icons.local_offer_outlined, color: colors.primary),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                applied!.code,
                style: context.text.titleSmall?.copyWith(
                  color: colors.primaryDark,
                ),
              ),
            ),
            IconButton(
              icon: Icon(Icons.close, size: 20, color: colors.textMuted),
              onPressed: onRemove,
              tooltip: l10n.actionDelete,
            ),
          ],
        ),
      );
    }
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => onApply(),
                  decoration: InputDecoration(
                    hintText: l10n.checkoutCouponHint,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              AppButton(
                label: l10n.filterApply,
                variant: AppButtonVariant.secondary,
                expand: false,
                isLoading: busy,
                onPressed: onApply,
              ),
            ],
          ),
          if (error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              error!,
              style: context.text.bodySmall?.copyWith(color: colors.danger),
            ),
          ],
        ],
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({
    required this.subtotal,
    required this.discount,
    required this.total,
    required this.money,
  });

  final num subtotal;
  final num discount;
  final num total;
  final String Function(num) money;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      child: Column(
        children: [
          _SummaryRow(label: l10n.cartSubtotal, value: money(subtotal)),
          if (discount > 0) ...[
            const SizedBox(height: AppSpacing.sm),
            _SummaryRow(
              label: l10n.checkoutDiscount,
              value: '- ${money(discount)}',
              highlight: true,
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          _SummaryRow(
            label: l10n.checkoutDelivery,
            value: l10n.checkoutDeliveryNote,
            muted: true,
          ),
          const Divider(height: AppSpacing.xl),
          _SummaryRow(
            label: l10n.checkoutTotal,
            value: money(total),
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
    this.muted = false,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool highlight;
  final bool muted;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final valueColor = highlight
        ? colors.success
        : muted
        ? colors.textMuted
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

class _PlaceOrderBar extends StatelessWidget {
  const _PlaceOrderBar({
    required this.total,
    required this.money,
    required this.enabled,
    required this.busy,
    required this.onPlace,
  });

  final num total;
  final String Function(num) money;
  final bool enabled;
  final bool busy;
  final VoidCallback? onPlace;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.divider)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenH),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Text(l10n.checkoutTotal, style: context.text.titleSmall),
                  const Spacer(),
                  Text(
                    money(total),
                    style: context.text.titleLarge?.copyWith(
                      color: colors.primaryDark,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: l10n.checkoutPlaceOrder,
                isLoading: busy,
                onPressed: enabled ? onPlace : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddressPickerSheet extends StatelessWidget {
  const _AddressPickerSheet({
    required this.addresses,
    required this.selectedId,
  });

  final List<Address> addresses;
  final String selectedId;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        children: [
          for (final a in addresses)
            ListTile(
              onTap: () => Navigator.pop(context, a.id),
              leading: Icon(
                a.id == selectedId
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                color: a.id == selectedId
                    ? context.colors.primary
                    : context.colors.textMuted,
              ),
              title: Text(a.label.isNotEmpty ? a.label : a.city),
              subtitle: Text(
                [
                  a.city,
                  a.area,
                  a.street,
                ].where((s) => s.trim().isNotEmpty).join('، '),
              ),
            ),
        ],
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.order, required this.money});

  final Order order;
  final String Function(num) money;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            children: [
              const Spacer(),
              Container(
                padding: const EdgeInsets.all(AppSpacing.lg),
                decoration: BoxDecoration(
                  color: colors.success.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.check_circle_outline,
                  size: 48,
                  color: colors.success,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                l10n.checkoutSuccessTitle,
                style: context.text.headlineSmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.checkoutSuccessMessage,
                style: context.text.bodyMedium?.copyWith(
                  color: colors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xl),
              AppCard(
                child: Column(
                  children: [
                    _SummaryRow(
                      label: l10n.checkoutOrderNumber,
                      value: order.orderNumber,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    _SummaryRow(
                      label: l10n.checkoutTotal,
                      value: money(order.total),
                      emphasize: true,
                    ),
                  ],
                ),
              ),
              const Spacer(),
              AppButton(
                label: l10n.checkoutViewOrders,
                onPressed: () => context.go(AppRoutes.orders),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: l10n.checkoutBackHome,
                variant: AppButtonVariant.secondary,
                onPressed: () => context.go(AppRoutes.home),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

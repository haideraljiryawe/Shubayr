import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/error/response_decode.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../address/data/address.dart';
import '../../../address/presentation/providers/address_providers.dart';
import '../../../cart/presentation/providers/cart_providers.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../../cart/data/cart.dart';
import '../../data/order.dart';
import '../providers/order_providers.dart';
import '../providers/order_action_providers.dart';

/// Cash-on-Delivery checkout: pick a delivery address, optionally apply a
/// coupon, review the server cart summary and place the order. Checkout
/// reprices on the server again; confirmation uses the returned order snapshot.
class CheckoutScreen extends ConsumerWidget {
  const CheckoutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      _CheckoutForm(key: ValueKey(ref.watch(ordersIdentityProvider)));
}

class _CheckoutForm extends ConsumerStatefulWidget {
  const _CheckoutForm({super.key});
  @override
  ConsumerState<_CheckoutForm> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<_CheckoutForm> {
  final _couponCtrl = TextEditingController();
  String? _addressId;
  String? _couponError;
  bool _applyingCoupon = false;
  bool get _placing => ref.read(checkoutControllerProvider);
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
      currencyCode:
          _placed?.currency ??
          ref.read(cartControllerProvider).value?.currency ??
          brand.currencyCode,
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
    if (_applyingCoupon || _placing) return;
    final code = _couponCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _applyingCoupon = true;
      _couponError = null;
    });
    await _changeCoupon(remove: false, code: code);
  }

  Future<void> _changeCoupon({required bool remove, String? code}) async {
    if (remove) {
      if (_applyingCoupon || _placing) return;
      setState(() {
        _applyingCoupon = true;
        _couponError = null;
      });
    }
    final identity = ref.read(ordersIdentityProvider);
    final controller = ref.read(cartControllerProvider.notifier);
    try {
      final result = await (remove
          ? controller.removeCoupon()
          : controller.applyCoupon(code!));
      if (!mounted || ref.read(ordersIdentityProvider) != identity) return;
      setState(() {
        if (result.status == CartMutationStatus.succeeded ||
            result.status == CartMutationStatus.superseded) {
          _couponCtrl.clear();
        } else if (result.status == CartMutationStatus.failed) {
          final error = result.error;
          _couponError =
              !remove && error is AppFailure && error.code == 'COUPON_REJECTED'
              ? context.l10n.checkoutCouponInvalid
              : (error is AppFailure ? error : const AppFailure.unknown())
                    .localizedMessage(context.l10n);
        }
      });
    } catch (error, stack) {
      final failure = actionFailure(error, stack);
      if (mounted && ref.read(ordersIdentityProvider) == identity) {
        setState(() => _couponError = failure.localizedMessage(context.l10n));
      }
    } finally {
      if (mounted) setState(() => _applyingCoupon = false);
    }
  }

  Future<void> _placeOrder(
    String addressId, {
    List<ApiFieldError>? acceptedPriceChanges,
  }) async {
    final identity = ref.read(ordersIdentityProvider);
    final result = await ref
        .read(checkoutControllerProvider.notifier)
        .place(addressId, acceptedPriceChanges: acceptedPriceChanges);
    if (!mounted || ref.read(ordersIdentityProvider) != identity) return;
    if (result.status == OrderActionStatus.succeeded) {
      setState(() => _placed = result.order);
    } else if (result.status == OrderActionStatus.failed &&
        ModalRoute.of(context)?.isCurrent != false) {
      if (result.priceChanges.isNotEmpty) {
        final prices = [
          for (final change in result.priceChanges)
            (
              label: change.sku ?? change.variantId!,
              amounts:
                  '${_money(change.oldPrice!)} → ${_money(change.newPrice!)}',
            ),
        ];
        final accepted = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => Consumer(
            builder: (context, dialogRef, _) {
              dialogRef.listen(ordersIdentityProvider, (_, next) {
                if (next == identity || !dialogContext.mounted) return;
                final route = ModalRoute.of(dialogContext);
                if (route == null || !route.isActive) return;
                if (route.isCurrent) {
                  Navigator.pop(dialogContext);
                } else {
                  Navigator.of(dialogContext).removeRoute(route);
                }
              });
              return AlertDialog(
                title: Text(context.l10n.checkoutPricesChanged),
                content: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(context.l10n.checkoutPricesChangedMessage),
                      for (final price in prices) ...[
                        const SizedBox(height: AppSpacing.md),
                        Text(price.label),
                        Text(price.amounts),
                      ],
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(dialogContext, false),
                    child: Text(context.l10n.actionCancel),
                  ),
                  TextButton(
                    onPressed: () => Navigator.pop(dialogContext, true),
                    child: Text(context.l10n.checkoutAcceptPrices),
                  ),
                ],
              );
            },
          ),
        );
        if (!mounted ||
            ref.read(ordersIdentityProvider) != identity ||
            ModalRoute.of(context)?.isCurrent == false) {
          return;
        }
        if (accepted == true) {
          await _placeOrder(
            addressId,
            acceptedPriceChanges: result.priceChanges,
          );
        }
        return;
      }
      final error = result.error;
      showAppSnackBarMessage(
        context,
        message: error is AppFailure
            ? error.localizedMessage(context.l10n)
            : context.l10n.stateErrorTitle,
      );
    }
  }

  Future<void> _pickAddress(List<Address> addresses, String currentId) async {
    final identity = ref.read(ordersIdentityProvider);
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => Consumer(
        builder: (context, sheetRef, _) {
          sheetRef.listen(ordersIdentityProvider, (_, next) {
            if (next == identity || !sheetContext.mounted) return;
            final route = ModalRoute.of(sheetContext);
            if (route == null || !route.isActive) return;
            // Remove this account's sheet, not a newer route pushed above it.
            if (route.isCurrent) {
              Navigator.pop(sheetContext);
            } else {
              Navigator.of(sheetContext).removeRoute(route);
            }
          });
          return _AddressPickerSheet(
            addresses: addresses,
            selectedId: currentId,
          );
        },
      ),
    );
    if (!mounted || ref.read(ordersIdentityProvider) != identity) return;
    if (picked != null) setState(() => _addressId = picked);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    ref.watch(checkoutControllerProvider);
    final placed = _placed;
    if (placed != null) {
      return _SuccessView(order: placed, money: _money);
    }

    final cartState = ref.watch(cartControllerProvider);
    final cart = cartState.asData?.value;
    final addressState = ref.watch(addressesControllerProvider);
    final addresses = addressState.value;
    final address = addresses == null ? null : _resolveAddress(addresses);
    final canPlace =
        address != null &&
        !addressState.isLoading &&
        !addressState.hasError &&
        (cart?.canCheckout ?? false) &&
        !cartState.isLoading &&
        !cartState.hasError &&
        !_applyingCoupon &&
        !_placing;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.checkoutTitle)),
      body: ListView(
        padding: AppLayout.pageInsets(context),
        children: [
          ResponsiveSections(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _SectionTitle(l10n.checkoutAddress),
                  AsyncValueView<List<Address>>(
                    value: addressState,
                    skipLoadingOnReload: ref
                        .read(addressesControllerProvider.notifier)
                        .isRefreshing,
                    loading: const AppCard(
                      child: Row(
                        children: [
                          Skeleton.box(
                            width: AppSpacing.lg,
                            height: AppSpacing.lg,
                          ),
                          SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Skeleton.line(),
                                SizedBox(height: AppSpacing.xxs),
                                Skeleton.line(),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    onRetry: () => ref
                        .read(addressesControllerProvider.notifier)
                        .refresh(),
                    builder: (context, loaded) => _AddressSection(
                      selected: address,
                      onChange: address == null
                          ? null
                          : () => _pickAddress(loaded, address.id),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _SectionTitle(l10n.checkoutCoupon),
                  _CouponSection(
                    controller: _couponCtrl,
                    applied: cart?.couponCode,
                    error: _couponError,
                    busy: _applyingCoupon,
                    onApply:
                        _applyingCoupon ||
                            _placing ||
                            cartState.isLoading ||
                            cartState.hasError
                        ? null
                        : _applyCoupon,
                    onRemove: _applyingCoupon || _placing
                        ? null
                        : () => _changeCoupon(remove: true),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _SectionTitle(l10n.checkoutPayment),
                  AppCard(
                    child: Row(
                      children: [
                        Icon(
                          Icons.payments_outlined,
                          color: context.colors.primary,
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Text(
                            l10n.checkoutCod,
                            style: context.text.bodyLarge,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              AsyncValueView<Cart>(
                value: cartState,
                loading: const AppCard(
                  child: Column(
                    children: [
                      Skeleton.line(),
                      SizedBox(height: AppSpacing.sm),
                      Skeleton.line(),
                      SizedBox(height: AppSpacing.sm),
                      Skeleton.line(),
                    ],
                  ),
                ),
                onRetry: () => ref.invalidate(cartControllerProvider),
                builder: (context, cart) => _Summary(
                  subtotal: cart.subtotal,
                  discount: cart.discount,
                  deliveryFee: cart.deliveryFee,
                  total: cart.total,
                  money: _money,
                ),
              ),
            ],
          ),
        ],
      ),
      bottomNavigationBar:
          cart == null || cartState.isLoading || cartState.hasError
          ? null
          : ResponsiveContent(
              maxWidth: AppLayout.readingWidth,
              child: _PlaceOrderBar(
                total: cart.total,
                money: _money,
                enabled: canPlace,
                busy: _placing,
                onPlace: canPlace ? () => _placeOrder(address.id) : null,
              ),
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
  const _AddressSection({required this.selected, required this.onChange});

  final Address? selected;
  final VoidCallback? onChange;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
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
  });

  final TextEditingController controller;
  final String? applied;
  final String? error;
  final bool busy;
  final VoidCallback? onApply;
  final VoidCallback? onRemove;

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
                applied!,
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
                  onSubmitted: onApply == null ? null : (_) => onApply!(),
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
    required this.deliveryFee,
    required this.total,
    required this.money,
  });

  final num subtotal;
  final num discount;
  final num deliveryFee;
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
            value: money(deliveryFee),
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
    return ResponsiveValueRow(
      label: Text(
        label,
        style: emphasize ? context.text.titleSmall : context.text.bodyMedium,
      ),
      value: Text(
        value,
        style: (emphasize ? context.text.titleMedium : context.text.bodyMedium)
            ?.copyWith(color: valueColor, fontWeight: FontWeight.w600),
      ),
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
          padding: AppLayout.pageInsets(context),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ResponsiveValueRow(
                label: Text(l10n.checkoutTotal, style: context.text.titleSmall),
                value: Text(
                  money(total),
                  style: context.text.titleLarge?.copyWith(
                    color: colors.primaryDark,
                  ),
                ),
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

class _SuccessView extends ConsumerWidget {
  const _SuccessView({required this.order, required this.money});

  final Order order;
  final String Function(num) money;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                onPressed: () {
                  ref.read(orderStatusFilterProvider.notifier).state =
                      'pending';
                  context.go(AppRoutes.orders);
                },
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

import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/quantity_stepper.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../cart/presentation/providers/cart_providers.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/product.dart';
import '../../data/product_availability.dart';
import '../providers/catalog_providers.dart';
import '../widgets/product_gallery.dart';
import '../widgets/reviews_section.dart';
import '../../../wishlist/presentation/widgets/wishlist_button.dart';

/// Product detail: gallery, price, selectable variants with live availability
/// and description, with a sticky add-to-cart bar, a wishlist heart in the app
/// bar, and product reviews below.
class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final product = ref.watch(productProvider(productId));

    return Scaffold(
      appBar: AppBar(actions: [WishlistButton(productId: productId)]),
      body: AsyncValueView(
        value: product,
        loading: const _DetailSkeleton(),
        onRetry: () => ref.invalidate(productProvider(productId)),
        builder: (context, p) => _Detail(product: p),
      ),
    );
  }
}

/// Loading placeholder mirroring the detail layout: gallery, then name/price
/// and the action area.
class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();

  @override
  Widget build(BuildContext context) => ListView(
    padding: EdgeInsets.zero,
    children: const [
      ResponsiveSections(
        stackedSpacing: 0,
        children: [
          Skeleton(
            width: double.infinity,
            height: 320,
            borderRadius: BorderRadius.zero,
          ),
          Padding(
            padding: EdgeInsets.all(AppSpacing.screenH),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Skeleton.line(width: 220, height: 24),
                SizedBox(height: AppSpacing.md),
                Skeleton.line(width: 120, height: 20),
                SizedBox(height: AppSpacing.lg),
                Skeleton(
                  width: double.infinity,
                  height: 52,
                  borderRadius: AppRadii.lgAll,
                ),
                SizedBox(height: AppSpacing.lg),
                Skeleton.line(width: 140, height: 16),
                SizedBox(height: AppSpacing.sm),
                Skeleton(
                  width: double.infinity,
                  height: 72,
                  borderRadius: AppRadii.lgAll,
                ),
              ],
            ),
          ),
        ],
      ),
    ],
  );
}

/// Stock resolved for what the shopper currently has selected.
typedef _Stock = ({bool inStock, int qty});

class _Detail extends ConsumerStatefulWidget {
  const _Detail({required this.product});

  final Product product;

  @override
  ConsumerState<_Detail> createState() => _DetailState();
}

class _DetailState extends ConsumerState<_Detail> {
  String? _selectedVariantId;
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    final variants = widget.product.variants;
    _selectedVariantId = variants.isNotEmpty ? variants.first.id : null;
  }

  ProductVariant? get _selectedVariant {
    final id = _selectedVariantId;
    if (id == null) return null;
    for (final v in widget.product.variants) {
      if (v.id == id) return v;
    }
    return null;
  }

  /// Stock for the selection, from live availability when loaded, otherwise the
  /// product's own computed values so the badge never blanks out.
  _Stock _resolveStock(ProductAvailability? a, ProductVariant? selected) {
    final product = widget.product;
    if (a == null) return (inStock: product.inStock, qty: product.availableQty);
    if (selected != null) {
      final va = a.forVariant(selected.id);
      if (va != null) return (inStock: va.inStock, qty: va.availableQty);
    }
    return (inStock: a.inStock, qty: a.availableQty);
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final l10n = context.l10n;
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    final brand = ref.watch(brandProvider);
    final availability = ref
        .watch(availabilityProvider(product.id))
        .valueOrNull;

    final selectedVariant = _selectedVariant;
    final price = formatMoney(
      product.salePrice + (selectedVariant?.priceDelta ?? 0),
      currencyCode: brand.currencyCode,
      localeCode: lang,
    );
    final stock = _resolveStock(availability, selectedVariant);

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.only(bottom: AppSpacing.xl),
            children: [
              ResponsiveSections(
                stackedSpacing: 0,
                children: [
                  ProductGallery(images: product.images),
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.screenH),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          product.localizedName(lang),
                          style: context.text.headlineSmall,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Row(
                          children: [
                            if (product.ratingAvg > 0) ...[
                              Icon(
                                Icons.star_rounded,
                                size: 20,
                                color: colors.accent,
                              ),
                              const SizedBox(width: 2),
                              Text(
                                product.ratingAvg.toStringAsFixed(1),
                                style: context.text.labelLarge?.copyWith(
                                  color: colors.textSecondary,
                                ),
                              ),
                              const SizedBox(width: AppSpacing.md),
                            ],
                            if (product.isNegotiable) _NegotiableBadge(),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          price,
                          style: context.text.headlineMedium?.copyWith(
                            color: colors.primaryDark,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        _AvailabilityBadge(
                          inStock: stock.inStock,
                          qty: stock.qty,
                        ),
                        if (product.variants.isNotEmpty) ...[
                          const SizedBox(height: AppSpacing.lg),
                          Text(
                            l10n.productVariants,
                            style: context.text.titleSmall,
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          _VariantSelector(
                            variants: product.variants,
                            selectedId: _selectedVariantId,
                            availability: availability,
                            onSelected: (id) =>
                                setState(() => _selectedVariantId = id),
                          ),
                        ],
                        if (stock.inStock) ...[
                          const SizedBox(height: AppSpacing.lg),
                          Row(
                            children: [
                              Text(
                                l10n.productQuantity,
                                style: context.text.titleSmall,
                              ),
                              const Spacer(),
                              QuantityStepper(
                                quantity: _quantity,
                                onChanged: (q) => setState(() => _quantity = q),
                              ),
                            ],
                          ),
                        ],
                        if (product.description.isNotEmpty) ...[
                          const SizedBox(height: AppSpacing.lg),
                          Text(
                            l10n.productDescription,
                            style: context.text.titleSmall,
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            product.description,
                            style: context.text.bodyMedium?.copyWith(
                              color: colors.textSecondary,
                            ),
                          ),
                        ],
                        const SizedBox(height: AppSpacing.lg),
                        ReviewsSection(
                          productId: product.id,
                          ratingAvg: product.ratingAvg,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        ResponsiveContent(
          maxWidth: AppLayout.readingWidth,
          child: _AddToCartBar(
            productId: product.id,
            variantId: _selectedVariantId,
            quantity: _quantity,
            inStock: stock.inStock,
          ),
        ),
      ],
    );
  }
}

/// In-stock / low-stock / out-of-stock indicator for the current selection.
class _AvailabilityBadge extends StatelessWidget {
  const _AvailabilityBadge({required this.inStock, required this.qty});

  final bool inStock;
  final int qty;

  static const int _lowStockThreshold = 5;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final (Color color, IconData icon, String label) = switch ((inStock, qty)) {
      (false, _) => (
        colors.textMuted,
        Icons.remove_circle_outline,
        l10n.commonOutOfStock,
      ),
      (true, final q) when q <= _lowStockThreshold => (
        colors.warning,
        Icons.timelapse,
        l10n.productLowStock('$q'),
      ),
      _ => (colors.success, Icons.check_circle_outline, l10n.productInStock),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: AppSpacing.xs),
        Text(
          label,
          style: context.text.labelMedium?.copyWith(
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

/// Selectable variant chips; out-of-stock variants are disabled and struck out.
class _VariantSelector extends StatelessWidget {
  const _VariantSelector({
    required this.variants,
    required this.selectedId,
    required this.availability,
    required this.onSelected,
  });

  final List<ProductVariant> variants;
  final String? selectedId;
  final ProductAvailability? availability;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final v in variants)
          Builder(
            builder: (context) {
              final va = availability?.forVariant(v.id);
              final outOfStock = va != null && !va.inStock;
              final label = v.attributes.values.isNotEmpty
                  ? v.attributes.values.join(' · ')
                  : v.sku;
              return ChoiceChip(
                label: Text(
                  label,
                  style: outOfStock
                      ? const TextStyle(decoration: TextDecoration.lineThrough)
                      : null,
                ),
                selected: v.id == selectedId,
                onSelected: outOfStock ? null : (_) => onSelected(v.id),
              );
            },
          ),
      ],
    );
  }
}

class _NegotiableBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.accentSoft,
        borderRadius: AppRadii.pillAll,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: 4,
        ),
        child: Text(
          context.l10n.productNegotiable,
          style: context.text.labelMedium?.copyWith(color: colors.textPrimary),
        ),
      ),
    );
  }
}

class _AddToCartBar extends ConsumerStatefulWidget {
  const _AddToCartBar({
    required this.productId,
    required this.variantId,
    required this.quantity,
    required this.inStock,
  });

  final String productId;
  final String? variantId;
  final int quantity;
  final bool inStock;

  @override
  ConsumerState<_AddToCartBar> createState() => _AddToCartBarState();
}

class _AddToCartBarState extends ConsumerState<_AddToCartBar> {
  bool _busy = false;

  Future<void> _onPressed() async {
    final l10n = context.l10n;
    final router = GoRouter.of(context);

    // The cart is server-side; a guest must sign in first.
    final signedIn =
        ref.read(sessionControllerProvider).valueOrNull?.isSignedIn ?? false;
    if (!signedIn) {
      final returnTo = GoRouterState.of(context).uri.toString();
      showAppSnackBarMessage(
        context,
        message: l10n.cartSignInPrompt,
        actionLabel: l10n.authSignInTitle,
        onAction: () => router.pushNamed(
          AppRoutes.signInName,
          queryParameters: {'returnTo': returnTo},
        ),
      );
      return;
    }

    setState(() => _busy = true);
    await ref
        .read(cartControllerProvider.notifier)
        .add(
          productId: widget.productId,
          variantId: widget.variantId,
          quantity: widget.quantity,
        );
    if (!mounted) return;
    setState(() => _busy = false);

    if (ref.read(cartControllerProvider).hasError) {
      showAppSnackBarMessage(context, message: l10n.stateErrorTitle);
      return;
    }
    // The positive "added" state gets its own dark-green confirmation surface
    // (a design-system token), distinct from the neutral error/prompt snackbars.
    final colors = context.colors;
    showAppSnackBar(
      context,
      SnackBar(
        duration: const Duration(seconds: 3),
        backgroundColor: colors.confirmSurface,
        content: Text(
          l10n.cartAdded,
          style: context.text.bodyMedium?.copyWith(
            color: colors.onConfirmSurface,
          ),
        ),
        action: SnackBarAction(
          label: l10n.cartViewCart,
          textColor: colors.primaryLight,
          onPressed: () => router.go(AppRoutes.cart),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenH),
        child: AppButton(
          label: widget.inStock ? l10n.productAddToCart : l10n.commonOutOfStock,
          icon: widget.inStock ? Icons.add_shopping_cart_outlined : null,
          isLoading: _busy,
          onPressed: widget.inStock ? _onPressed : null,
        ),
      ),
    );
  }
}

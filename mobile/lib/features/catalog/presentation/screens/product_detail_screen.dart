import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/product.dart';
import '../providers/catalog_providers.dart';

/// Product detail: gallery, price, options and description, with a sticky
/// add-to-cart bar. Reviews and live availability arrive in a later phase.
class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final product = ref.watch(productProvider(productId));

    return Scaffold(
      appBar: AppBar(),
      body: AsyncValueView(
        value: product,
        onRetry: () => ref.invalidate(productProvider(productId)),
        builder: (context, p) => _Detail(product: p),
      ),
    );
  }
}

class _Detail extends ConsumerWidget {
  const _Detail({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    final brand = ref.watch(brandProvider);
    final price = formatMoney(
      product.salePrice,
      currencyCode: brand.currencyCode,
      localeCode: lang,
    );

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.only(bottom: AppSpacing.xl),
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: _Gallery(image: product.primaryImage),
              ),
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
                    if (product.variants.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.lg),
                      _Variants(product: product),
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
                  ],
                ),
              ),
            ],
          ),
        ),
        _AddToCartBar(product: product),
      ],
    );
  }
}

class _Gallery extends StatelessWidget {
  const _Gallery({required this.image});

  final String? image;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    Widget placeholder() => ColoredBox(
      color: colors.surfaceAlt,
      child: Icon(Icons.image_outlined, color: colors.textMuted, size: 48),
    );
    if (image == null) return placeholder();
    return CachedNetworkImage(
      imageUrl: image!,
      fit: BoxFit.cover,
      errorWidget: (context, _, _) => placeholder(),
      placeholder: (context, _) => ColoredBox(color: colors.surfaceAlt),
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
          style: context.text.labelMedium?.copyWith(color: colors.onAccent),
        ),
      ),
    );
  }
}

/// Read-only variant chips for now; selection is wired with the cart phase.
class _Variants extends StatelessWidget {
  const _Variants({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: AppSpacing.sm,
    runSpacing: AppSpacing.sm,
    children: [
      for (final v in product.variants)
        Chip(
          label: Text(
            v.attributes.values.isNotEmpty
                ? v.attributes.values.join(' · ')
                : v.sku,
          ),
        ),
    ],
  );
}

class _AddToCartBar extends StatelessWidget {
  const _AddToCartBar({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenH),
        child: AppButton(
          label: product.inStock ? l10n.productAddToCart : l10n.commonOutOfStock,
          icon: product.inStock ? Icons.add_shopping_cart_outlined : null,
          // Cart wiring lands in the cart phase; keep the CTA honest until then.
          onPressed: product.inStock
              ? () => ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(l10n.comingSoonTitle)),
                )
              : null,
        ),
      ),
    );
  }
}

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/product.dart';
import 'product_promotion.dart';

/// Measure two lines with the active font and accessibility text scaling.
double _productNameHeight(BuildContext context) {
  final painter = TextPainter(
    text: TextSpan(text: '\n', style: context.text.titleSmall),
    textDirection: Directionality.of(context),
    textScaler: MediaQuery.textScalerOf(context),
    locale: Localizations.localeOf(context),
    maxLines: 2,
  )..layout();
  final height = painter.height;
  painter.dispose();
  return height;
}

/// A product tile for grids and lists: image, localized name, price, rating,
/// and an out-of-stock badge. Visuals come from the theme tokens.
class ProductCard extends ConsumerWidget {
  const ProductCard({super.key, required this.product, this.onTap});

  final Product product;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final brand = ref.watch(brandProvider);
    final lang = Localizations.localeOf(context).languageCode;
    final price = formatMoney(
      product.salePrice,
      currencyCode: brand.currencyCode,
      localeCode: lang,
    );

    return Material(
      color: colors.surface,
      borderRadius: AppRadii.lgAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: AppRadii.lgAll,
            border: Border.all(color: colors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: _Thumb(product: product, dimmed: !product.inStock),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: _productNameHeight(context),
                        child: Text(
                          product.localizedName(lang),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleSmall,
                        ),
                      ),
                      const Spacer(),
                      const SizedBox(height: AppSpacing.xs),
                      if (product.isOnSale) ...[
                        ProductPromotion(product: product),
                        const SizedBox(height: AppSpacing.xs),
                      ],
                      if (product.ratingAvg > 0) ...[
                        _Rating(value: product.ratingAvg),
                        const SizedBox(height: AppSpacing.xs),
                      ],
                      Text(
                        price,
                        style: context.text.titleMedium?.copyWith(
                          color: colors.primaryDark,
                        ),
                      ),
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

/// Mirrors the square image and compact details while product data loads.
class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    double lineHeight(TextStyle style) =>
        MediaQuery.textScalerOf(context).scale(style.fontSize!) *
        (style.height ?? 1);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AspectRatio(
          aspectRatio: 1,
          child: Skeleton(borderRadius: AppRadii.lgAll),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Skeleton.line(height: _productNameHeight(context)),
              const SizedBox(height: AppSpacing.xs),
              Skeleton.line(height: lineHeight(context.text.labelMedium!)),
              const SizedBox(height: AppSpacing.xs),
              Skeleton.line(height: lineHeight(context.text.titleMedium!)),
            ],
          ),
        ),
      ],
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.product, required this.dimmed});

  final Product product;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final url = product.primaryImage;

    Widget placeholder() => ColoredBox(
      color: colors.surfaceAlt,
      child: Icon(Icons.image_outlined, color: colors.textMuted, size: 32),
    );

    final image = url == null
        ? placeholder()
        : CachedNetworkImage(
            imageUrl: url,
            fit: BoxFit.cover,
            errorWidget: (context, _, _) => placeholder(),
            placeholder: (context, _) => ColoredBox(color: colors.surfaceAlt),
          );

    return Stack(
      fit: StackFit.expand,
      children: [
        if (dimmed)
          ColorFiltered(
            colorFilter: ColorFilter.mode(
              colors.surface.withValues(alpha: 0.45),
              BlendMode.lighten,
            ),
            child: image,
          )
        else
          image,
        if (!product.inStock)
          PositionedDirectional(
            top: AppSpacing.sm,
            start: AppSpacing.sm,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colors.danger,
                borderRadius: AppRadii.pillAll,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: 2,
                ),
                child: Text(
                  context.l10n.commonOutOfStock,
                  style: context.text.labelSmall?.copyWith(
                    color: colors.onDark,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Rating extends StatelessWidget {
  const _Rating({required this.value});

  final num value;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.star_rounded, size: 16, color: colors.accent),
        const SizedBox(width: 2),
        Text(
          value.toStringAsFixed(1),
          style: context.text.labelMedium?.copyWith(
            color: colors.textSecondary,
          ),
        ),
      ],
    );
  }
}

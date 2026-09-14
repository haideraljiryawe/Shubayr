import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/product.dart';

/// Product-level promotion metadata. No variant-specific original price exists
/// in the contract, so a nonzero variant delta needs an explicit base-price label.
class ProductPromotion extends ConsumerWidget {
  const ProductPromotion({
    super.key,
    required this.product,
    this.showBasePrice = false,
  });

  final Product product;
  final bool showBasePrice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!product.isOnSale) return const SizedBox.shrink();
    final brand = ref.watch(brandProvider);
    String money(num value) => formatMoney(
      value,
      currencyCode: brand.currencyCode,
      localeCode: Localizations.localeOf(context).languageCode,
    );
    final original = money(product.compareAtPrice!);
    final percent = product.discountPercent;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showBasePrice)
          Text(
            context.l10n.promotionBasePrice,
            style: context.text.bodySmall?.copyWith(
              color: context.colors.textSecondary,
            ),
          ),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xxs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              original,
              semanticsLabel: context.l10n.promotionOriginalPrice(original),
              style: context.text.bodySmall?.copyWith(
                color: context.colors.textSecondary,
                decoration: TextDecoration.lineThrough,
              ),
            ),
            if (showBasePrice)
              Text(
                money(product.salePrice),
                style: context.text.bodySmall?.copyWith(
                  color: context.colors.primaryDark,
                ),
              ),
            if (percent != null && percent > 0 && percent <= 100)
              Text(
                context.l10n.promotionDiscount('$percent'),
                style: context.text.labelSmall?.copyWith(
                  color: context.colors.primaryDark,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

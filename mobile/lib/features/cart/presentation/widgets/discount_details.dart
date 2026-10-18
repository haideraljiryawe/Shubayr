import 'package:flutter/material.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/utils/quantity.dart';
import '../../data/cart.dart';

class DiscountDetails extends StatelessWidget {
  const DiscountDetails({super.key, required this.cart});
  final Cart cart;
  @override
  Widget build(BuildContext context) {
    if (cart.currency == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    String money(num n) => formatMoney(
      n,
      currencyCode: cart.currency!,
      localeCode: Localizations.localeOf(context).languageCode,
    );
    final next = cart.nextTier;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if ((cart.couponDiscount ?? 0) > 0)
          Text('${l10n.pricingCouponDiscount}: ${money(cart.couponDiscount!)}'),
        if ((cart.tierDiscount ?? 0) > 0)
          Text('${l10n.pricingTierDiscount}: ${money(cart.tierDiscount!)}'),
        if (next != null && next.amountRemaining != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            l10n.pricingNextTier(
              money(next.amountRemaining!),
              formatQuantity(next.percent),
            ),
          ),
        ],
      ],
    );
  }
}

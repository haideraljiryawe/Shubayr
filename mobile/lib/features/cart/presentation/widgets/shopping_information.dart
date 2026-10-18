import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/utils/quantity.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../address/presentation/providers/governorate_provider.dart';
import '../../data/discount_tier_repository.dart';

final discountTierSettingsProvider =
    FutureProvider.autoDispose<DiscountTierSettings>(
      (ref) => DiscountTierRepository(ref.watch(apiClientProvider)).fetch(),
    );

/// Public reference information is loaded on demand. It never overrides a
/// signed-in cart quote or computes a second checkout total.
class ShoppingInformation extends ConsumerStatefulWidget {
  const ShoppingInformation({super.key});
  @override
  ConsumerState<ShoppingInformation> createState() =>
      _ShoppingInformationState();
}

class _ShoppingInformationState extends ConsumerState<ShoppingInformation> {
  bool _expanded = false;
  String? _governorate;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final language = Localizations.localeOf(context).languageCode;
    return ExpansionTile(
      title: Text(l10n.shoppingInformation),
      onExpansionChanged: (value) => setState(() => _expanded = value),
      children: !_expanded
          ? const []
          : [
              AsyncValueView(
                value: ref.watch(governoratesProvider),
                loading: const Skeleton.line(),
                onRetry: () => ref.invalidate(governoratesProvider),
                builder: (context, rows) {
                  final selected = rows
                      .where((g) => g.id == _governorate)
                      .firstOrNull;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: selected?.id,
                        isExpanded: true,
                        decoration: InputDecoration(
                          labelText: l10n.pricingDeliveryGovernorate,
                        ),
                        items: [
                          for (final g in rows)
                            DropdownMenuItem(
                              value: g.id,
                              child: Text(
                                language == 'ar' ? g.nameAr : g.nameEn,
                              ),
                            ),
                        ],
                        onChanged: (value) =>
                            setState(() => _governorate = value),
                      ),
                      Text(
                        selected == null
                            ? l10n.pricingSelectGovernorate
                            : !selected.isServed
                            ? l10n.pricingUnserved
                            : selected.deliveryFee != null &&
                                  selected.currency != null
                            ? '${l10n.checkoutDelivery}: ${formatMoney(selected.deliveryFee!, currencyCode: selected.currency!, localeCode: language)}'
                            : l10n.pricingDeliveryUnknown,
                      ),
                    ],
                  );
                },
              ),
              AsyncValueView(
                value: ref.watch(discountTierSettingsProvider),
                loading: const Skeleton.line(),
                onRetry: () => ref.invalidate(discountTierSettingsProvider),
                builder: (context, settings) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final tier in settings.tiers)
                      Text(
                        l10n.pricingTierThreshold(
                          formatMoney(
                            tier.minSubtotal,
                            currencyCode: settings.currency,
                            localeCode: language,
                          ),
                          formatQuantity(tier.percent),
                        ),
                      ),
                    if (settings.tiers.isNotEmpty)
                      Text(
                        settings.couponStackingEnabled
                            ? l10n.pricingStacking
                            : l10n.pricingBestDiscount,
                      ),
                  ],
                ),
              ),
            ],
    );
  }
}

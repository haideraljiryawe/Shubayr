import 'package:flutter/material.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/utils/display_date.dart';
import '../../../../core/utils/quantity.dart';
import '../../../../core/widgets/app_card.dart';
import '../../data/order.dart';

/// Read-only historical values. Never reconstruct a payment or order total.
class OrderServerDetails extends StatelessWidget {
  const OrderServerDetails({super.key, required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final language = Localizations.localeOf(context).languageCode;
    final prices = order.priceChangeInfo;
    final proposal = order.attentionDetails?.reductionProposal;
    final collection = order.collection;
    final shortLines = order.attentionDetails?.shortLines ?? const [];
    String label(OrderItem? item) =>
        item?.snapshotName(language) ?? l10n.orderItemsSection;
    String money(num amount, String currency) =>
        formatMoney(amount, currencyCode: currency, localeCode: language);
    Widget card(List<Widget> children) => Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: children,
        ),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (prices != null)
          card([
            Text(l10n.orderAcceptedPrices),
            Text(DisplayDate.localDateTime(prices.acceptedAt)),
            for (final line in prices.lines) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                label(
                  order.items
                      .where((item) => item.variantId == line.variantId)
                      .firstOrNull,
                ),
              ),
              // Missing currency is unknown, not permission to invent a denomination.
              if (order.currency != null)
                Text(money(line.unitPrice, order.currency!)),
            ],
          ]),
        if (shortLines.isNotEmpty)
          card([
            Text(l10n.orderStockAttention),
            for (final line in shortLines) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                label(
                  order.items
                      .where((item) => item.id == line.orderItemId)
                      .firstOrNull,
                ),
              ),
              Text(
                l10n.orderShortageQuantities(
                  formatQuantity(line.requested),
                  formatQuantity(line.allocated),
                  formatQuantity(line.short),
                ),
              ),
            ],
          ]),
        if (proposal != null &&
            (proposal.status == 'accepted' || proposal.status == 'denied'))
          card([
            Text(
              proposal.status == 'accepted'
                  ? l10n.orderReductionAccepted
                  : l10n.orderReductionDenied,
            ),
            Text(
              label(
                order.items
                    .where((item) => item.id == proposal.orderItemId)
                    .firstOrNull,
              ),
            ),
            Text(
              l10n.orderReductionQuantities(
                formatQuantity(proposal.oldQuantity),
                formatQuantity(proposal.newQuantity),
              ),
            ),
            Text(proposal.reason),
          ]),
        if (collection != null)
          card([
            if (collection.confirmationState != 'confirmed' ||
                collection.result == 'unconfirmed')
              Text(l10n.orderCollectionUnconfirmed)
            else ...[
              if (collection.amountCollected != null) ...[
                Text(l10n.orderPaidOnDelivery),
                Text(money(collection.amountCollected!, collection.currency)),
              ],
              if (collection.shortfall != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(l10n.orderStillOwed),
                Text(money(collection.shortfall!, collection.currency)),
              ],
            ],
          ]),
      ],
    );
  }
}

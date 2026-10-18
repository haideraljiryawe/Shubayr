import 'package:flutter/material.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../data/delivery_detail.dart';

/// A recorded store collection, not a fresh demand for cash from the customer.
class DeliveryCollectionSummary extends StatelessWidget {
  const DeliveryCollectionSummary({
    super.key,
    required this.collection,
    this.compact = false,
  });
  final DeliveryCollection? collection;
  final bool compact;
  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = collection;
    if (c == null) return Text(l.deliveryCollectionUnknown);
    final confirmed =
        c.status == 'confirmed_full' || c.status == 'confirmed_short';
    String money(num n) => formatMoney(
      n,
      currencyCode: c.currency,
      localeCode: Localizations.localeOf(context).languageCode,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(switch (c.status) {
          'confirmed_full' => l.deliveryCollectionFull,
          'confirmed_short' => l.deliveryCollectionShort,
          'unconfirmed' => l.deliveryCollectionUnconfirmed,
          _ => l.deliveryCollectionUnknown,
        }),
        if (confirmed && c.collectedAmount != null)
          Text('${l.deliveryRecordedCollection}: ${money(c.collectedAmount!)}'),
        if (confirmed && c.shortfallAmount != null)
          Text('${l.deliveryRecordedShortfall}: ${money(c.shortfallAmount!)}'),
        if (!compact) Text(l.deliveryCollectionRecordNote),
      ],
    );
  }
}

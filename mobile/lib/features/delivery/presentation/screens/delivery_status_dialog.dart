import 'package:flutter/material.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/utils/numeric_input_formatters.dart';
import '../../../../core/utils/numeric_text.dart';
import '../../../../core/widgets/app_text_selection_toolbar.dart';
import '../../data/delivery.dart';
import '../../domain/delivery_collection_input.dart';
import '../delivery_status.dart';

typedef DeliveryStatusChoice = ({
  String status,
  String? reason,
  DeliveryCollectionInput? collection,
});

class DeliveryStatusDialog extends StatefulWidget {
  const DeliveryStatusDialog({super.key, required this.delivery, this.pending});
  final Delivery delivery;
  final DeliveryCollectionInput? pending;
  @override
  State<DeliveryStatusDialog> createState() => _DeliveryStatusDialogState();
}

class _DeliveryStatusDialogState extends State<DeliveryStatusDialog> {
  late final _amount = TextEditingController(
    text: widget.pending?.amount == null
        ? MoneyText.fromNumber(widget.delivery.amountDue)
        : MoneyText.format(widget.pending!.amount!),
  );
  late String? _status = widget.pending == null ? null : 'delivered';
  late bool? _confirmed = widget.pending == null
      ? null
      : widget.pending!.amount != null;
  String _reason = '';

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  DeliveryCollectionInput? get _collection => _confirmed == null
      ? null
      : _confirmed!
      ? DeliveryCollectionInput.confirmed(_amount.text)
      : const DeliveryCollectionInput.unconfirmed();

  bool get _validAmount {
    try {
      _collection?.validate(widget.delivery.amountDue);
      return true;
    } on AppFailure {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final retry = widget.pending != null;
    final valid =
        _status != null &&
        (_status != 'failed' ||
            (_reason.trim().isNotEmpty && _reason.trim().length <= 500)) &&
        (_status != 'delivered' ||
            (_collection != null && (retry || _validAmount)));
    return AlertDialog(
      title: Text(l10n.deliveryUpdateStatus),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${l10n.deliveryAmountDue}: ${formatMoney(widget.delivery.amountDue, currencyCode: 'IQD', localeCode: Localizations.localeOf(context).languageCode)}',
            ),
            const SizedBox(height: AppSpacing.md),
            if (retry) ...[
              Text(l10n.pendingDeliveryRetry),
              const SizedBox(height: AppSpacing.md),
            ],
            DropdownButtonFormField<String>(
              initialValue: _status,
              isExpanded: true,
              decoration: InputDecoration(labelText: l10n.deliverySelectStatus),
              items: [
                for (final status
                    in retry ? ['delivered'] : widget.delivery.nextStatuses)
                  DropdownMenuItem(
                    value: status,
                    child: Text(deliveryStatusLabel(l10n, status)),
                  ),
              ],
              onChanged: retry
                  ? null
                  : (value) => setState(() => _status = value),
            ),
            if (_status == 'failed') ...[
              const SizedBox(height: AppSpacing.md),
              TextField(
                contextMenuBuilder: appTextSelectionToolbar,
                maxLength: 500,
                minLines: 2,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: l10n.deliveryFailureReason,
                ),
                onChanged: (value) => setState(() => _reason = value),
              ),
            ],
            if (_status == 'delivered') ...[
              const SizedBox(height: AppSpacing.md),
              DropdownButtonFormField<bool>(
                initialValue: _confirmed,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: l10n.deliveryCollectionConfirmation,
                ),
                items: [
                  DropdownMenuItem(
                    value: true,
                    child: Text(l10n.deliveryCollectionConfirmed),
                  ),
                  DropdownMenuItem(
                    value: false,
                    child: Text(l10n.deliveryCollectionUnconfirmed),
                  ),
                ],
                onChanged: retry
                    ? null
                    : (value) => setState(() => _confirmed = value),
              ),
              if (_confirmed == false) ...[
                const SizedBox(height: AppSpacing.md),
                Text(l10n.deliveryCollectionUnconfirmedHint),
              ],
              if (_confirmed == true) ...[
                const SizedBox(height: AppSpacing.md),
                TextField(
                  key: const ValueKey('delivery-collected-amount'),
                  controller: _amount,
                  readOnly: retry,
                  contextMenuBuilder: appTextSelectionToolbar,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: const [MoneyInputFormatter()],
                  decoration: InputDecoration(
                    labelText: l10n.deliveryCollectedAmount,
                    suffixText: 'IQD',
                    errorText: !retry && !_validAmount
                        ? l10n.deliveryInvalidAmount
                        : null,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(l10n.actionCancel),
        ),
        TextButton(
          onPressed: valid
              ? () => Navigator.pop(context, (
                  status: _status!,
                  reason: _status == 'failed' ? _reason.trim() : null,
                  collection: _status == 'delivered' ? _collection : null,
                ))
              : null,
          child: Text(retry ? l10n.actionRetry : l10n.actionSave),
        ),
      ],
    );
  }
}

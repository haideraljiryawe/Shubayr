import 'package:flutter/material.dart';

import '../theme/theme_context.dart';
import '../l10n/l10n_context.dart';
import '../utils/numeric_input_formatters.dart';
import '../utils/quantity.dart';
import '../theme/tokens/app_radii.dart';
import '../theme/tokens/app_spacing.dart';

/// A compact − [n] + quantity control. Shared by the cart lines and the product
/// detail, so quantity editing looks and behaves the same everywhere.
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({
    super.key,
    required this.quantity,
    required this.onChanged,
    this.wholeUnitsOnly = true,
    this.max = 99,
    this.baseUnit,
  });

  final num quantity;
  final ValueChanged<num> onChanged;

  /// SKU unit constraint. +/- changes one base unit; direct entry accepts 0.001.
  final bool wholeUnitsOnly;
  final num max;
  final String? baseUnit;
  num get min => wholeUnitsOnly ? 1 : 0.001;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: colors.border),
        borderRadius: AppRadii.controlAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StepButton(
            icon: Icons.remove,
            onTap: quantity > min && max >= min
                ? () => onChanged(
                    (wholeUnitsOnly
                            ? quantity.ceil() - 1
                            : subtractQuantity(quantity, 1))
                        .clamp(min, max),
                  )
                : null,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: InkWell(
              onTap: max < min
                  ? null
                  : () async {
                      final value = await editQuantity(
                        context,
                        quantity: quantity,
                        min: min,
                        max: max,
                        wholeUnitsOnly: wholeUnitsOnly,
                        baseUnit: baseUnit,
                      );
                      if (context.mounted && value != null) onChanged(value);
                    },
              child: Text(
                formatQuantity(quantity),
                style: context.text.labelLarge,
              ),
            ),
          ),
          _StepButton(
            icon: Icons.add,
            onTap: quantity < max && max >= min
                ? () => onChanged(
                    (wholeUnitsOnly
                            ? quantity.floor() + 1
                            : addQuantity(quantity, 1))
                        .clamp(min, max),
                  )
                : null,
          ),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadii.controlAll,
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(
          icon,
          size: 18,
          color: onTap == null ? colors.textDisabled : colors.textPrimary,
        ),
      ),
    );
  }
}

/// Editing is deliberately separate from +/- one base-unit shortcuts so a
/// fractional SKU can select any v9 quantum without hundreds of button taps.
Future<num?> editQuantity(
  BuildContext context, {
  required num quantity,
  required num min,
  required num max,
  bool wholeUnitsOnly = false,
  String? baseUnit,
}) async {
  num? selected;
  final formKey = GlobalKey<FormState>();
  final value = await showDialog<num>(
    context: context,
    builder: (context) {
      final l10n = context.l10n;
      return AlertDialog(
        title: Text(l10n.productQuantity),
        content: Form(
          key: formKey,
          child: TextFormField(
            initialValue: formatQuantity(quantity),
            onSaved: (text) =>
                selected = num.parse(text!.trim().replaceAll('٫', '.')),
            autofocus: true,
            textDirection: TextDirection.ltr,
            keyboardType: TextInputType.numberWithOptions(
              decimal: !wholeUnitsOnly,
            ),
            inputFormatters: const [WesternDigitsInputFormatter()],
            decoration: InputDecoration(
              suffix: baseUnit == null
                  ? null
                  : Padding(
                      padding: const EdgeInsetsDirectional.only(
                        start: AppSpacing.xs,
                      ),
                      child: Text(baseUnit, textDirection: TextDirection.ltr),
                    ),
              errorMaxLines: 3,
              helperText: '${formatQuantity(min)} – ${formatQuantity(max)}',
            ),
            validator: (text) {
              final raw = (text ?? '').trim().replaceAll('٫', '.');
              final number = num.tryParse(raw);
              if (!RegExp(
                    r'^(?:[0-9]+(?:\.[0-9]{0,3})?|\.[0-9]{1,3})$',
                  ).hasMatch(raw) ||
                  number == null ||
                  !isValidQuantity(
                    number,
                    min: min,
                    max: max,
                    wholeUnitsOnly: wholeUnitsOnly,
                  )) {
                return wholeUnitsOnly
                    ? l10n.quantityWholeInvalid
                    : l10n.quantityInvalid;
              }
              return null;
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.actionCancel),
          ),
          TextButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                formKey.currentState!.save();
                Navigator.pop(context, selected);
              }
            },
            child: Text(l10n.actionSave),
          ),
        ],
      );
    },
  );
  return value;
}

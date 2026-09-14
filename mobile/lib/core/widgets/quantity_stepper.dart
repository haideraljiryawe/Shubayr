import 'package:flutter/material.dart';

import '../theme/theme_context.dart';
import '../theme/tokens/app_radii.dart';
import '../theme/tokens/app_spacing.dart';

/// A compact − [n] + quantity control. Shared by the cart lines and the product
/// detail, so quantity editing looks and behaves the same everywhere.
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({
    super.key,
    required this.quantity,
    required this.onChanged,
    this.min = 1,
  });

  final int quantity;
  final ValueChanged<int> onChanged;

  /// Lowest value the minus button reaches (removing entirely is done elsewhere).
  final int min;

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
            onTap: quantity > min ? () => onChanged(quantity - 1) : null,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Text('$quantity', style: context.text.labelLarge),
          ),
          _StepButton(icon: Icons.add, onTap: () => onChanged(quantity + 1)),
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

import 'package:flutter/material.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../order_status.dart';

/// A compact, colour-coded chip for an order's status. Shared by the orders
/// list and the order detail so a status always reads the same way.
class OrderStatusPill extends StatelessWidget {
  const OrderStatusPill({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final color = orderStatusColor(context.colors, status);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.20),
        borderRadius: AppRadii.smAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(orderStatusIcon(status), size: 14, color: color),
          const SizedBox(width: AppSpacing.xs),
          Text(
            orderStatusLabel(context.l10n, status),
            style: context.text.labelMedium?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

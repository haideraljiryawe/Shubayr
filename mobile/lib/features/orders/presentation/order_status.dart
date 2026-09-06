import 'package:flutter/material.dart';

import '../../../core/l10n/generated/app_localizations.dart';
import '../../../core/theme/app_colors.dart';

/// Central presentation for an [OrderStatus] value (the raw string from the
/// API). One place maps each status to its localized label, colour, and icon,
/// and says whether the customer may still cancel it — reused by the orders
/// list, the order detail, and the tracking timeline.

String orderStatusLabel(AppLocalizations l10n, String status) =>
    switch (status) {
      'pending' => l10n.orderStatusPending,
      'confirmed' => l10n.orderStatusConfirmed,
      'processing' => l10n.orderStatusProcessing,
      'out_for_delivery' => l10n.orderStatusOutForDelivery,
      'delivered' => l10n.orderStatusDelivered,
      'failed_delivery' => l10n.orderStatusFailedDelivery,
      'cancelled' => l10n.orderStatusCancelled,
      'return_requested' => l10n.orderStatusReturnRequested,
      'returned' => l10n.orderStatusReturned,
      _ => status,
    };

Color orderStatusColor(AppColors colors, String status) => switch (status) {
  'pending' => colors.warning,
  'confirmed' || 'processing' => colors.info,
  'out_for_delivery' => colors.primary,
  'delivered' => colors.success,
  'failed_delivery' || 'cancelled' => colors.danger,
  'return_requested' || 'returned' => colors.textMuted,
  _ => colors.textMuted,
};

IconData orderStatusIcon(String status) => switch (status) {
  'pending' => Icons.schedule,
  'confirmed' => Icons.check_circle_outline,
  'processing' => Icons.inventory_2_outlined,
  'out_for_delivery' => Icons.local_shipping_outlined,
  'delivered' => Icons.done_all,
  'failed_delivery' => Icons.error_outline,
  'cancelled' => Icons.cancel_outlined,
  'return_requested' => Icons.assignment_return_outlined,
  'returned' => Icons.keyboard_return,
  _ => Icons.circle_outlined,
};

/// The customer can cancel only before the order leaves for delivery.
bool isOrderCancellable(String status) =>
    status == 'pending' || status == 'confirmed' || status == 'processing';

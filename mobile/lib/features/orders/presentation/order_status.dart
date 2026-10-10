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
      'processing' || 'preparing' => l10n.orderStatusProcessing,
      'out_for_delivery' || 'dispatched' => l10n.orderStatusOutForDelivery,
      'ready_for_dispatch' => l10n.orderStatusReadyForDispatch,
      'delivered' => l10n.orderStatusDelivered,
      'failed_delivery' || 'failed' => l10n.orderStatusFailedDelivery,
      'rejected' => l10n.orderStatusRejected,
      'cancelled' => l10n.orderStatusCancelled,
      'return_requested' => l10n.orderStatusReturnRequested,
      'returned' => l10n.orderStatusReturned,
      _ => status,
    };

Color orderStatusColor(AppColors colors, String status) => switch (status) {
  'pending' => colors.warning,
  'confirmed' || 'processing' || 'preparing' => colors.info,
  'out_for_delivery' || 'dispatched' => colors.primary,
  'delivered' => colors.success,
  'failed_delivery' || 'failed' || 'rejected' || 'cancelled' => colors.danger,
  'return_requested' || 'returned' => colors.textMuted,
  _ => colors.textMuted,
};

IconData orderStatusIcon(String status) => switch (status) {
  'pending' => Icons.schedule,
  'confirmed' => Icons.check_circle_outline,
  'processing' || 'preparing' => Icons.inventory_2_outlined,
  'out_for_delivery' || 'dispatched' => Icons.local_shipping_outlined,
  'ready_for_dispatch' => Icons.inventory_2_outlined,
  'delivered' => Icons.done_all,
  'failed_delivery' || 'failed' => Icons.error_outline,
  'rejected' || 'cancelled' => Icons.cancel_outlined,
  'return_requested' => Icons.assignment_return_outlined,
  'returned' => Icons.keyboard_return,
  _ => Icons.circle_outlined,
};

/// The customer can cancel only before the order leaves for delivery.
bool isOrderCancellable(String status, {bool remote = false}) =>
    status == 'pending' ||
    status == 'confirmed' ||
    (!remote && status == 'processing');

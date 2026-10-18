import '../../../core/error/failure.dart';
import 'package:flutter/material.dart';
import '../../../core/l10n/generated/app_localizations.dart';
import '../../../core/theme/app_colors.dart';

String deliveryStatusLabel(AppLocalizations l10n, String status) =>
    switch (status) {
      'assigned' => l10n.deliveryAssigned,
      'out_for_delivery' => l10n.deliveryOutForDelivery,
      'delivered' => l10n.deliveryDelivered,
      'failed' => l10n.deliveryFailed,
      'returned' => l10n.deliveryReturned,
      _ => l10n.deliveryUnknownStatus,
    };
Color deliveryStatusColor(AppColors colors, String status) => switch (status) {
  'assigned' => colors.info,
  'out_for_delivery' => colors.primary,
  'delivered' => colors.success,
  'failed' => colors.danger,
  _ => colors.textMuted,
};

String deliveryErrorLabel(AppLocalizations l10n, AppFailure failure) =>
    switch (failure.code) {
      'PERIOD_CLOSED' => l10n.deliveryPeriodClosed,
      'TRIP_FARE_SHARE_MISMATCH' => l10n.deliveryFareMismatch,
      'STALE_ORDER_STATE' ||
      'IDEMPOTENCY_KEY_REUSED' => failure.localizedMessage(l10n),
      _ =>
        failure.statusCode == 409
            ? l10n.deliveryStatusConflict
            : failure.localizedMessage(l10n),
    };

import '../l10n/generated/app_localizations.dart';

/// The kinds of failure the UI needs to distinguish.
enum FailureKind {
  network,
  timeout,
  unauthorized,
  forbidden,
  notFound,
  validation,
  conflict,
  rateLimited,
  server,
  unknown,
}

/// A transport-agnostic error.
///
/// Repositories (mock and remote alike) throw this, so presentation code never
/// imports Dio and behaves identically on either data source.
class AppFailure implements Exception {
  const AppFailure(
    this.kind, {
    this.statusCode,
    this.serverMessage,
    this.code,
    this.errors = const [],
    this.details = const {},
  });

  const AppFailure.network() : this(FailureKind.network);
  const AppFailure.timeout() : this(FailureKind.timeout);
  const AppFailure.unauthorized() : this(FailureKind.unauthorized);
  const AppFailure.unknown() : this(FailureKind.unknown);

  final FailureKind kind;
  final int? statusCode;
  final String? code;
  final List<ApiFieldError> errors;
  final Map<String, dynamic> details;

  /// `Error.message` from the API, when present. Shown only as a detail line —
  /// primary copy is always localised.
  final String? serverMessage;

  bool hasFieldError(String field) =>
      errors.any((error) => error.field == field);

  /// These definitive stock/cart refusals require a fresh server snapshot,
  /// never an automatic repeat of the rejected mutation.
  bool get requiresCartRefresh => const {
    'CART_EMPTY',
    'CART_QUANTITY_INVALID',
    'CART_PRODUCT_UNAVAILABLE',
    'CART_VARIANT_UNAVAILABLE',
    'CART_SKU_UNAVAILABLE',
    'REQUESTED_QUANTITY_UNAVAILABLE',
    'INSUFFICIENT_STOCK',
    'SKU_WHOLE_UNITS_ONLY',
    'COUPON_INVALID',
  }.contains(code);

  bool get isStockShortage =>
      code == 'INSUFFICIENT_STOCK' || code == 'REQUESTED_QUANTITY_UNAVAILABLE';

  String localizedMessage(AppLocalizations l10n) {
    if (code == 'ACCOUNT_DELETION_BLOCKED') {
      if ([
        'open_orders',
        'pending_returns',
        'unsettled_amounts',
      ].every((key) => details[key] is int && (details[key] as int) >= 0)) {
        return l10n.accountDeletionCounts(
          '${details['open_orders']}',
          '${details['pending_returns']}',
          '${details['unsettled_amounts']}',
        );
      }
      final blockers = <String>{
        for (final error in errors)
          if (error.code == 'OPEN_ORDERS')
            l10n.accountDeletionOpenOrders
          else if (error.code == 'PENDING_RETURNS')
            l10n.accountDeletionPendingReturns
          else if (error.code == 'UNSETTLED_AMOUNTS')
            l10n.accountDeletionUnsettled,
      };
      return blockers.isEmpty
          ? l10n.accountDeletionBlocked
          : blockers.join('\n');
    }
    if (code == 'PRIVACY_POLICY_UNAVAILABLE') {
      return l10n.privacyPolicyUnavailable;
    }
    if (code == 'PRIVACY_POLICY_OPEN_FAILED') {
      return l10n.privacyPolicyOpenFailed;
    }
    return switch (code) {
      'SMS_NOT_CONFIGURED' ||
      'OTP_DELIVERY_UNAVAILABLE' => l10n.otpDeliveryUnavailable,
      'RETURN_WINDOW_EXPIRED' => l10n.returnWindowExpired,
      'RETURN_QUANTITY_EXCEEDS_ELIGIBLE' => l10n.returnQuantityChanged,
      'RETURN_QUANTITY_INVALID' ||
      'RETURN_QUANTITY_PRECISION' => l10n.returnQuantityInvalid,
      'RETURN_ORDER_NOT_DELIVERED' ||
      'RETURN_DELIVERY_NOT_FOUND' => l10n.returnNotDelivered,
      'LOYALTY_POINTS_INSUFFICIENT' => l10n.loyaltyInsufficient,
      'LOYALTY_REDEMPTION_EXCEEDS_GOODS' => l10n.loyaltyExceedsGoods,
      'SUPPORT_UNAVAILABLE' => l10n.supportUnavailable,
      'SUPPORT_OPEN_FAILED' => l10n.supportOpenFailed,
      'IDEMPOTENCY_KEY_REUSED' => l10n.errorCheckoutIdentity,
      'CART_EMPTY' => l10n.errorCartEmpty,
      'ADDRESS_GOVERNORATE_REQUIRED' => l10n.errorAddressGovernorateRequired,
      'DELIVERY_ZONE_NOT_SERVED' => l10n.errorDeliveryZoneNotServed,
      'DELIVERY_LOCATION_SELECTOR_CONFLICT' =>
        l10n.errorDeliveryLocationSelector,
      'CART_QUANTITY_INVALID' => l10n.errorCartQuantity,
      'CART_PRODUCT_UNAVAILABLE' ||
      'CART_VARIANT_UNAVAILABLE' ||
      'CART_SKU_UNAVAILABLE' => l10n.errorCartUnavailable,
      'REQUESTED_QUANTITY_UNAVAILABLE' ||
      'INSUFFICIENT_STOCK' => l10n.errorStockShortage,
      'WORK_ACCOUNT_SHOPPING_FORBIDDEN' => l10n.errorWorkAccountShopping,
      'APP_ROLE_FORBIDDEN' => l10n.errorAppRoleForbidden,
      'AUTH_SURFACE_FORBIDDEN' => l10n.errorAuthSurfaceForbidden,
      'SKU_WHOLE_UNITS_ONLY' => l10n.errorWholeUnits,
      'COUPON_INVALID' => l10n.errorCouponInvalid,
      'PRICE_CHANGED' => l10n.errorPriceChanged,
      'ORDER_ACCESS_FORBIDDEN' => l10n.errorOrderAccess,
      'CANCELLATION_REQUEST_NOT_ALLOWED' ||
      'ORDER_TRANSITION_NOT_ALLOWED' => l10n.errorCancellationNotAllowed,
      'CANCELLATION_REQUEST_ALREADY_PENDING' => l10n.errorCancellationPending,
      'QUANTITY_REDUCTION_NOT_PENDING' => l10n.errorReductionResolved,
      'PAID_COD_CANCELLATION_FORBIDDEN' => l10n.errorPaidCancellation,
      'STALE_ORDER_STATE' => l10n.orderStateConflict,
      'PENDING_REQUEST' => l10n.pendingRequestMessage,
      'INVALID_COLLECTION_AMOUNT' => l10n.deliveryInvalidAmount,
      'INVALID_API_CONFIGURATION' => l10n.startupConfigurationError,
      _ => switch (kind) {
        FailureKind.network => l10n.errorNetwork,
        FailureKind.timeout => l10n.errorTimeout,
        FailureKind.unauthorized => l10n.errorUnauthorized,
        FailureKind.forbidden => l10n.adminNoAccess,
        FailureKind.notFound => l10n.errorNotFound,
        FailureKind.validation => l10n.errorValidation,
        FailureKind.conflict => l10n.errorConflict,
        FailureKind.rateLimited => l10n.errorRateLimited,
        FailureKind.server => l10n.errorServer,
        FailureKind.unknown => l10n.errorUnknown,
      },
    };
  }

  @override
  String toString() =>
      'AppFailure(${kind.name}, status: $statusCode, message: $serverMessage)';
}

/// Structured validation details from the versioned API error envelope.
class ApiFieldError {
  const ApiFieldError({
    this.field,
    this.code,
    required this.message,
    this.variantId,
    this.sku,
    this.oldPrice,
    this.newPrice,
    this.newPriceVersion,
    this.currentStatus,
    this.currentVersion,
    this.requestedQuantity,
    this.availableQuantity,
  });
  final String? variantId, sku, newPriceVersion, currentStatus;
  final num? oldPrice, newPrice;
  final num? requestedQuantity, availableQuantity;
  final int? currentVersion;
  final String? field;
  final String? code;
  final String message;
}

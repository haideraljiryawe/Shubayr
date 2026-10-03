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
  });

  const AppFailure.network() : this(FailureKind.network);
  const AppFailure.timeout() : this(FailureKind.timeout);
  const AppFailure.unauthorized() : this(FailureKind.unauthorized);
  const AppFailure.unknown() : this(FailureKind.unknown);

  final FailureKind kind;
  final int? statusCode;
  final String? code;
  final List<ApiFieldError> errors;

  /// `Error.message` from the API, when present. Shown only as a detail line —
  /// primary copy is always localised.
  final String? serverMessage;

  bool hasFieldError(String field) =>
      errors.any((error) => error.field == field);

  String localizedMessage(AppLocalizations l10n) => switch (kind) {
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
  };

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
  });
  final String? variantId, sku, newPriceVersion, currentStatus;
  final num? oldPrice, newPrice;
  final int? currentVersion;
  final String? field;
  final String? code;
  final String message;
}

import 'package:dio/dio.dart';

import 'failure.dart';
import '../diagnostics/diagnostics.dart';
import 'response_decode.dart';

/// Translates a [DioException] into an [AppFailure].
///
/// The error body shape comes from the `Error` schema in `api/openapi.yaml`
/// (`{ message, errors }`).
AppFailure mapDioException(DioException e) {
  if (e.error is AppFailure) return e.error as AppFailure;
  if (e.error is FormatException || e.error is TypeError) {
    return malformedResponse(e.error!, e.stackTrace);
  }
  switch (e.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.transformTimeout:
      return const AppFailure.timeout();
    case DioExceptionType.connectionError:
      return const AppFailure.network();
    case DioExceptionType.cancel:
    case DioExceptionType.badCertificate:
      return const AppFailure.unknown();
    case DioExceptionType.unknown:
      Diagnostics.report(
        e.error ?? e,
        e.stackTrace,
        boundary: 'transport.unexpected',
      );
      return const AppFailure.unknown();
    case DioExceptionType.badResponse:
      final status = e.response?.statusCode;
      return AppFailure(
        _kindForStatus(status),
        statusCode: status,
        serverMessage: _messageFromBody(e.response?.data),
        code:
            e.response?.data is Map &&
                (e.response!.data as Map)['code'] is String
            ? (e.response!.data as Map)['code'] as String
            : null,
        errors: _fieldsFromBody(e.response?.data),
      );
  }
}

FailureKind _kindForStatus(int? status) => switch (status) {
  401 => FailureKind.unauthorized,
  403 => FailureKind.forbidden,
  404 => FailureKind.notFound,
  409 => FailureKind.conflict,
  400 || 422 => FailureKind.validation,
  429 => FailureKind.rateLimited,
  _ => FailureKind.server,
};

String? _messageFromBody(Object? data) {
  if (data is Map && data['message'] is String) {
    return data['message'] as String;
  }
  return null;
}

List<ApiFieldError> _fieldsFromBody(Object? data) {
  if (data is! Map || data['errors'] is! List) return const [];
  return [
    for (final error in data['errors'] as List)
      if (error is Map && error['message'] is String)
        ApiFieldError(
          field: error['field'] is String ? error['field'] as String : null,
          code: error['code'] is String ? error['code'] as String : null,
          message: error['message'] as String,
          variantId: error['variant_id'] is String
              ? error['variant_id'] as String
              : null,
          sku: error['sku'] is String ? error['sku'] as String : null,
          oldPrice: error['old_price'] is num
              ? error['old_price'] as num
              : null,
          newPrice: error['new_price'] is num
              ? error['new_price'] as num
              : null,
          newPriceVersion: error['new_price_version'] is String
              ? error['new_price_version'] as String
              : null,
          currentStatus: error['current_status'] is String
              ? error['current_status'] as String
              : null,
          currentVersion: error['current_version'] is int
              ? error['current_version'] as int
              : null,
        ),
  ];
}

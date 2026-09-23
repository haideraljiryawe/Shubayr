import 'package:dio/dio.dart';

import 'failure.dart';

/// Translates a [DioException] into an [AppFailure].
///
/// The error body shape comes from the `Error` schema in `api/openapi.yaml`
/// (`{ message, errors }`).
AppFailure mapDioException(DioException e) {
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
    case DioExceptionType.unknown:
      return const AppFailure.unknown();
    case DioExceptionType.badResponse:
      final status = e.response?.statusCode;
      return AppFailure(
        _kindForStatus(status),
        statusCode: status,
        serverMessage: _messageFromBody(e.response?.data),
        code: e.response?.data is Map
            ? (e.response!.data as Map)['code'] as String?
            : null,
        errors: _fieldsFromBody(e.response?.data),
      );
  }
}

FailureKind _kindForStatus(int? status) => switch (status) {
  401 => FailureKind.unauthorized,
  403 => FailureKind.forbidden,
  404 => FailureKind.notFound,
  409 => FailureKind.validation,
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
          field: error['field'] as String?,
          code: error['code'] as String?,
          message: error['message'] as String,
        ),
  ];
}

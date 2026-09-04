import 'package:dio/dio.dart';

/// Attaches the bearer token to every request that needs one.
///
/// `GET /settings`, `/categories`, `/products` and the OTP endpoints are
/// declared `security: []` in the contract, so a missing token is not an error.
///
/// There is deliberately no refresh-on-401 logic: `api/openapi.yaml` defines
/// no refresh endpoint. A 401 propagates as [FailureKind.unauthorized] and the
/// session layer signs the user out.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this.readToken, required this.onUnauthorized});

  final Future<String?> Function() readToken;
  final Future<void> Function() onUnauthorized;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await readToken();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      await onUnauthorized();
    }
    handler.next(err);
  }
}

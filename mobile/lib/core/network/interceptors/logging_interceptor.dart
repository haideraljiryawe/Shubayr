import 'dart:developer' as developer;
import 'package:dio/dio.dart';

/// Trace method/status and a redacted route only. Query values, dynamic path
/// segments, host credentials, headers, bodies and exception text never cross it.
class LoggingInterceptor extends Interceptor {
  LoggingInterceptor({void Function(String)? log}) : _log = log ?? _defaultLog;
  final void Function(String) _log;
  static void _defaultLog(String message) =>
      developer.log(message, name: 'http');
  static const _segments = {
    'auth',
    'request-otp',
    'verify-otp',
    'refresh',
    'logout',
    'me',
    'settings',
    'categories',
    'products',
    'availability',
    'reviews',
    'banners',
    'wishlist',
    'cart',
    'items',
    'coupon',
    'coupons',
    'validate',
    'addresses',
    'orders',
    'track',
    'cancel',
    'returns',
    'deliveries',
    'assigned',
    'monitor',
    'notifications',
    'unread-count',
    'read',
  };
  String _route(RequestOptions options) {
    final uri = Uri.tryParse(options.path);
    if (uri == null) return '/{redacted}';
    return '/${uri.pathSegments.map((s) => _segments.contains(s) ? s : '{id}').join('/')}';
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final method =
        const {
          'GET',
          'POST',
          'PATCH',
          'DELETE',
          'PUT',
          'HEAD',
          'OPTIONS',
        }.contains(options.method)
        ? options.method
        : 'HTTP';
    _log('→ $method ${_route(options)}');
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    _log('← ${response.statusCode} ${_route(response.requestOptions)}');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _log(
      '✕ ${err.response?.statusCode ?? err.type.name} ${_route(err.requestOptions)}',
    );
    handler.next(err);
  }
}

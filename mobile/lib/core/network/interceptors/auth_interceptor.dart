import 'package:dio/dio.dart';

/// App tokens never authorize admin calls. Expired tokens rotate once, with
/// concurrent requests sharing a refresh and retries bounded to one per request.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.readToken,
    required this.onUnauthorized,
    this.refresh,
    this.retry,
    this.sessionRevision,
  });
  final Future<String?> Function() readToken;
  final Future<void> Function() onUnauthorized;
  final Future<bool> Function()? refresh;
  final Future<Response<dynamic>> Function(RequestOptions)? retry;
  final int Function()? sessionRevision;
  Future<bool>? _refreshing;
  int? _refreshingRevision, _rotatedRevision;
  bool _owns(RequestOptions request) =>
      sessionRevision == null ||
      request.extra['sessionRevision'] == sessionRevision!();
  String? _rotatedFrom, _rotatedTo;
  bool _publicAuth(String path) => path.startsWith('/auth/');

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_publicAuth(options.path)) {
      options.extra.putIfAbsent(
        'sessionRevision',
        () => sessionRevision?.call(),
      );
      final token = await readToken();
      if (!_owns(options)) {
        handler.reject(
          DioException(requestOptions: options, type: DioExceptionType.cancel),
        );
        return;
      }
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      } else {
        options.headers.remove('Authorization');
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final request = err.requestOptions;
    if (err.response?.statusCode != 401 ||
        _publicAuth(request.path) ||
        !_owns(request)) {
      handler.next(err);
      return;
    }
    final token = await readToken();
    // Ignore a response from a session that has since signed out.
    if (token == null || !_owns(request)) {
      handler.next(err);
      return;
    }
    final failedToken = request.headers['Authorization'];
    final alreadyRotated =
        _rotatedRevision == sessionRevision?.call() &&
        failedToken == 'Bearer $_rotatedFrom' &&
        token == _rotatedTo;
    if (failedToken != 'Bearer $token' && !alreadyRotated) {
      handler.next(err);
      return;
    }
    if (request.extra['authRetried'] != true &&
        refresh != null &&
        retry != null) {
      try {
        var rotated = alreadyRotated;
        if (!rotated) {
          final revision = sessionRevision?.call();
          if (_refreshingRevision != revision) _refreshing = null;
          _refreshingRevision = revision;
          final pending = _refreshing ??= refresh!();
          try {
            rotated = await pending;
            if (rotated) {
              final nextToken = await readToken();
              if (!_owns(request)) {
                handler.next(err);
                return;
              }
              _rotatedFrom = token;
              _rotatedTo = nextToken;
              _rotatedRevision = revision;
            }
          } finally {
            if (identical(_refreshing, pending)) _refreshing = null;
          }
        }
        if (rotated && await readToken() != null && _owns(request)) {
          request.extra['authRetried'] = true;
          handler.resolve(await retry!(request));
          return;
        }
      } on DioException catch (e) {
        // Connectivity failures must not erase a valid refresh token.
        handler.next(e);
        return;
      }
    }
    if (await readToken() == token && _owns(request)) await onUnauthorized();
    handler.next(err);
  }
}

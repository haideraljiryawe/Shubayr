import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../error/error_mapper.dart';
import '../error/failure.dart';
import '../storage/token_store.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/logging_interceptor.dart';

/// Thin wrapper around Dio.
///
/// Its only job is to talk HTTP and convert transport errors into
/// [AppFailure]s, so repositories stay declarative and the UI never sees Dio.
class ApiClient {
  ApiClient(this.dio);

  final Dio dio;

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _guard(() => dio.get<T>(path, queryParameters: query));

  Future<T> post<T>(String path, {Object? body}) =>
      _guard(() => dio.post<T>(path, data: body));

  Future<T> patch<T>(String path, {Object? body}) =>
      _guard(() => dio.patch<T>(path, data: body));

  Future<T> delete<T>(String path) => _guard(() => dio.delete<T>(path));

  Future<T> _guard<T>(Future<Response<T>> Function() send) async {
    try {
      final response = await send();
      final data = response.data;
      if (data == null) {
        throw const AppFailure(FailureKind.server);
      }
      return data;
    } on DioException catch (e) {
      throw mapDioException(e);
    }
  }
}

/// Raised by the auth interceptor when the API rejects our token.
///
/// It is a plain signal rather than a direct call into the auth feature: the
/// network layer must not depend on a feature, and the session layer listens
/// to this and signs the user out.
class UnauthorizedSignal extends Notifier<int> {
  @override
  int build() => 0;

  void raise() => state = state + 1;
}

final unauthorizedSignalProvider = NotifierProvider<UnauthorizedSignal, int>(
  UnauthorizedSignal.new,
);

final dioProvider = Provider<Dio>((ref) {
  final config = ref.watch(appConfigProvider);
  final tokens = ref.watch(tokenStoreProvider);

  final dio = Dio(
    BaseOptions(
      baseUrl: config.apiBaseUrl,
      connectTimeout: AppConfig.connectTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
      headers: const {'Accept': 'application/json'},
      contentType: Headers.jsonContentType,
    ),
  );

  dio.interceptors.add(
    AuthInterceptor(
      readToken: tokens.readAccessToken,
      onUnauthorized: () async =>
          ref.read(unauthorizedSignalProvider.notifier).raise(),
    ),
  );
  if (kDebugMode) dio.interceptors.add(LoggingInterceptor());

  return dio;
});

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(ref.watch(dioProvider)),
);

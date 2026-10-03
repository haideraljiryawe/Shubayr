import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:shubayr/core/network/interceptors/auth_interceptor.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

class _Tokens extends InMemoryTokenStore {
  final rotationStarted = Completer<void>();
  Completer<void>? rotationGate;
  @override
  Future<void> save({required String accessToken, String? refreshToken}) async {
    if (accessToken == 'A-rotated' && rotationGate != null) {
      rotationStarted.complete();
      await rotationGate!.future;
    }
    await super.save(accessToken: accessToken, refreshToken: refreshToken);
  }
}

void main() {
  test(
    'a new session refresh does not join the previous session pending refresh',
    () async {
      var revision = 1;
      var token = 'A';
      var refreshes = 0;
      var rejectedSessions = 0;
      final firstStarted = Completer<void>();
      final secondStarted = Completer<void>();
      final firstRefresh = Completer<bool>();
      final secondRefresh = Completer<bool>();
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        AuthInterceptor(
          readToken: () async => token,
          sessionRevision: () => revision,
          onUnauthorized: () async {
            rejectedSessions++;
          },
          refresh: () {
            refreshes++;
            if (revision == 1) {
              firstStarted.complete();
              return firstRefresh.future;
            }
            secondStarted.complete();
            return secondRefresh.future;
          },
          retry: dio.fetch<dynamic>,
        ),
      );
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            if (request.headers['Authorization'] == 'Bearer B-rotated') {
              handler.resolve(
                Response(requestOptions: request, data: 'B-data'),
              );
            } else {
              handler.reject(
                DioException(
                  requestOptions: request,
                  response: Response(requestOptions: request, statusCode: 401),
                  type: DioExceptionType.badResponse,
                ),
                true,
              );
            }
          },
        ),
      );
      final first = dio.get<Object>('/me');
      final ignored = expectLater(first, throwsA(isA<DioException>()));
      await firstStarted.future;
      revision++;
      token = 'B';
      final second = dio.get<Object>('/me');
      await secondStarted.future;
      token = 'B-rotated';
      secondRefresh.complete(true);
      expect((await second).data, 'B-data');
      firstRefresh.complete(true);
      await ignored;
      expect(refreshes, 2);
      expect(rejectedSessions, 0);
    },
  );

  test(
    'session change during credential read cannot send an old request as B',
    () async {
      var revision = 1;
      final reading = Completer<void>();
      final read = Completer<String?>();
      var sent = false;
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        AuthInterceptor(
          readToken: () {
            reading.complete();
            return read.future;
          },
          sessionRevision: () => revision,
          onUnauthorized: () async {},
        ),
      );
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            sent = true;
            handler.resolve(Response(requestOptions: request));
          },
        ),
      );
      final request = dio.get<Object>('/me');
      final cancelled = expectLater(
        request,
        throwsA(
          isA<DioException>().having(
            (e) => e.type,
            'type',
            DioExceptionType.cancel,
          ),
        ),
      );
      await reading.future;
      revision++;
      read.complete('B-token');
      await cancelled;
      expect(sent, isFalse);
    },
  );

  for (final boundary in ['response', 'write']) {
    for (final replacement in ['logout', 'B']) {
      test('refresh $boundary cannot commit after $replacement', () async {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final refreshStarted = Completer<void>();
        final responseGate = Completer<void>();
        final tokens = _Tokens();
        if (boundary == 'write') tokens.rotationGate = Completer<void>();
        await tokens.save(accessToken: 'A-access', refreshToken: 'A-refresh');
        final cartRequests = <String?>[];
        server.listen((request) async {
          var status = 200;
          Object body = {};
          switch (request.uri.path) {
            case '/me':
              body = {'id': 'A', 'role': 'customer', 'surface': 'app'};
            case '/cart':
              cartRequests.add(request.headers.value('Authorization'));
              status = 401;
            case '/auth/refresh':
              refreshStarted.complete();
              await responseGate.future;
              body = {
                'access_token': 'A-rotated',
                'refresh_token': 'A-rotated-refresh',
              };
            case '/auth/verify-otp':
              body = {
                'access_token': 'B-access',
                'refresh_token': 'B-refresh',
                'user': {'id': 'B', 'role': 'customer', 'surface': 'app'},
              };
            case '/auth/logout':
              status = 201;
          }
          request.response.statusCode = status;
          request.response.headers.contentType = ContentType.json;
          request.response.write(
            jsonEncode(
              status == 401
                  ? {
                      'status': 401,
                      'code': 'UNAUTHORIZED',
                      'message': 'Test',
                      'errors': [],
                    }
                  : body,
            ),
          );
          await request.response.close();
        });
        final container = ProviderContainer(
          retry: (_, _) => null,
          overrides: [
            tokenStoreProvider.overrideWithValue(tokens),
            appConfigProvider.overrideWithValue(
              AppConfig(
                apiBaseUrl: 'http://127.0.0.1:${server.port}',
                dataSource: DataSource.remote,
              ),
            ),
          ],
        );
        addTearDown(container.dispose);
        container.listen(sessionControllerProvider, (_, _) {});
        await container.read(sessionControllerProvider.future);
        final controller = container.read(sessionControllerProvider.notifier);
        final oldRequest = container
            .read(apiClientProvider)
            .get<Object>('/cart');
        final rejected = expectLater(oldRequest, throwsA(anything));
        await refreshStarted.future;
        if (boundary == 'write') {
          responseGate.complete();
          await tokens.rotationStarted.future;
        }
        final next = replacement == 'logout'
            ? controller.signOut()
            : controller.verifyOtp(phone: '+9647700000000', code: '123456');
        // OTP may wait for the storage lane; release only after it owns the epoch.
        if (boundary == 'response') {
          await next;
          responseGate.complete();
        } else {
          tokens.rotationGate!.complete();
          await next;
        }
        await rejected;
        expect(cartRequests, ['Bearer A-access']);
        expect(
          await tokens.readAccessToken(),
          replacement == 'B' ? 'B-access' : null,
        );
        expect(
          await tokens.readRefreshToken(),
          replacement == 'B' ? 'B-refresh' : null,
        );
        expect(
          container.read(sessionControllerProvider).requireValue.user?.id,
          replacement == 'B' ? 'B' : null,
        );
      });
    }
  }

  test(
    'an old refresh rejection cannot sign out a new session using the same token text',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final refreshStarted = Completer<void>();
      final release = Completer<void>();
      server.listen((request) async {
        var status = 200;
        Object body = {'id': 'A', 'role': 'customer', 'surface': 'app'};
        if (request.uri.path == '/auth/verify-otp') {
          body = {
            'access_token': 'same',
            'refresh_token': 'new-refresh',
            'user': {'id': 'B', 'role': 'customer', 'surface': 'app'},
          };
        } else if (request.uri.path == '/auth/refresh') {
          refreshStarted.complete();
          await release.future;
          status = 401;
        } else if (request.uri.path == '/cart') {
          status = 401;
        }
        request.response.statusCode = status;
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode(
            status == 401
                ? {
                    'status': 401,
                    'code': 'UNAUTHORIZED',
                    'message': 'Test',
                    'errors': [],
                  }
                : body,
          ),
        );
        await request.response.close();
      });
      final tokens = InMemoryTokenStore();
      await tokens.save(accessToken: 'same', refreshToken: 'old-refresh');
      final container = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          tokenStoreProvider.overrideWithValue(tokens),
          appConfigProvider.overrideWithValue(
            AppConfig(
              apiBaseUrl: 'http://127.0.0.1:${server.port}',
              dataSource: DataSource.remote,
            ),
          ),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      final oldRequest = container.read(apiClientProvider).get<Object>('/cart');
      final rejected = expectLater(oldRequest, throwsA(anything));
      await refreshStarted.future;
      await container
          .read(sessionControllerProvider.notifier)
          .verifyOtp(phone: '+9647700000000', code: '123456');
      release.complete();
      await rejected;
      expect(
        container.read(sessionControllerProvider).requireValue.user?.id,
        'B',
      );
      expect(await tokens.readRefreshToken(), 'new-refresh');
    },
  );
}

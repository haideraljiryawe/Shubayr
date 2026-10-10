import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

// Exercise the actual repository, mapper, AuthInterceptor and refresh callback
// against a local test server. No external API or stored real credentials.
void main() {
  for (final scenario in [
    (
      name: 'verified me',
      me: 200,
      refresh: 200,
      retried: 200,
      hasRefresh: true,
      outcome: 'verified',
    ),
    (
      name: 'rotation restores me',
      me: 401,
      refresh: 200,
      retried: 200,
      hasRefresh: true,
      outcome: 'rotated',
    ),
    (
      name: 'missing refresh cannot recover',
      me: 401,
      refresh: 200,
      retried: 200,
      hasRefresh: false,
      outcome: 'rejected',
    ),
    (
      name: 'refresh unauthorized',
      me: 401,
      refresh: 401,
      retried: 200,
      hasRefresh: true,
      outcome: 'rejected',
    ),
    (
      name: 'refresh validation rejects token',
      me: 401,
      refresh: 422,
      retried: 200,
      hasRefresh: true,
      outcome: 'rejected',
    ),
    (
      name: 'retried token rejected',
      me: 401,
      refresh: 200,
      retried: 401,
      hasRefresh: true,
      outcome: 'rejected',
    ),
    (
      name: 'refresh service unavailable',
      me: 401,
      refresh: 503,
      retried: 200,
      hasRefresh: true,
      outcome: 'unverified',
    ),
    (
      name: 'me forbidden is not token rejection',
      me: 403,
      refresh: 200,
      retried: 200,
      hasRefresh: true,
      outcome: 'unverified',
    ),
    (
      name: 'me service unavailable',
      me: 503,
      refresh: 200,
      retried: 200,
      hasRefresh: true,
      outcome: 'unverified',
    ),
  ]) {
    test(scenario.name, () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final requests = <String>[];
      server.listen((request) async {
        final path = request.uri.path;
        requests.add(path);
        var status = 200;
        Object body;
        if (path == '/auth/refresh') {
          final input = jsonDecode(await utf8.decoder.bind(request).join());
          expect(input, {'refresh_token': 'stored-refresh'});
          status = scenario.refresh;
          body = {
            'access_token': 'rotated-access',
            'refresh_token': 'rotated-refresh',
          };
        } else if (path == '/auth/logout') {
          status = 201;
          body = {};
        } else {
          expect(path, '/me');
          status =
              request.headers.value('Authorization') == 'Bearer rotated-access'
              ? scenario.retried
              : scenario.me;
          body = {'id': 'verified', 'role': 'customer', 'surface': 'app'};
        }
        request.response.statusCode = status;
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode(
            status >= 400
                ? {
                    'status': status,
                    'code': switch (status) {
                      401 => 'UNAUTHORIZED',
                      403 => 'FORBIDDEN',
                      422 => 'VALIDATION_FAILED',
                      _ => 'SERVER_ERROR',
                    },
                    'message': 'Test response',
                    'errors': [],
                  }
                : body,
          ),
        );
        await request.response.close();
      });
      final tokens = InMemoryTokenStore();
      await tokens.save(
        accessToken: 'stored-access',
        refreshToken: scenario.hasRefresh ? 'stored-refresh' : null,
      );
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
      Object? failure;
      try {
        await container.read(sessionControllerProvider.future);
      } catch (error) {
        failure = error;
      }
      if (scenario.outcome == 'unverified') {
        expect(await tokens.readAccessToken(), 'stored-access');
        expect(await tokens.readRefreshToken(), 'stored-refresh');
        expect(failure, isA<AppFailure>());
        expect(container.read(sessionControllerProvider).hasError, isTrue);
      } else if (scenario.outcome == 'rejected') {
        expect(await tokens.readAccessToken(), isNull);
        expect(await tokens.readRefreshToken(), isNull);
        expect(
          container.read(sessionControllerProvider).requireValue.isSignedIn,
          isFalse,
        );
      } else {
        expect(
          container.read(sessionControllerProvider).requireValue.user?.id,
          'verified',
        );
        expect(
          await tokens.readAccessToken(),
          scenario.outcome == 'rotated' ? 'rotated-access' : 'stored-access',
        );
        expect(
          await tokens.readRefreshToken(),
          scenario.outcome == 'rotated' ? 'rotated-refresh' : 'stored-refresh',
        );
      }
      expect(
        requests.where((p) => p == '/auth/refresh').length,
        scenario.me == 401 && scenario.hasRefresh ? 1 : 0,
      );
      expect(
        requests.where((p) => p == '/me').length,
        scenario.me == 401 && scenario.hasRefresh && scenario.refresh == 200
            ? 2
            : 1,
      );
      expect(requests.any((p) => p.contains('otp')), isFalse);
    });
  }
}

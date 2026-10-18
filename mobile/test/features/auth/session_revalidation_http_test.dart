import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';
import 'package:shubayr/core/storage/session_credentials.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

// Real Mobile HTTP/refresh/cleanup paths, synthetic local server and credentials.
// This does not claim to verify Backend database deletion or a physical device.
void main() {
  test(
    'deletion on A rejects B resume/refresh/read while another account survives',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      var deleted = false;
      final refreshes = <String>[];
      server.listen((request) async {
        final path = request.uri.path;
        final token = request.headers.value('Authorization') ?? '';
        final other = token.endsWith('other');
        var status = 200;
        Object? body = {
          'id': other ? 'other' : 'target',
          'role': 'customer',
          'surface': 'app',
        };
        if (path == '/auth/refresh') {
          final input = jsonDecode(await utf8.decoder.bind(request).join());
          refreshes.add(input['refresh_token'] as String);
          status = 401;
        } else if (path == '/me/account' && request.method == 'DELETE') {
          deleted = true;
          status = 204;
          body = null;
        } else if (deleted && !other) {
          status = 401;
        }
        request.response.statusCode = status;
        request.response.headers.contentType = ContentType.json;
        if (status != 204) {
          request.response.write(
            jsonEncode(
              status == 401
                  ? {
                      'status': 401,
                      'code': 'UNAUTHORIZED',
                      'message': 'Rejected',
                      'errors': [],
                    }
                  : body,
            ),
          );
        }
        await request.response.close();
      });
      final api = 'http://127.0.0.1:${server.port}';
      Future<
        ({
          ProviderContainer c,
          InMemoryTokenStore tokens,
          PendingRequestStore journals,
        })
      >
      device(String key) async {
        final tokens = InMemoryTokenStore();
        await tokens.save(
          accessToken: 'access-$key',
          refreshToken: 'refresh-$key',
        );
        final journals = PendingRequestStore.memory();
        final c = ProviderContainer(
          overrides: [
            appConfigProvider.overrideWithValue(
              AppConfig(apiBaseUrl: api, dataSource: DataSource.remote),
            ),
            tokenStoreProvider.overrideWithValue(tokens),
            pendingRequestStoreProvider.overrideWithValue(journals),
          ],
        );
        addTearDown(c.dispose);
        await c.read(sessionControllerProvider.future);
        return (c: c, tokens: tokens, journals: journals);
      }

      final a = await device('A'),
          b = await device('B'),
          other = await device('other');
      final slot = PendingRequestStore.slot(api, 'target', 'checkout', 'draft');
      final separateSlot = PendingRequestStore.slot(
        api,
        'other',
        'checkout',
        'draft',
      );
      await b.journals.prepare(slot, {'address_id': 'private'});
      await b.journals.prepare(separateSlot, {'address_id': 'other-private'});
      expect(
        await a.c
            .read(sessionControllerProvider.notifier)
            .deleteAccount(
              userId: 'target',
              revision: a.c.read(sessionCredentialsProvider).revision,
            ),
        isTrue,
      );
      expect(await a.tokens.readAccessToken(), isNull);
      await b.c.read(sessionControllerProvider.notifier).revalidate();
      expect(refreshes, ['refresh-B']);
      expect(
        b.c.read(sessionControllerProvider).requireValue.isSignedIn,
        isFalse,
      );
      expect(await b.tokens.readAccessToken(), isNull);
      expect(await b.tokens.readRefreshToken(), isNull);
      expect(await b.journals.read(slot), isNull);
      expect(await b.journals.read(separateSlot), isNotNull);
      await expectLater(
        b.c.read(apiClientProvider).get<Object>('/me'),
        throwsA(isA<Exception>()),
      );
      expect(refreshes, [
        'refresh-B',
      ]); // No second refresh after local rejection.
      await other.c.read(sessionControllerProvider.notifier).revalidate();
      expect(
        other.c.read(sessionControllerProvider).requireValue.user!.id,
        'other',
      );
      expect(await other.tokens.readRefreshToken(), 'refresh-other');
    },
  );
}

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/auth_repository_remote.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

void main() {
  for (final (role, surface, allowed) in [
    ('customer', 'app', true),
    ('delivery_agent', 'app', true),
    ('order_monitor', 'app', true),
    ('admin', 'app', false),
    ('order_monitor', 'admin', false),
    ('future-role', 'app', false),
  ]) {
    test('OTP session accepts only app roles: $role $surface', () async {
      final requests = <RequestOptions>[];
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              requests.add(r);
              h.resolve(
                Response(
                  requestOptions: r,
                  statusCode: 200,
                  data: {
                    'access_token': 'token',
                    'refresh_token': 'refresh',
                    'user': {
                      'id': 'u1',
                      'role': role,
                      'surface': surface,
                      'permissions': <String>[],
                    },
                  },
                ),
              );
            },
          ),
        );
      final store = InMemoryTokenStore();
      final container = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          tokenStoreProvider.overrideWithValue(store),
          authRepositoryProvider.overrideWithValue(
            AuthRepositoryRemote(ApiClient(dio)),
          ),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      final action = container
          .read(sessionControllerProvider.notifier)
          .verifyOtp(phone: '+9647700000008', code: '000000');
      if (allowed) {
        await action;
        expect(
          container.read(sessionControllerProvider).requireValue.role,
          UserRole.fromApi(role),
        );
        await container.read(sessionControllerProvider.notifier).signOut();
        expect(requests.last.path, '/auth/logout');
        expect(requests.last.data, {'refresh_token': 'refresh'});
      } else {
        await expectLater(action, throwsA(isA<AppFailure>()));
      }
      expect(requests.first.data, {
        'phone': '+9647700000008',
        'code': '000000',
        'client': 'mobile',
      });
      expect(await store.readAccessToken(), isNull);
    });
  }
}

import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';
import 'package:shubayr/core/storage/session_credentials.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/auth_result.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session_exit_tasks.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

class _Repository extends AuthRepositoryMock {
  User user = const User(id: 'A', role: 'customer');
  Future<User> Function()? read;
  int reads = 0;
  @override
  Future<User> currentUser() {
    reads++;
    return read?.call() ?? Future.value(user);
  }

  @override
  Future<AuthResult> verifyOtp({
    required String phone,
    required String code,
  }) async {
    user = User(id: phone, role: 'customer');
    return AuthResult(
      accessToken: 'access-$phone',
      refreshToken: 'refresh-$phone',
      user: user,
    );
  }
}

void main() {
  const api = 'https://local.example';
  late _Repository repo;
  late InMemoryTokenStore tokens;
  late PendingRequestStore journals;
  late ProviderContainer c;
  late SessionController controller;
  ProviderContainer createContainer() => ProviderContainer(
    overrides: [
      appConfigProvider.overrideWithValue(
        const AppConfig(apiBaseUrl: api, dataSource: DataSource.mock),
      ),
      authRepositoryProvider.overrideWithValue(repo),
      tokenStoreProvider.overrideWithValue(tokens),
      pendingRequestStoreProvider.overrideWithValue(journals),
    ],
  );
  setUp(() async {
    repo = _Repository();
    tokens = InMemoryTokenStore();
    journals = PendingRequestStore.memory();
    c = createContainer();
    await c.read(sessionControllerProvider.future);
    controller = c.read(sessionControllerProvider.notifier);
    await controller.verifyOtp(phone: 'A', code: '123456');
  });
  tearDown(() => c.dispose());

  test(
    'resume checks coalesce without replacing identity or credential epoch',
    () async {
      final gate = Completer<User>();
      repo.read = () => gate.future;
      final session = c.read(sessionControllerProvider).requireValue;
      final epoch = c.read(sessionCredentialsProvider).revision;
      controller.requireVerification();
      final first = controller.revalidate();
      final second = controller.revalidate();
      expect(identical(first, second), isTrue);
      expect(repo.reads, 1);
      expect(c.read(sessionRevalidationProvider).isLoading, isTrue);
      gate.complete(repo.user);
      await first;
      expect(c.read(sessionRevalidationProvider).hasValue, isTrue);
      expect(
        identical(c.read(sessionControllerProvider).requireValue, session),
        isTrue,
      );
      expect(c.read(sessionCredentialsProvider).revision, epoch);
    },
  );

  for (final kind in [
    FailureKind.network,
    FailureKind.timeout,
    FailureKind.server,
    FailureKind.forbidden,
  ]) {
    test(
      '$kind keeps tokens and journals; explicit retry resolves verification',
      () async {
        final slot = PendingRequestStore.slot(api, 'A', 'checkout', 'draft');
        await journals.prepare(slot, {'address_id': 'private'});
        repo.read = () async => throw AppFailure(kind);
        await controller.revalidate();
        expect(c.read(sessionRevalidationProvider).hasError, isTrue);
        expect(await tokens.readAccessToken(), 'access-A');
        expect(await tokens.readRefreshToken(), 'refresh-A');
        expect(await journals.read(slot), isNotNull);
        repo.read = null;
        await controller.revalidate();
        expect(c.read(sessionRevalidationProvider).hasValue, isTrue);
        expect(c.read(sessionControllerProvider).requireValue.user!.id, 'A');
      },
    );
  }

  test(
    'terminal rejection clears only this API/account and skips revoked remote cleanup',
    () async {
      final own = PendingRequestStore.slot(api, 'A', 'checkout', 'draft');
      final other = PendingRequestStore.slot(api, 'B', 'checkout', 'draft');
      final otherApi = PendingRequestStore.slot(
        'https://other.example',
        'A',
        'checkout',
        'draft',
      );
      for (final slot in [own, other, otherApi]) {
        await journals.prepare(slot, {'private': true});
      }
      final exits = <bool>[];
      c.read(sessionExitTasksProvider).register((_, skipRemote) async {
        exits.add(skipRemote);
      });
      repo.read = () async => throw const AppFailure.unauthorized();
      await controller.revalidate();
      expect(
        c.read(sessionControllerProvider).requireValue.isSignedIn,
        isFalse,
      );
      expect(await tokens.readAccessToken(), isNull);
      expect(await tokens.readRefreshToken(), isNull);
      expect(await tokens.readAccountScope(), isNull);
      expect(await journals.read(own), isNull);
      expect(await journals.read(other), isNotNull);
      expect(await journals.read(otherApi), isNotNull);
      expect(exits, [true]);
    },
  );

  test(
    'cold restoration rejection uses persisted cleanup scope, not token decoding',
    () async {
      final own = PendingRequestStore.slot(api, 'A', 'checkout', 'draft');
      final other = PendingRequestStore.slot(api, 'B', 'checkout', 'draft');
      await journals.prepare(own, {'private': true});
      await journals.prepare(other, {'private': true});
      expect(await tokens.readAccountScope(), (api: api, userId: 'A'));
      c.dispose();
      repo.read = () async => throw const AppFailure.unauthorized();
      c = createContainer();
      expect(
        (await c.read(sessionControllerProvider.future)).isSignedIn,
        isFalse,
      );
      expect(await tokens.readRefreshToken(), isNull);
      expect(await journals.read(own), isNull);
      expect(await journals.read(other), isNotNull);
    },
  );

  for (final fails in [false, true]) {
    test(
      'late verification ${fails ? 'rejection' : 'success'} cannot affect newer B session',
      () async {
        final gate = Completer<User>();
        repo.read = () => gate.future;
        final old = controller.revalidate();
        await controller.verifyOtp(phone: 'B', code: '123456');
        final slot = PendingRequestStore.slot(api, 'B', 'checkout', 'draft');
        await journals.prepare(slot, {'private': true});
        if (fails) {
          gate.completeError(const AppFailure.unauthorized());
        } else {
          gate.complete(const User(id: 'A', role: 'customer'));
        }
        await old;
        expect(c.read(sessionControllerProvider).requireValue.user!.id, 'B');
        expect(await tokens.readAccessToken(), 'access-B');
        expect(await tokens.readAccountScope(), (api: api, userId: 'B'));
        expect(await journals.read(slot), isNotNull);
        expect(c.read(sessionRevalidationProvider).hasValue, isTrue);
      },
    );
  }

  test('foreground terminal signal uses the same scoped cleanup', () async {
    final slot = PendingRequestStore.slot(api, 'A', 'checkout', 'draft');
    await journals.prepare(slot, {'private': true});
    c.read(unauthorizedSignalProvider.notifier).raise();
    await controller.signOut(credentialsRejected: true);
    expect(c.read(sessionControllerProvider).requireValue.isSignedIn, isFalse);
    expect(await journals.read(slot), isNull);
  });
}

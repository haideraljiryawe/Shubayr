import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

const _user = User(id: 'restored', role: 'customer');

class _Auth extends AuthRepositoryMock {
  _Auth() : super(delay: Duration.zero);
  Future<User> Function() onMe = () async => _user;
  int reads = 0;
  int otpRequests = 0;
  @override
  Future<User> currentUser() {
    reads++;
    return onMe();
  }

  @override
  Future<void> requestOtp(String phone) async => otpRequests++;
}

void main() {
  late InMemoryTokenStore tokens;
  late _Auth repository;
  late ProviderContainer container;

  setUp(() async {
    tokens = InMemoryTokenStore();
    await tokens.save(
      accessToken: 'stored-access',
      refreshToken: 'stored-refresh',
    );
    repository = _Auth();
    container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        tokenStoreProvider.overrideWithValue(tokens),
        authRepositoryProvider.overrideWithValue(repository),
      ],
    );
    addTearDown(container.dispose);
  });

  for (final failure in [
    const AppFailure.network(),
    const AppFailure.timeout(),
    const AppFailure(FailureKind.server, statusCode: 503),
    const AppFailure(FailureKind.server, statusCode: 500),
    const AppFailure(FailureKind.forbidden, statusCode: 403, code: 'FORBIDDEN'),
    const AppFailure(
      FailureKind.validation,
      statusCode: 422,
      code: 'VALIDATION_FAILED',
    ),
    const AppFailure(FailureKind.rateLimited, statusCode: 429),
    const AppFailure.unknown(),
  ]) {
    test(
      '${failure.kind.name} ${failure.statusCode} preserves credentials without authenticating',
      () async {
        repository.onMe = () => Future.error(failure);
        // Inspect both properties even on the original code, which swallows errors.
        Object? restoreError;
        try {
          await container.read(sessionControllerProvider.future);
        } catch (error) {
          restoreError = error;
        }
        expect(await tokens.readAccessToken(), 'stored-access');
        expect(await tokens.readRefreshToken(), 'stored-refresh');
        expect(restoreError, same(failure));
        expect(container.read(sessionControllerProvider).hasError, isTrue);
        expect(
          container.read(sessionControllerProvider).value?.isSignedIn ?? false,
          isFalse,
        );
      },
    );
  }

  test('definitive current-user rejection clears both tokens', () async {
    repository.onMe = () => Future.error(
      const AppFailure(
        FailureKind.unauthorized,
        statusCode: 401,
        code: 'UNAUTHORIZED',
      ),
    );
    final restored = await container.read(sessionControllerProvider.future);
    expect(restored.isSignedIn, isFalse);
    expect(await tokens.readAccessToken(), isNull);
    expect(await tokens.readRefreshToken(), isNull);
  });

  for (final user in [
    const User(id: 'admin', role: 'customer', surface: 'admin'),
    const User(id: 'unsupported', role: 'future-role'),
  ]) {
    test('unsupported app session ${user.id} is still rejected', () async {
      repository.onMe = () async => user;
      expect(
        (await container.read(sessionControllerProvider.future)).isSignedIn,
        isFalse,
      );
      expect(await tokens.readAccessToken(), isNull);
      expect(await tokens.readRefreshToken(), isNull);
    });
  }

  test(
    'successful restore keeps credentials and the verified identity',
    () async {
      final restored = await container.read(sessionControllerProvider.future);
      expect(restored.user?.id, 'restored');
      expect(restored.isSignedIn, isTrue);
      expect(await tokens.readAccessToken(), 'stored-access');
      expect(await tokens.readRefreshToken(), 'stored-refresh');
    },
  );

  test('retry verifies stored credentials without a new OTP', () async {
    repository.onMe = () => Future.error(const AppFailure.network());
    await container
        .read(sessionControllerProvider.future)
        .then<void>((_) {}, onError: (Object _) {});
    repository.onMe = () async => _user;
    container.invalidate(sessionControllerProvider);
    final restored = await container.read(sessionControllerProvider.future);
    expect(restored.isSignedIn, isTrue);
    expect(repository.reads, 2);
    expect(repository.otpRequests, 0);
    expect(await tokens.readRefreshToken(), 'stored-refresh');
  });

  test(
    'no stored token starts unauthenticated without requesting me',
    () async {
      await tokens.clear();
      container.invalidate(sessionControllerProvider);
      expect(
        (await container.read(sessionControllerProvider.future)).isSignedIn,
        isFalse,
      );
      expect(repository.reads, 0);
    },
  );

  for (final failure in [
    null,
    const AppFailure.unauthorized(),
    const AppFailure.network(),
    StateError('malformed response'),
  ]) {
    test(
      'late restore $failure cannot replace or clear a newer OTP session',
      () async {
        final response = Completer<User>();
        repository.onMe = () => response.future;
        container.listen(sessionControllerProvider, (_, _) {});
        await Future<void>.delayed(Duration.zero);
        final controller = container.read(sessionControllerProvider.notifier);
        await controller.verifyOtp(phone: '+9647700000000', code: '123456');
        if (failure == null) {
          response.complete(_user);
        } else {
          response.completeError(failure);
        }
        await Future<void>.delayed(Duration.zero);
        expect(
          container.read(sessionControllerProvider).requireValue.user?.id,
          'mock-user',
        );
        expect(await tokens.readAccessToken(), 'mock-access-token');
        expect(await tokens.readRefreshToken(), 'mock-refresh-token');
      },
    );
  }

  test(
    'late successful restoration cannot undo an explicit sign-out',
    () async {
      final response = Completer<User>();
      repository.onMe = () => response.future;
      container.listen(sessionControllerProvider, (_, _) {});
      await Future<void>.delayed(Duration.zero);
      await container.read(sessionControllerProvider.notifier).signOut();
      response.complete(_user);
      await Future<void>.delayed(Duration.zero);
      expect(
        container.read(sessionControllerProvider).requireValue.isSignedIn,
        isFalse,
      );
      expect(await tokens.readAccessToken(), isNull);
    },
  );
}

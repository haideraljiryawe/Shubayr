import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

Future<ProviderContainer> _container({String? storedToken}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  return ProviderContainer(
    retry: (retryCount, error) => null,
    overrides: [
      notificationSyncProvider.overrideWith((ref) {}),
      unreadCountProvider.overrideWith((ref) async => 0),
      dataSourceProvider.overrideWithValue(DataSource.mock),
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(
        InMemoryTokenStore(accessToken: storedToken),
      ),
    ],
  );
}

class _PendingTokenStore extends InMemoryTokenStore {
  final token = Completer<String?>();
  final cleared = Completer<void>();

  @override
  Future<String?> readAccessToken() => token.future;

  @override
  Future<void> clear() => cleared.future;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('restoration ignores a token read completed after disposal', () async {
    final tokens = _PendingTokenStore();
    var repositoryReads = 0;
    final container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [
        notificationSyncProvider.overrideWith((ref) {}),
        unreadCountProvider.overrideWith((ref) async => 0),
        dataSourceProvider.overrideWithValue(DataSource.mock),
        tokenStoreProvider.overrideWithValue(tokens),
        authRepositoryProvider.overrideWith((ref) {
          repositoryReads++;
          return AuthRepositoryMock(delay: Duration.zero);
        }),
      ],
    );
    container.read(sessionControllerProvider);
    container.dispose();
    tokens.token.complete('stored-token');
    await Future<void>.delayed(Duration.zero);
    expect(repositoryReads, 0);
  });

  test('OTP completion after disposal does not store tokens', () async {
    final tokens = InMemoryTokenStore();
    final container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [
        notificationSyncProvider.overrideWith((ref) {}),
        unreadCountProvider.overrideWith((ref) async => 0),
        dataSourceProvider.overrideWithValue(DataSource.mock),
        tokenStoreProvider.overrideWithValue(tokens),
        authRepositoryProvider.overrideWithValue(
          AuthRepositoryMock(delay: Duration.zero),
        ),
      ],
    );
    await container.read(sessionControllerProvider.future);
    final pending = container
        .read(sessionControllerProvider.notifier)
        .verifyOtp(phone: '+9647700000000', code: '123456');
    container.dispose();
    await pending;
    expect(await tokens.readAccessToken(), isNull);
  });

  test('sign-out completion after disposal does not publish state', () async {
    final tokens = _PendingTokenStore()..token.complete(null);
    final container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [
        notificationSyncProvider.overrideWith((ref) {}),
        unreadCountProvider.overrideWith((ref) async => 0),
        dataSourceProvider.overrideWithValue(DataSource.mock),
        tokenStoreProvider.overrideWithValue(tokens),
      ],
    );
    await container.read(sessionControllerProvider.future);
    final pending = container
        .read(sessionControllerProvider.notifier)
        .signOut();
    container.dispose();
    tokens.cleared.complete();
    await expectLater(pending, completes);
  });

  test('starts signed out when no token is stored', () async {
    final container = await _container();
    addTearDown(container.dispose);

    final session = await container.read(sessionControllerProvider.future);
    expect(session.isSignedIn, isFalse);
    expect(session.role, UserRole.customer);
  });

  test('a stored token that /me rejects clears the session', () async {
    final container = await _container(storedToken: 'stale-token');
    addTearDown(container.dispose);
    final tokens = container.read(tokenStoreProvider) as InMemoryTokenStore;
    expect(await tokens.readAccessToken(), 'stale-token');
    await tokens.save(
      accessToken: 'stale-token',
      refreshToken: 'stale-refresh-token',
    );

    final session = await container.read(sessionControllerProvider.future);
    expect(session.isSignedIn, isFalse);
    expect(await tokens.readAccessToken(), isNull);
    expect(tokens.refreshToken, isNull);
  });

  test('verifying an OTP opens the session and stores the tokens', () async {
    final container = await _container();
    addTearDown(container.dispose);
    await container.read(sessionControllerProvider.future);

    await container
        .read(sessionControllerProvider.notifier)
        .verifyOtp(phone: '+9647700000000', code: '123456');

    final session = container.read(sessionControllerProvider).requireValue;
    expect(session.isSignedIn, isTrue);
    expect(session.role, UserRole.customer);

    final tokens = container.read(tokenStoreProvider) as InMemoryTokenStore;
    expect(await tokens.readAccessToken(), isNotEmpty);
    expect(tokens.refreshToken, isNotNull);
  });

  test('rejects a malformed code', () async {
    final container = await _container();
    addTearDown(container.dispose);
    await container.read(sessionControllerProvider.future);

    expect(
      () => container
          .read(sessionControllerProvider.notifier)
          .verifyOtp(phone: '+9647700000000', code: '12'),
      throwsA(isA<AppFailure>()),
    );
  });

  test('signing out clears both tokens and the session', () async {
    final container = await _container();
    addTearDown(container.dispose);
    await container.read(sessionControllerProvider.future);
    await container
        .read(sessionControllerProvider.notifier)
        .verifyOtp(phone: '+9647700000000', code: '123456');

    final tokens = container.read(tokenStoreProvider) as InMemoryTokenStore;
    expect(await tokens.readAccessToken(), isNotEmpty);
    expect(tokens.refreshToken, isNotNull);
    await container.read(sessionControllerProvider.notifier).signOut();

    expect(
      container.read(sessionControllerProvider).requireValue,
      const Session.signedOut(),
    );
    expect(await tokens.readAccessToken(), isNull);
    expect(tokens.refreshToken, isNull);
  });
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

Future<ProviderContainer> _container({String? storedToken}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  return ProviderContainer(
    overrides: [
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(
        InMemoryTokenStore(accessToken: storedToken),
      ),
    ],
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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

    final session = await container.read(sessionControllerProvider.future);
    expect(session.isSignedIn, isFalse);
    expect(await container.read(tokenStoreProvider).readAccessToken(), isNull);
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

  test('signing out clears the token and the session', () async {
    final container = await _container();
    addTearDown(container.dispose);
    await container.read(sessionControllerProvider.future);
    await container
        .read(sessionControllerProvider.notifier)
        .verifyOtp(phone: '+9647700000000', code: '123456');

    await container.read(sessionControllerProvider.notifier).signOut();

    expect(
      container.read(sessionControllerProvider).requireValue,
      const Session.signedOut(),
    );
    expect(await container.read(tokenStoreProvider).readAccessToken(), isNull);
  });
}

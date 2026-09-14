import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Exercise the real Dart storage adapter with the plugin's fake platform.
  // Native Keychain/Keystore persistence is outside these unit tests.
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  ProviderContainer containerFor(AuthRepositoryMock repository) {
    final container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [
        tokenStoreProvider.overrideWithValue(
          SecureTokenStore(FlutterSecureStorage()),
        ),
        authRepositoryProvider.overrideWithValue(repository),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  test(
    'secure session survives controller recreation and clears on sign-out',
    () async {
      final repository = AuthRepositoryMock(delay: Duration.zero);
      final original = containerFor(repository);
      expect(
        (await original.read(sessionControllerProvider.future)).isSignedIn,
        isFalse,
      );

      await original
          .read(sessionControllerProvider.notifier)
          .verifyOtp(phone: '+9647700000000', code: '123456');
      final signedIn = original.read(sessionControllerProvider).requireValue;
      expect(signedIn.isSignedIn, isTrue);

      // A new plugin instance must see both tokens written by the controller.
      final storage = FlutterSecureStorage();
      expect(await storage.read(key: 'auth.access_token'), 'mock-access-token');
      expect(
        await storage.read(key: 'auth.refresh_token'),
        'mock-refresh-token',
      );
      await storage.write(key: 'unrelated', value: 'keep');

      final restored = containerFor(repository);
      final session = await restored.read(sessionControllerProvider.future);
      expect(session.isSignedIn, isTrue);
      expect(session.user!.id, signedIn.user!.id);

      await restored.read(sessionControllerProvider.notifier).signOut();
      expect(
        restored.read(sessionControllerProvider).requireValue.isSignedIn,
        isFalse,
      );
      expect(await storage.read(key: 'auth.access_token'), isNull);
      expect(await storage.read(key: 'auth.refresh_token'), isNull);
      expect(await storage.read(key: 'unrelated'), 'keep');

      final afterSignOut = containerFor(repository);
      expect(
        (await afterSignOut.read(sessionControllerProvider.future)).isSignedIn,
        isFalse,
      );
    },
  );

  test('rejected restored session removes both secure tokens', () async {
    FlutterSecureStorage.setMockInitialValues({
      'auth.access_token': 'stale-access-token',
      'auth.refresh_token': 'stale-refresh-token',
      'unrelated': 'keep',
    });
    // A fresh mock repository rejects currentUser until a successful sign-in.
    final container = containerFor(AuthRepositoryMock(delay: Duration.zero));
    expect(
      (await container.read(sessionControllerProvider.future)).isSignedIn,
      isFalse,
    );
    expect(await FlutterSecureStorage().readAll(), {'unrelated': 'keep'});
  });
}

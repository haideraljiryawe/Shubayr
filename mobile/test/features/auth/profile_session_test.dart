import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/profile_update.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'support/profile_fakes.dart';

Future<ProviderContainer> start(RecordingProfile repo) async {
  final container = ProviderContainer(
    retry: (retryCount, error) => null,
    overrides: [
      authRepositoryProvider.overrideWithValue(repo),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
    ],
  );
  await container.read(sessionControllerProvider.future);
  await container
      .read(sessionControllerProvider.notifier)
      .verifyOtp(phone: '07700000000', code: '123456');
  return container;
}

void main() {
  test(
    'session stays unchanged until success and adopts returned fields',
    () async {
      final repo = RecordingProfile();
      final container = await start(repo);
      addTearDown(container.dispose);
      final before = container
          .read(sessionControllerProvider)
          .requireValue
          .user!;
      final response = Completer<User>();
      repo.onUpdate = (_) => response.future;
      final save = container
          .read(sessionControllerProvider.notifier)
          .updateProfile(const ProfileUpdate(email: 'input@example.com'));
      expect(
        container.read(sessionControllerProvider).requireValue.user,
        same(before),
      );
      response.complete(
        before.copyWith(email: 'saved@example.com', name: 'Canonical'),
      );
      await save;
      expect(
        container.read(sessionControllerProvider).requireValue.user!.email,
        'saved@example.com',
      );
      expect(
        container.read(sessionControllerProvider).requireValue.user!.name,
        'Canonical',
      );
    },
  );
  test(
    'failure preserves the session and retry succeeds; email-only changes notify',
    () async {
      final repo = RecordingProfile();
      final container = await start(repo);
      addTearDown(container.dispose);
      final before = container.read(sessionControllerProvider).requireValue;
      repo.onUpdate = (_) async => throw const AppFailure.network();
      await expectLater(
        container
            .read(sessionControllerProvider.notifier)
            .updateProfile(const ProfileUpdate(email: 'a@example.com')),
        throwsA(isA<AppFailure>()),
      );
      expect(
        container.read(sessionControllerProvider).requireValue,
        same(before),
      );
      repo.onUpdate = null;
      await container
          .read(sessionControllerProvider.notifier)
          .updateProfile(const ProfileUpdate(email: 'a@example.com'));
      expect(
        container.read(sessionControllerProvider).requireValue,
        isNot(equals(before)),
      );
      expect(repo.writes, hasLength(2));
    },
  );
  for (final fail in [false, true]) {
    for (final next in ['signOut', 'anotherLogin', 'dispose']) {
      test(
        'late profile success cannot resurrect or overwrite a session after $next fail=$fail',
        () async {
          final repo = RecordingProfile();
          final container = await start(repo);
          final old = container
              .read(sessionControllerProvider)
              .requireValue
              .user!;
          final response = Completer<User>();
          repo.onUpdate = (_) => response.future;
          final controller = container.read(sessionControllerProvider.notifier);
          final save = controller.updateProfile(
            const ProfileUpdate(name: 'Stale'),
          );
          if (next == 'dispose') {
            container.dispose();
          } else {
            addTearDown(container.dispose);
            await controller.signOut();
            if (next == 'anotherLogin') {
              await controller.verifyOtp(phone: '07700000001', code: '123456');
            }
          }
          if (fail) {
            response.completeError(const AppFailure.network());
          } else {
            response.complete(old.copyWith(name: 'Stale'));
          }
          expect(await save, isNull);
          if (next != 'dispose') {
            expect(
              container.read(sessionControllerProvider).value?.user?.name,
              isNot('Stale'),
            );
            if (next == 'signOut') {
              expect(
                container
                    .read(sessionControllerProvider)
                    .requireValue
                    .isSignedIn,
                isFalse,
              );
            }
            if (next == 'anotherLogin') {
              expect(
                container
                    .read(sessionControllerProvider)
                    .requireValue
                    .user!
                    .phone,
                '07700000001',
              );
            }
          }
        },
      );
    }
  }
}

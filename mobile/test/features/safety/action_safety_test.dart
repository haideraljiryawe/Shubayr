import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/auth_result.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/profile_update.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

class PendingAuth extends AuthRepositoryMock {
  PendingAuth() : super(delay: Duration.zero);
  final request = Completer<void>();
  final verification = Completer<AuthResult>();
  final profile = Completer<User>();
  int requests = 0, verifications = 0, profiles = 0;
  @override
  Future<void> requestOtp(String phone) {
    requests++;
    return request.future;
  }

  @override
  Future<AuthResult> verifyOtp({required String phone, required String code}) {
    verifications++;
    return verification.future;
  }

  @override
  Future<User> updateProfile(ProfileUpdate update) {
    profiles++;
    return profile.future;
  }
}

void main() {
  late PendingAuth repository;
  late ProviderContainer c;
  late SessionController controller;
  setUp(() async {
    repository = PendingAuth();
    c = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        authRepositoryProvider.overrideWithValue(repository),
        tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      ],
    );
    addTearDown(c.dispose);
    await c.read(sessionControllerProvider.future);
    controller = c.read(sessionControllerProvider.notifier);
  });
  test('duplicate OTP request has one repository execution', () async {
    final a = controller.requestOtp('07700000000');
    final b = controller.requestOtp('07700000000');
    repository.request.complete();
    await Future.wait([a, b]);
    expect(repository.requests, 1);
  });
  test(
    'duplicate verification has one commit-owned repository execution',
    () async {
      final a = controller.verifyOtp(phone: '07700000000', code: '123456');
      final b = controller.verifyOtp(phone: '07700000000', code: '123456');
      repository.verification.complete(
        const AuthResult(
          accessToken: 'secret',
          user: User(id: 'A', role: 'customer'),
        ),
      );
      await Future.wait([a, b]);
      expect(repository.verifications, 1);
      expect(c.read(sessionControllerProvider).requireValue.user!.id, 'A');
    },
  );
  test('profile save cannot overlap through two callers', () async {
    final login = controller.verifyOtp(phone: '07700000000', code: '123456');
    repository.verification.complete(
      const AuthResult(
        accessToken: 'secret',
        user: User(id: 'A', role: 'customer'),
      ),
    );
    await login;
    final a = controller.updateProfile(const ProfileUpdate(name: 'New'));
    final b = controller.updateProfile(const ProfileUpdate(name: 'New'));
    repository.profile.complete(
      const User(id: 'A', role: 'customer', name: 'New'),
    );
    await Future.wait([a, b]);
    expect(repository.profiles, 1);
  });
}

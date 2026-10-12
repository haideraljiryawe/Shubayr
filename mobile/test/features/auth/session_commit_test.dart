import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/auth_result.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/profile_update.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

AuthResult _result(String id, {bool needsMe = false}) => AuthResult(
  accessToken: '$id-access',
  refreshToken: '$id-refresh',
  user: needsMe ? null : User(id: id, role: 'customer'),
);

class _Auth extends AuthRepositoryMock {
  _Auth() : super(delay: Duration.zero);
  final attempts = <String, Completer<AuthResult>>{};
  int profileWrites = 0;
  @override
  Future<User> updateProfile(ProfileUpdate update) async {
    profileWrites++;
    return const User(id: 'A', role: 'customer');
  }

  final meStarted = Completer<void>();
  final me = Completer<User>();
  @override
  Future<AuthResult> verifyOtp({required String phone, required String code}) =>
      (attempts[code] = Completer<AuthResult>()).future;
  @override
  Future<User> currentUser() {
    if (!meStarted.isCompleted) meStarted.complete();
    return me.future;
  }
}

class _Store extends InMemoryTokenStore {
  Completer<void>? saveGate;
  final saveStarted = Completer<void>();
  Completer<void>? clearGate;
  final clearStarted = Completer<void>();
  Completer<void>? refreshReadGate;
  final refreshReadStarted = Completer<void>();
  @override
  Future<void> save({required String accessToken, String? refreshToken}) async {
    final gate = saveGate;
    saveGate = null;
    if (gate != null) {
      saveStarted.complete();
      await gate.future;
    }
    await super.save(accessToken: accessToken, refreshToken: refreshToken);
  }

  @override
  Future<void> clear() async {
    final gate = clearGate;
    clearGate = null;
    if (gate != null) {
      clearStarted.complete();
      await gate.future;
    }
    await super.clear();
  }

  @override
  Future<String?> readRefreshToken() async {
    final gate = refreshReadGate;
    refreshReadGate = null;
    final token = await super.readRefreshToken();
    if (gate != null) {
      refreshReadStarted.complete();
      await gate.future;
    }
    return token;
  }
}

void main() {
  late ProviderContainer container;
  late _Auth auth;
  late _Store store;
  late SessionController controller;

  setUp(() async {
    auth = _Auth();
    store = _Store();
    container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        tokenStoreProvider.overrideWithValue(store),
        authRepositoryProvider.overrideWithValue(auth),
      ],
    );
    addTearDown(container.dispose);
    container.listen(sessionControllerProvider, (_, _) {});
    await container.read(sessionControllerProvider.future);
    controller = container.read(sessionControllerProvider.notifier);
  });

  Future<void> verify(String id, {bool needsMe = false}) {
    final pending = controller.verifyOtp(phone: '+9647700000000', code: id);
    auth.attempts[id]!.complete(_result(id, needsMe: needsMe));
    return pending;
  }

  Future<void> expectSession(String? id) async {
    expect(container.read(sessionControllerProvider).value?.user?.id, id);
    expect(await store.readAccessToken(), id == null ? null : '$id-access');
    expect(await store.readRefreshToken(), id == null ? null : '$id-refresh');
  }

  test('OTP response after logout cannot establish a session', () async {
    final pending = controller.verifyOtp(phone: 'phone', code: 'A');
    await controller.signOut();
    auth.attempts['A']!.complete(_result('A'));
    await pending;
    await expectSession(null);
  });

  for (final fails in [false, true]) {
    test(
      'older OTP ${fails ? 'failure' : 'success'} cannot replace B or report stale failure',
      () async {
        final a = controller.verifyOtp(phone: 'phone', code: 'A');
        final aCompletes = expectLater(a, completes);
        await verify('B');
        if (fails) {
          auth.attempts['A']!.completeError(const AppFailure.network());
        } else {
          auth.attempts['A']!.complete(_result('A'));
        }
        await aCompletes;
        await expectSession('B');
      },
    );
  }

  for (final replacement in ['logout', 'B', 'disposal']) {
    test(
      '$replacement during token persistence owns the final credentials',
      () async {
        final gate = store.saveGate = Completer<void>();
        final a = verify('A');
        await store.saveStarted.future;
        Future<void>? next;
        if (replacement == 'logout') {
          next = controller.signOut();
        } else if (replacement == 'B') {
          next = verify('B');
        } else {
          container.dispose();
        }
        gate.complete();
        await a;
        await next;
        if (replacement == 'disposal') {
          expect(await store.readAccessToken(), isNull);
          expect(await store.readRefreshToken(), isNull);
        } else {
          await expectSession(replacement == 'B' ? 'B' : null);
        }
      },
    );
  }

  test('logout while me is pending cannot be undone by its response', () async {
    final a = verify('A', needsMe: true);
    await auth.meStarted.future;
    await controller.signOut();
    auth.me.complete(const User(id: 'A', role: 'customer'));
    await a;
    await expectSession(null);
  });

  for (final outcome in ['success', 'unauthorized', 'network', 'unsupported']) {
    test('old me $outcome cannot publish or clear B', () async {
      final a = verify('A', needsMe: true);
      final aCompletes = expectLater(a, completes);
      await auth.meStarted.future;
      await verify('B');
      if (outcome == 'unauthorized') {
        auth.me.completeError(const AppFailure.unauthorized());
      } else if (outcome == 'network') {
        auth.me.completeError(const AppFailure.network());
      } else {
        auth.me.complete(
          User(id: 'A', role: outcome == 'unsupported' ? 'admin' : 'customer'),
        );
      }
      await aCompletes;
      await expectSession('B');
    });
  }

  for (final boundary in ['refresh read', 'clear']) {
    test('old logout during $boundary cannot clear or sign out B', () async {
      await verify('A');
      final gate = Completer<void>();
      if (boundary == 'clear') {
        store.clearGate = gate;
      } else {
        store.refreshReadGate = gate;
      }
      final logout = controller.signOut();
      await (boundary == 'clear'
          ? store.clearStarted.future
          : store.refreshReadStarted.future);
      final b = verify('B');
      gate.complete();
      await logout;
      await b;
      await expectSession('B');
    });
  }

  test(
    'restore rejection during clear cannot clear a newer OTP commit',
    () async {
      await store.save(
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
      );
      final gate = store.clearGate = Completer<void>();
      container.invalidate(sessionControllerProvider);
      container.read(sessionControllerProvider);
      await auth.meStarted.future;
      auth.me.completeError(const AppFailure.unauthorized());
      await store.clearStarted.future;
      final b = verify('B');
      gate.complete();
      await b;
      await container.pump();
      await expectSession('B');
    },
  );

  test(
    'an accepted logout still clears credentials when the provider is disposed',
    () async {
      await verify('A');
      final gate = store.refreshReadGate = Completer<void>();
      final logout = controller.signOut();
      await store.refreshReadStarted.future;
      container.dispose();
      gate.complete();
      await logout;
      expect(await store.readAccessToken(), isNull);
      expect(await store.readRefreshToken(), isNull);
    },
  );

  test(
    'current public OTP rejection does not clear an existing valid session',
    () async {
      await verify('A');
      final rejected = controller.verifyOtp(phone: 'phone', code: 'bad');
      final failure = expectLater(rejected, throwsA(isA<AppFailure>()));
      auth.attempts['bad']!.completeError(const AppFailure.unauthorized());
      await failure;
      await expectSession('A');
    },
  );

  test(
    'normal verification retains the matching credential pair and identity',
    () async {
      await verify('A');
      await expectSession('A');
    },
  );
  test(
    'profile edit cannot republish identity while logout cleanup is pending',
    () async {
      await verify('A');
      final gate = store.clearGate = Completer<void>();
      final logout = controller.signOut();
      await store.clearStarted.future;
      final edit = controller.updateProfile(
        const ProfileUpdate(name: 'changed'),
      );
      gate.complete();
      await expectLater(edit, throwsA(isA<AppFailure>()));
      await logout;
      expect(auth.profileWrites, 0);
      await expectSession(null);
    },
  );
}

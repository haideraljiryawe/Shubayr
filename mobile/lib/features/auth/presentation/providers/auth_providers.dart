import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/storage/token_store.dart';
import '../../data/auth_repository_mock.dart';
import '../../data/auth_repository_remote.dart';
import '../../domain/auth_repository.dart';
import '../../domain/session.dart';

/// Mock ⇄ remote switch for auth. `requestOtp`, `verifyOtp` and `/me` are the
/// only endpoints with complete request *and* response schemas, so the remote
/// implementation is real, not a stub.
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => AuthRepositoryMock(),
    DataSource.remote => AuthRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// Owns the signed-in state for the whole app.
///
/// `build()` restores a previous session from the stored token, which is why
/// the router shows the splash while this resolves.
class SessionController extends AsyncNotifier<Session> {
  @override
  Future<Session> build() async {
    // A 401 anywhere in the app ends the session (there is no refresh
    // endpoint in the contract to recover with).
    ref.listen(unauthorizedSignalProvider, (previous, next) {
      if (previous != null && next != previous) signOut();
    });

    final token = await ref.read(tokenStoreProvider).readAccessToken();
    if (token == null || token.isEmpty) return const Session.signedOut();

    try {
      final user = await ref.read(authRepositoryProvider).currentUser();
      return Session.signedIn(user);
    } on AppFailure {
      await ref.read(tokenStoreProvider).clear();
      return const Session.signedOut();
    }
  }

  /// `POST /auth/request-otp`. Errors propagate for the screen to display.
  Future<void> requestOtp(String phone) =>
      ref.read(authRepositoryProvider).requestOtp(phone);

  /// `POST /auth/verify-otp` — stores the token and opens the session.
  Future<void> verifyOtp({required String phone, required String code}) async {
    final repository = ref.read(authRepositoryProvider);
    final result = await repository.verifyOtp(phone: phone, code: code);

    final accessToken = result.accessToken;
    if (accessToken == null || accessToken.isEmpty) {
      throw const AppFailure.unauthorized();
    }
    await ref
        .read(tokenStoreProvider)
        .save(accessToken: accessToken, refreshToken: result.refreshToken);

    final user = result.user ?? await repository.currentUser();
    state = AsyncData(Session.signedIn(user));
  }

  Future<void> signOut() async {
    await ref.read(tokenStoreProvider).clear();
    state = const AsyncData(Session.signedOut());
  }
}

final sessionControllerProvider =
    AsyncNotifierProvider<SessionController, Session>(SessionController.new);

/// The current session's RBAC permission keys (empty for guests and
/// customers). Screens read this — or use `PermissionGate` — to hide actions
/// the user's role does not grant.
final permissionsProvider = Provider<List<String>>(
  (ref) =>
      ref.watch(sessionControllerProvider).valueOrNull?.permissions ??
      const [],
);

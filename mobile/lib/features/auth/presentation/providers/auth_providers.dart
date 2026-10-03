import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/error/response_decode.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/storage/session_credentials.dart';
import '../../data/auth_repository_mock.dart';
import '../../data/auth_repository_remote.dart';
import '../../domain/auth_repository.dart';
import '../../domain/session.dart';
import '../../domain/profile_update.dart';
import '../../data/user.dart';

/// Auth and self-profile operations use the selected repository.
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
  // Preserve Riverpod 2 notifications: Session equality omits some user fields
  // and compares permission counts, so it must not suppress permission changes.
  @override
  bool updateShouldNotify(
    AsyncValue<Session> previous,
    AsyncValue<Session> next,
  ) {
    if (previous.isLoading || next.isLoading) {
      return previous.isLoading != next.isLoading;
    }
    return true;
  }

  int _owner = 0;
  SessionCredentials get _credentials => ref.read(sessionCredentialsProvider);

  bool _owns(int owner) => ref.mounted && _credentials.owns(owner);
  int _profileRevision = 0;
  final _otpRequests = <(int, String), Future<void>>{};
  final _verifications =
      <(String, String), ({int owner, Future<Session?> task})>{};
  int? _profileSubmitting;

  @override
  Future<Session> build() async {
    final revision = _owner = _credentials.beginTransition();
    final credentials = _credentials;
    ref.onDispose(() => credentials.invalidate(_owner));
    // The interceptor raises this only when token rotation cannot restore access.
    ref.listen(unauthorizedSignalProvider, (previous, next) {
      if (previous != null && next != previous) signOut();
    });

    final token = (await _credentials.read()).accessToken;
    if (!ref.mounted) return const Session.signedOut();
    if (!_owns(revision)) {
      return await _currentSession();
    }
    if (token == null || token.isEmpty) return const Session.signedOut();

    try {
      final user = await ref.read(authRepositoryProvider).currentUser();
      if (!ref.mounted) return const Session.signedOut();
      if (!_owns(revision)) {
        return await _currentSession();
      }
      final session = Session.signedIn(user);
      if (!session.isSignedIn) throw const AppFailure.unauthorized();
      return session;
    } catch (error) {
      if (!ref.mounted) return const Session.signedOut();
      if (!_owns(revision)) {
        return await _currentSession();
      }
      // /me's UNAUTHORIZED reaches here after the interceptor has attempted
      // recovery. FORBIDDEN is a permission failure, not invalid credentials.
      // Transport/server (and other unverifiable) failures remain AsyncError:
      // retain the credentials, authorize nobody, and allow an explicit retry.
      if (error is! AppFailure || error.kind != FailureKind.unauthorized) {
        rethrow;
      }
      await _credentials.clear(revision);
      if (!ref.mounted) return const Session.signedOut();
      if (!_owns(revision)) {
        return await _currentSession();
      }
      return const Session.signedOut();
    }
  }

  Future<Session> _currentSession() async {
    // An obsolete restore must not resolve before the owner's queued cleanup.
    await _credentials.settled;
    return ref.mounted
        ? state.value ?? const Session.signedOut()
        : const Session.signedOut();
  }

  /// `POST /auth/request-otp`. Errors propagate for the screen to display.
  Future<void> requestOtp(String phone) {
    final key = (_credentials.revision, phone);
    final pending = _otpRequests[key];
    if (pending != null) return pending;
    final task =
        Future<void>.sync(
          () => ref.read(authRepositoryProvider).requestOtp(phone),
        ).whenComplete(() {
          _otpRequests.remove(key);
        });
    _otpRequests[key] = task;
    return task;
  }

  /// A null result belongs to an obsolete attempt; callers must not navigate
  /// or show an error/success for it. Credentials and identity share ownership.
  Future<Session?> verifyOtp({required String phone, required String code}) {
    final key = (phone, code);
    final pending = _verifications[key];
    if (pending != null && _owns(pending.owner)) return pending.task;
    // A distinct attempt retains C04's latest-attempt ownership semantics.
    late final Future<Session?> task;
    task = _verifyOtp(phone: phone, code: code).whenComplete(() {
      if (identical(_verifications[key]?.task, task)) {
        _verifications.remove(key);
      }
    });
    _verifications[key] = (owner: _owner, task: task);
    return task;
  }

  Future<Session?> _verifyOtp({
    required String phone,
    required String code,
  }) async {
    final revision = _owner = _credentials.beginTransition();
    final repository = ref.read(authRepositoryProvider);
    var persisted = false;
    try {
      final result = await repository.verifyOtp(phone: phone, code: code);
      if (!_owns(revision)) return null;
      final accessToken = result.accessToken;
      if (accessToken == null || accessToken.isEmpty) {
        throw const AppFailure.unauthorized();
      }
      // Once replacing credentials, the previous identity no longer authorizes
      // account data. Ordinary guest OTP flows retain their existing UI state.
      state = const AsyncData(Session.signedOut());
      final saved = await _credentials.save(
        revision,
        accessToken: accessToken,
        refreshToken: result.refreshToken,
      );
      if (!_owns(revision) || !saved) return null;
      persisted = true;
      final user = result.user ?? await repository.currentUser();
      if (!_owns(revision)) return null;
      final session = Session.signedIn(user);
      if (!session.isSignedIn) {
        await _credentials.clear(revision);
        if (!_owns(revision)) return null;
        throw const AppFailure(FailureKind.forbidden);
      }
      state = AsyncData(session);
      return session;
    } catch (error) {
      if (!_owns(revision)) return null;
      // Preserve C03: connectivity failures do not invalidate a credential pair.
      if (persisted &&
          error is AppFailure &&
          error.kind == FailureKind.unauthorized) {
        await _credentials.clear(revision);
        if (!_owns(revision)) return null;
      }
      rethrow;
    }
  }

  /// Commit the server result only to the session that requested this edit.
  /// A stale result returns null so its screen cannot show a false success.
  Future<User?> updateProfile(ProfileUpdate update) async {
    final user = state.value?.user;
    if (state.isLoading || state.hasError || user == null) {
      throw const AppFailure.unauthorized();
    }
    final sessionRevision = _credentials.revision;
    if (_profileSubmitting == sessionRevision) return null;
    _profileSubmitting = sessionRevision;
    final request = ++_profileRevision;
    bool isCurrent() =>
        _owns(sessionRevision) &&
        request == _profileRevision &&
        identical(state.value?.user, user);
    try {
      final saved = await ref
          .read(authRepositoryProvider)
          .updateProfile(update);
      if (!isCurrent()) return null;
      state = AsyncData(Session.signedIn(saved));
      return saved;
    } catch (_) {
      if (!isCurrent()) return null;
      rethrow;
    } finally {
      if (_profileSubmitting == sessionRevision) _profileSubmitting = null;
    }
  }

  Future<void> signOut() async {
    final revision = _owner = _credentials.beginTransition();
    final repository = ref.read(authRepositoryProvider);
    // Revoke local authorization immediately; disk cleanup may be waiting for
    // a platform write, but it cannot publish over or clear a newer login.
    state = const AsyncLoading();
    final StoredCredentials? removed;
    try {
      removed = await _credentials.clear(revision);
    } catch (error, stack) {
      final failure = actionFailure(error, stack);
      if (_owns(revision)) state = AsyncError(failure, stack);
      return;
    }
    if (_owns(revision)) state = const AsyncData(Session.signedOut());
    final refreshToken = removed?.refreshToken;
    if (refreshToken != null) {
      try {
        await repository.logout(refreshToken);
      } catch (error, stack) {
        // Local credentials are always removed, including when offline.
        actionFailure(error, stack);
      }
    }
  }
}

final sessionControllerProvider =
    AsyncNotifierProvider<SessionController, Session>(SessionController.new);

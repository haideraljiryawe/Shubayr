import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'token_store.dart';

typedef StoredCredentials = ({String? accessToken, String? refreshToken});

/// One ownership epoch and one storage lane for session commits and rotation.
/// No tokens are cached here. Reads wait for both secure-storage writes/deletes,
/// so the network layer cannot observe half of a credential pair.
class SessionCredentials {
  SessionCredentials(this._store);
  final TokenStore _store;
  int _revision = 0;
  final _cleanupOwners = <int>{};
  final _deferredInvalidations = <int>{};
  Future<void> _operations = Future.value();

  int get revision => _revision;
  int beginTransition() => ++_revision;
  bool owns(int owner) => owner == _revision;
  void invalidate(int owner) {
    if (!owns(owner)) return;
    if (_cleanupOwners.contains(owner)) {
      _deferredInvalidations.add(owner);
    } else {
      _revision++;
    }
  }

  Future<T> _serialize<T>(Future<T> Function() operation) {
    final task = _operations.then((_) => operation());
    _operations = task.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return task;
  }

  Future<StoredCredentials> _read() async => (
    accessToken: await _store.readAccessToken(),
    refreshToken: await _store.readRefreshToken(),
  );

  Future<StoredCredentials> read() => _serialize(_read);

  Future<void> get settled => _operations;

  Future<bool> save(
    int owner, {
    required String accessToken,
    String? refreshToken,
    StoredCredentials? expected,
  }) => _serialize(() async {
    if (!owns(owner)) return false;
    if (expected != null) {
      final current = await _read();
      if (!owns(owner) || current != expected) return false;
    }
    try {
      await _store.save(accessToken: accessToken, refreshToken: refreshToken);
    } catch (_) {
      // A platform write can fail between the two keys. Clear the incomplete
      // pair before releasing the lane to any reader or newer writer.
      await _store.clear();
      rethrow;
    }
    if (!owns(owner)) {
      // Ownership can change during an uncancellable platform write. Cleanup
      // is inside the same lane, so it cannot delete a newer owner's commit.
      await _store.clear();
      return false;
    }
    return true;
  });

  /// Logout cleanup may need authenticated HTTP before wiping credentials.
  /// Retain only this cleanup's ownership across container disposal. A newer
  /// login still increments the revision immediately and cannot be cleared.
  /// Reads remain available to the cleanup; no credential copy/cache is made.
  Future<StoredCredentials?> clearAfter(
    int owner,
    Future<void> Function() cleanup,
  ) async {
    if (!owns(owner)) return null;
    _cleanupOwners.add(owner);
    try {
      try {
        await cleanup();
      } catch (_) {
        if (owns(owner)) await clear(owner);
        rethrow;
      }
      return owns(owner) ? await clear(owner) : null;
    } finally {
      _cleanupOwners.remove(owner);
      if (_deferredInvalidations.remove(owner) && owns(owner)) _revision++;
    }
  }

  /// Accept a clear only from the current owner. Once accepted, it occupies a
  /// position before any newer writer and must finish even on disposal (logout
  /// must persist). It can never erase a credential commit queued after it.
  Future<StoredCredentials?> clear(int owner) {
    if (!owns(owner)) return Future.value(null);
    return _serialize(() async {
      final previous = await _read();
      await _store.clear();
      return previous;
    });
  }
}

final sessionCredentialsProvider = Provider<SessionCredentials>((ref) {
  final credentials = SessionCredentials(ref.watch(tokenStoreProvider));
  ref.onDispose(() => credentials.invalidate(credentials.revision));
  return credentials;
});

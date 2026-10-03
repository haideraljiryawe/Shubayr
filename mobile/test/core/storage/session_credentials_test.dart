import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/storage/session_credentials.dart';
import 'package:shubayr/core/storage/token_store.dart';

class _Storage extends FlutterSecureStorage {
  final values = <String, String>{};
  final accessWritten = Completer<void>();
  final releaseRefresh = Completer<void>();
  bool failRefresh = false;
  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => values[key];
  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (key == 'auth.refresh_token') {
      await releaseRefresh.future;
      if (failRefresh) throw StateError('platform write failed');
    }
    values[key] = value!;
    if (key == 'auth.access_token' && !accessWritten.isCompleted) {
      accessWritten.complete();
    }
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => values.remove(key);
}

void main() {
  test(
    'a read cannot observe access written without the matching refresh',
    () async {
      final storage = _Storage();
      final credentials = SessionCredentials(SecureTokenStore(storage));
      final owner = credentials.beginTransition();
      final saved = credentials.save(
        owner,
        accessToken: 'A',
        refreshToken: 'A-refresh',
      );
      await storage.accessWritten.future;
      expect(storage.values, {'auth.access_token': 'A'});
      var readCompleted = false;
      final read = credentials.read().then((pair) {
        readCompleted = true;
        return pair;
      });
      await pumpEventQueue();
      expect(readCompleted, isFalse);
      storage.releaseRefresh.complete();
      expect(await saved, isTrue);
      expect(await read, (accessToken: 'A', refreshToken: 'A-refresh'));
    },
  );

  for (final action in ['logout', 'replacement', 'disposal']) {
    test(
      '$action between physical writes cannot expose a stale credential pair',
      () async {
        final storage = _Storage();
        final credentials = SessionCredentials(SecureTokenStore(storage));
        final owner = credentials.beginTransition();
        final saved = credentials.save(
          owner,
          accessToken: 'A',
          refreshToken: 'A-refresh',
        );
        await storage.accessWritten.future;
        final next = credentials.beginTransition();
        Future<Object?>? nextWrite;
        if (action == 'logout') nextWrite = credentials.clear(next);
        if (action == 'replacement') {
          nextWrite = credentials.save(
            next,
            accessToken: 'B',
            refreshToken: 'B-refresh',
          );
        }
        storage.releaseRefresh.complete();
        expect(await saved, isFalse);
        await nextWrite;
        expect(
          await credentials.read(),
          action == 'replacement'
              ? (accessToken: 'B', refreshToken: 'B-refresh')
              : (accessToken: null, refreshToken: null),
        );
      },
    );
  }

  test(
    'a failed second write clears the partial pair and releases the lane',
    () async {
      final storage = _Storage()..failRefresh = true;
      final credentials = SessionCredentials(SecureTokenStore(storage));
      final owner = credentials.beginTransition();
      final saved = credentials.save(
        owner,
        accessToken: 'A',
        refreshToken: 'A-refresh',
      );
      final failure = expectLater(saved, throwsStateError);
      await storage.accessWritten.future;
      storage.releaseRefresh.complete();
      await failure;
      expect(await credentials.read(), (accessToken: null, refreshToken: null));
      storage.failRefresh = false;
      expect(
        await credentials.save(
          credentials.beginTransition(),
          accessToken: 'B',
          refreshToken: 'B-refresh',
        ),
        isTrue,
      );
      expect(await credentials.read(), (
        accessToken: 'B',
        refreshToken: 'B-refresh',
      ));
    },
  );
}

import 'dart:convert';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/app_config.dart';
import '../error/failure.dart';

/// An immutable write intent. Persisted before HTTP, removed only after a known
/// outcome. No tokens or response bodies are stored here.
class PendingRequest {
  PendingRequest(this.id, Map<String, dynamic> body)
    : body = Map.unmodifiable(body);
  final String id;
  final Map<String, dynamic> body;
}

class PendingRequestStore {
  PendingRequestStore([this._storage = const FlutterSecureStorage()]);
  PendingRequestStore.memory() : _storage = null;
  final FlutterSecureStorage? _storage;
  final _memory = <String, String>{};
  Future<void> _lane = Future.value();

  static String slot(String api, String user, String action, String resource) =>
      'pending.request.v1.${base64Url.encode(utf8.encode(jsonEncode([api, user, action, resource])))}';

  Future<T> _serialize<T>(Future<T> Function() work) {
    final task = _lane.then((_) => work());
    _lane = task.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return task;
  }

  Future<PendingRequest?> _read(String slot) async {
    final raw = _storage == null
        ? _memory[slot]
        : await _storage.read(key: slot);
    if (raw == null) return null;
    final value = jsonDecode(raw) as Map<String, dynamic>;
    final id = value['id'] as String;
    if (id.length < 8 || id.length > 128) throw const FormatException();
    return PendingRequest(id, value['body'] as Map<String, dynamic>);
  }

  Future<PendingRequest?> read(String slot) => _serialize(() => _read(slot));

  Future<PendingRequest> prepare(
    String slot,
    Map<String, dynamic> body,
  ) => _serialize(() async {
    final previous = await _read(slot);
    if (previous != null) {
      if (jsonEncode(previous.body) != jsonEncode(body)) {
        throw const AppFailure(FailureKind.conflict, code: 'PENDING_REQUEST');
      }
      return previous;
    }
    final random = Random.secure();
    final id = base64Url.encode(List.generate(24, (_) => random.nextInt(256)));
    final request = PendingRequest(id, body);
    final raw = jsonEncode({'id': id, 'body': body});
    if (_storage == null) {
      _memory[slot] = raw;
    } else {
      await _storage.write(key: slot, value: raw);
    }
    return request;
  });

  Future<void> complete(String slot, String id) => _serialize(() async {
    if ((await _read(slot))?.id != id) return;
    if (_storage == null) {
      _memory.remove(slot);
    } else {
      await _storage.delete(key: slot);
    }
  });
}

/// Test fixtures opt into memory explicitly; normal launches always persist.
final pendingRequestStoreProvider = Provider<PendingRequestStore>(
  (ref) => ref.watch(dataSourceProvider) == DataSource.mock
      ? PendingRequestStore.memory()
      : PendingRequestStore(),
);

bool isDefinitiveWriteRejection(Object error) =>
    error is AppFailure &&
    error.statusCode != null &&
    error.statusCode! >= 400 &&
    error.statusCode! < 500 &&
    error.statusCode != 408 &&
    error.code != 'IDEMPOTENCY_KEY_REUSED';

import 'dart:async';
import 'push_client.dart';

typedef PushOwner = ({String userId, int revision, String locale});

/// One serialized token lifecycle; every network request names its credential
/// epoch. No access/refresh token is copied or cached here.
class PushLifecycle {
  PushLifecycle({
    required this.createClient,
    required this.devices,
    required this.report,
    required this.onEvent,
  });
  final Future<PushClient?> Function() createClient;
  final DeviceRegistration devices;
  final void Function(Object, StackTrace) report;
  final void Function(PushEvent, PushOwner) onEvent;
  PushClient? _client;
  PushOwner? _owner;
  String? _registered;
  bool _disposed = false, _initialChecked = false;
  Future<void> _lane = Future.value();
  StreamSubscription<String>? _tokens;
  StreamSubscription<PushEvent>? _messages;

  bool _owns(PushOwner owner) => !_disposed && _owner == owner;
  Future<T> _enqueue<T>(Future<T> Function() work) {
    final task = _lane.then((_) => work());
    _lane = task.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return task;
  }

  Future<PushClient?> _initialize() async {
    if (_client != null) return _client;
    final client = await createClient();
    if (_disposed || client == null) return null;
    _client = client;
    _tokens = client.tokenChanges.listen((_) {
      final owner = _owner;
      if (owner != null) {
        unawaited(
          synchronize(
            owner,
          ).then<void>((_) {}, onError: (Object _, StackTrace _) {}),
        );
      }
    }, onError: report);
    _messages = client.events.listen((event) {
      final owner = _owner;
      if (owner != null && !_disposed) onEvent(event, owner);
    }, onError: report);
    return client;
  }

  Future<PushPermission> synchronize(
    PushOwner? owner, {
    bool requestPermission = false,
  }) {
    _owner = owner; // invalidate obsolete work immediately, before the queue.
    if (owner == null || _disposed) {
      return Future.value(PushPermission.unavailable);
    }
    return _enqueue(() async {
      if (!_owns(owner)) return PushPermission.unavailable;
      try {
        final client = await _initialize();
        if (client == null || !_owns(owner)) return PushPermission.unavailable;
        final permission = await client.permission(request: requestPermission);
        if (!_owns(owner)) return PushPermission.unavailable;
        if (permission != PushPermission.authorized) {
          final previous = _registered;
          if (previous != null) {
            await devices.unregister(previous, owner.revision);
            await client.resetToken();
            _registered = null;
          }
          return permission;
        }
        final token = await client.token();
        if (!_owns(owner)) return PushPermission.unavailable;
        if (token == null) return PushPermission.notDetermined;
        final previous = _registered;
        if (previous != null && previous != token) {
          await devices.unregister(previous, owner.revision);
        }
        if (!_owns(owner)) return PushPermission.unavailable;
        // Re-register on login/resume/locale changes even if FCM kept its token:
        // the backend can deactivate invalid tokens independently.
        _registered = token; // Also clean up an uncertain registration outcome.
        await devices.register(
          token,
          client.platform,
          owner.locale,
          owner.revision,
        );
        if (!_owns(owner)) return PushPermission.unavailable;
        if (!_initialChecked) {
          _initialChecked = true;
          if (await client.initiallyOpened() && _owns(owner)) {
            onEvent(PushEvent.opened, owner);
          }
        }
        return permission;
      } catch (error, stack) {
        report(error, stack);
        rethrow;
      }
    });
  }

  Future<void> endSession(int transitionRevision, {bool unregister = true}) {
    _owner = null;
    return _enqueue(() async {
      final token = _registered;
      try {
        if (unregister && token != null) {
          await devices.unregister(token, transitionRevision);
        }
      } finally {
        // Rotation also protects account switching if backend cleanup failed.
        await _client?.resetToken();
        _registered = null;
      }
    });
  }

  void dispose() {
    _disposed = true;
    _owner = null;
    unawaited(_tokens?.cancel());
    unawaited(_messages?.cancel());
  }
}

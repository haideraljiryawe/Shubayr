import 'package:flutter_riverpod/flutter_riverpod.dart';

/// App composition registers cleanup that must run before credentials disappear.
/// The transition revision ensures network cleanup cannot use a newer login.
class SessionExitTasks {
  final _tasks = <Object, Future<void> Function(int, bool)>{};
  void Function() register(Future<void> Function(int, bool) task) {
    final key = Object();
    _tasks[key] = task;
    return () => _tasks.remove(key);
  }

  Future<void> run(
    int revision, {
    bool accountDeleted = false,
    bool credentialsRejected = false,
  }) async {
    for (final task in _tasks.values.toList()) {
      // Both cases skip authenticated cleanup, without claiming that rejection
      // specifically means deletion.
      await task(revision, accountDeleted || credentialsRejected);
    }
  }
}

final sessionExitTasksProvider = Provider((ref) => SessionExitTasks());

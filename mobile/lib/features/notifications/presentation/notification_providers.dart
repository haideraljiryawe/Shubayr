import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/error/failure.dart';
import '../../../core/storage/session_credentials.dart';
import '../../../core/network/api_client.dart';
import '../../auth/presentation/providers/auth_providers.dart';
import '../data/notification_repository.dart';

final notificationRepositoryProvider = Provider(
  (ref) => NotificationRepository(ref.watch(apiClientProvider)),
);
final notificationIdentityProvider = Provider((ref) {
  final session = ref.watch(sessionControllerProvider).value;
  return (
    id: session?.user?.id,
    role: session?.role,
    signedIn: session?.isSignedIn == true,
  );
});
final unreadCountProvider = FutureProvider.autoDispose<int>((ref) {
  if (!ref.watch(notificationIdentityProvider).signedIn) return 0;
  return ref.watch(notificationRepositoryProvider).unreadCount();
});

/// A foreground/resume sync works on both native mobile and the isolated Chrome
/// preview. Push delivery still needs the backend's production push provider.
final notificationSyncProvider = Provider.autoDispose<void>((ref) {
  if (!ref.watch(notificationIdentityProvider).signedIn) return;
  void sync() {
    ref.invalidate(unreadCountProvider);
    if (ref.exists(inboxProvider)) ref.read(inboxProvider.notifier).sync();
  }

  Timer? timer;
  void resume() {
    timer?.cancel();
    sync();
    timer = Timer.periodic(const Duration(seconds: 30), (_) => sync());
  }

  final lifecycle = AppLifecycleListener(
    onResume: resume,
    onPause: () => timer?.cancel(),
    onHide: () => timer?.cancel(),
  );
  if (WidgetsBinding.instance.lifecycleState == null ||
      WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
    timer = Timer.periodic(const Duration(seconds: 30), (_) => sync());
  }
  ref.onDispose(() {
    timer?.cancel();
    lifecycle.dispose();
  });
});

class InboxState {
  const InboxState(
    this.items,
    this.page, {
    this.loadingMore = false,
    this.appendError,
    this.syncError,
  });
  final List<InboxNotification> items;
  final InboxPage page;
  final bool loadingMore;
  final Object? appendError, syncError;
}

class InboxController extends AsyncNotifier<InboxState> {
  int _generation = 0;
  bool _syncing = false;
  final _reading = <Object, Future<bool>>{};
  @override
  Future<InboxState> build() async {
    final identity = ref.watch(notificationIdentityProvider);
    final repository = ref.watch(notificationRepositoryProvider);
    ++_generation;
    _syncing = false;
    ref.onDispose(() => _generation++);
    if (!identity.signedIn) throw const AppFailure.unauthorized();
    final page = await repository.fetch();
    return InboxState(page.items, page);
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    try {
      await future;
    } catch (_) {
      // AsyncError is rendered by the screen; a refresh gesture must not throw.
    }
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null ||
        state.isLoading ||
        state.hasError ||
        current.loadingMore ||
        _syncing ||
        !current.page.hasMore) {
      return;
    }
    final generation = _generation;
    state = AsyncData(
      InboxState(current.items, current.page, loadingMore: true),
    );
    try {
      final page = await ref
          .read(notificationRepositoryProvider)
          .fetch(page: current.page.page + 1);
      if (!ref.mounted || generation != _generation) return;
      final items = {
        for (final item in current.items) item.id: item,
        for (final item in page.items) item.id: item,
      };
      state = AsyncData(InboxState(items.values.toList(), page));
    } catch (e) {
      if (ref.mounted && generation == _generation) {
        state = AsyncData(
          InboxState(current.items, current.page, appendError: e),
        );
      }
    }
  }

  /// Reload all visible pages so another device's read state cannot stay stale.
  Future<void> sync() async {
    final current = state.value;
    if (current == null ||
        state.isLoading ||
        state.hasError ||
        current.loadingMore ||
        _syncing) {
      return;
    }
    final generation = _generation;
    final repository = ref.read(notificationRepositoryProvider);
    _syncing = true;
    try {
      var page = await repository.fetch();
      final items = {for (final item in page.items) item.id: item};
      while (page.page < current.page.page && page.hasMore) {
        page = await repository.fetch(page: page.page + 1);
        for (final item in page.items) {
          items[item.id] = item;
        }
      }
      if (ref.mounted && generation == _generation) {
        state = AsyncData(InboxState(items.values.toList(), page));
      }
    } catch (e) {
      if (ref.mounted && generation == _generation) {
        state = AsyncData(
          InboxState(current.items, current.page, syncError: e),
        );
      }
    } finally {
      if (generation == _generation) _syncing = false;
    }
  }

  Future<bool> markRead(InboxNotification item) {
    final identity = ref.read(notificationIdentityProvider);
    if (!identity.signedIn) return Future.value(false);
    final key = (
      identity,
      ref.read(sessionCredentialsProvider).revision,
      item.id,
    );
    return _reading[key] ??= _markRead(item).whenComplete(() {
      _reading.remove(key);
    });
  }

  Future<bool> _markRead(InboxNotification item) async {
    final credentials = ref.read(sessionCredentialsProvider);
    final owner = credentials.revision;
    final identity = ref.read(notificationIdentityProvider);
    await ref.read(notificationRepositoryProvider).read(item.id);
    if (!ref.mounted ||
        !credentials.owns(owner) ||
        identity != ref.read(notificationIdentityProvider)) {
      return false;
    }
    ref.invalidate(unreadCountProvider);
    // Cancel stale page responses and obtain the authoritative read state.
    ref.invalidateSelf();
    return true;
  }
}

final inboxProvider = AsyncNotifierProvider<InboxController, InboxState>(
  InboxController.new,
);

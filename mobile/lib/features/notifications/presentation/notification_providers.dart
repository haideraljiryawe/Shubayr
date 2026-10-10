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
  final identity = ref.watch(
    sessionControllerProvider.select((value) {
      final session = value.asData?.value;
      return (
        id: session?.user?.id,
        role: session?.role,
        signedIn: session?.isSignedIn == true,
      );
    }),
  );
  // Profile edits keep ownership; logout/login renews it even for the same ID.
  return (
    id: identity.id,
    role: identity.role,
    signedIn: identity.signedIn,
    scope: Object(),
  );
});
final unreadCountProvider = FutureProvider.autoDispose<int>((ref) {
  if (!ref.watch(notificationIdentityProvider).signedIn) return 0;
  return ref.watch(notificationRepositoryProvider).unreadCount();
});

/// Application-owned badge polling. It never creates or refreshes Inbox state.
final notificationSyncProvider = Provider.autoDispose<void>((ref) {
  if (!ref.watch(notificationIdentityProvider).signedIn) return;
  _pollInForeground(ref, (_) => ref.invalidate(unreadCountProvider));
});

/// Owned only by the visible Inbox route. Keeping a route underneath a pushed
/// detail page must not keep resynchronizing every loaded notification page.
final inboxSyncProvider = Provider.autoDispose<void>((ref) {
  if (!ref.watch(notificationIdentityProvider).signedIn) return;
  final controller = ref.watch(inboxProvider.notifier);
  _pollInForeground(
    ref,
    (active) => controller.sync(isActive: active),
    syncOnStart:
        ref.read(inboxProvider).hasValue && !ref.read(inboxProvider).isLoading,
  );
});

void _pollInForeground(
  Ref ref,
  void Function(bool Function()) sync, {
  bool syncOnStart = false,
}) {
  Timer? timer;
  var active = false;
  var epoch = 0;
  bool isActive() => ref.mounted && active;
  void pause() {
    active = false;
    epoch++;
    timer?.cancel();
  }

  void tick() {
    final owner = epoch;
    if (isActive()) sync(() => isActive() && epoch == owner);
  }

  bool foreground() =>
      WidgetsBinding.instance.lifecycleState == null ||
      WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
  void resume({bool immediately = true}) {
    pause();
    if (!foreground()) return;
    active = true;
    if (immediately) tick();
    timer = Timer.periodic(const Duration(seconds: 30), (_) => tick());
  }

  final lifecycle = AppLifecycleListener(
    onResume: resume,
    onInactive: pause,
    onPause: pause,
    onHide: pause,
    onDetach: pause,
  );
  if (WidgetsBinding.instance.lifecycleState == null ||
      WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
    // The provider's initial read already loads data.
    resume(immediately: false);
    if (syncOnStart) {
      // Starting a provider must not synchronously mutate another provider.
      final owner = epoch;
      scheduleMicrotask(() {
        if (owner == epoch) tick();
      });
    }
  }
  ref.onCancel(pause);
  ref.onResume(resume);
  ref.onDispose(() {
    pause();
    lifecycle.dispose();
  });
}

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
  Object? _identity;
  final _reading = <Object, Future<bool>>{};
  @override
  Future<InboxState> build() async {
    final identity = ref.watch(notificationIdentityProvider);
    final repository = ref.watch(notificationRepositoryProvider);
    if (_identity != identity) {
      _identity = identity;
      state = const AsyncData(
        InboxState([], InboxPage(items: [], page: 1, total: 0)),
      );
      state = const AsyncLoading();
    }
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
  Future<void> sync({bool Function()? isActive}) async {
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
    bool owns() =>
        ref.mounted &&
        generation == _generation &&
        _identity == ref.read(notificationIdentityProvider) &&
        (isActive?.call() ?? true);
    if (!owns()) return;
    _syncing = true;
    try {
      var page = await repository.fetch();
      if (!owns()) return;
      final items = {for (final item in page.items) item.id: item};
      while (page.page < current.page.page && page.hasMore) {
        final nextPage = page.page + 1;
        page = await repository.fetch(page: nextPage);
        if (!owns()) return;
        if (page.page != nextPage || (page.items.isEmpty && page.hasMore)) {
          throw const AppFailure(FailureKind.server);
        }
        for (final item in page.items) {
          items[item.id] = item;
        }
      }
      if (owns()) {
        state = AsyncData(InboxState(items.values.toList(), page));
      }
    } catch (e) {
      if (owns()) {
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

final inboxProvider =
    AsyncNotifierProvider.autoDispose<InboxController, InboxState>(
      InboxController.new,
    );

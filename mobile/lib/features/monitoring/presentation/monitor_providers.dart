import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/error/failure.dart';
import '../../auth/domain/user_role.dart';
import '../../auth/presentation/providers/auth_providers.dart';
import '../data/monitor_repository.dart';

final monitorRepositoryProvider = Provider(
  (ref) => MonitorRepository(ref.watch(apiClientProvider)),
);
final monitorIdentityProvider = Provider((ref) {
  final session = ref.watch(sessionControllerProvider).value;
  return (
    id: session?.user?.id,
    allowed: session?.isSignedIn == true && session?.role == UserRole.monitor,
  );
});

class MonitorFilter extends Notifier<MonitorQuery> {
  @override
  MonitorQuery build() {
    ref.watch(monitorIdentityProvider);
    return const MonitorQuery();
  }

  void select(MonitorQuery query) {
    query.parameters(1);
    state = query;
  }
}

final monitorFilterProvider = NotifierProvider<MonitorFilter, MonitorQuery>(
  MonitorFilter.new,
);

class MonitorState {
  const MonitorState(
    this.page,
    this.items, {
    this.loadingMore = false,
    this.appendError,
  });
  final MonitorPage page;
  final List<MonitorOrder> items;
  final bool loadingMore;
  final Object? appendError;
}

class MonitorController extends AsyncNotifier<MonitorState> {
  int _generation = 0;
  @override
  Future<MonitorState> build() async {
    final identity = ref.watch(monitorIdentityProvider);
    final query = ref.watch(monitorFilterProvider);
    final repo = ref.watch(monitorRepositoryProvider);
    ++_generation;
    ref.onDispose(() => _generation++);
    if (!identity.allowed) throw const AppFailure(FailureKind.forbidden);
    final page = await repo.fetch(query: query);
    return MonitorState(page, page.items);
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
    if (state.isLoading ||
        state.hasError ||
        current == null ||
        current.loadingMore ||
        !current.page.hasMore) {
      return;
    }
    final generation = _generation;
    state = AsyncData(
      MonitorState(current.page, current.items, loadingMore: true),
    );
    try {
      final page = await ref
          .read(monitorRepositoryProvider)
          .fetch(
            query: ref.read(monitorFilterProvider),
            page: current.page.page + 1,
          );
      if (!ref.mounted || generation != _generation) return;
      final unique = {
        for (final item in current.items) item.id: item,
        for (final item in page.items) item.id: item,
      };
      state = AsyncData(MonitorState(page, unique.values.toList()));
    } catch (e) {
      if (ref.mounted && generation == _generation) {
        state = AsyncData(
          MonitorState(current.page, current.items, appendError: e),
        );
      }
    }
  }
}

final monitorOrdersProvider =
    AsyncNotifierProvider<MonitorController, MonitorState>(
      MonitorController.new,
    );
final monitorDetailProvider = FutureProvider.autoDispose
    .family<MonitorOrder, String>((ref, id) {
      if (!ref.watch(monitorIdentityProvider).allowed) {
        throw const AppFailure(FailureKind.forbidden);
      }
      return ref.watch(monitorRepositoryProvider).detail(id);
    });

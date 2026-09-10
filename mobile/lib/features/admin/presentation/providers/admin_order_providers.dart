import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/domain/permissions.dart';
import '../../data/admin_order_repository_mock.dart';
import '../../data/admin_order_repository_remote.dart';
import '../../domain/admin_order_repository.dart';
import '../../../orders/data/order.dart';
import 'admin_providers.dart';

final adminOrderRepositoryProvider = Provider<AdminOrderRepository>(
  (ref) => switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => AdminOrderRepositoryMock(),
    DataSource.remote => AdminOrderRepositoryRemote(
      ref.watch(apiClientProvider),
    ),
  },
);

class AdminOrderFilterController extends Notifier<AdminOrderQuery> {
  @override
  AdminOrderQuery build() {
    ref.watch(adminSessionProvider);
    return const AdminOrderQuery();
  }

  void select(AdminOrderQuery value) {
    value.validate();
    state = value;
  }
}

final adminOrderFilterProvider =
    NotifierProvider<AdminOrderFilterController, AdminOrderQuery>(
      AdminOrderFilterController.new,
    );

class AdminOrdersState {
  const AdminOrdersState({
    required this.page,
    required this.items,
    this.loadingMore = false,
    this.appendError,
    this.updatingId,
  });
  final OrderPage page;
  final List<Order> items;
  final bool loadingMore;
  final Object? appendError;
  final String? updatingId;
  bool get hasMore => page.page * page.perPage < page.total;
}

class AdminOrdersController extends AsyncNotifier<AdminOrdersState> {
  int _generation = 0;
  int _writeToken = 0;
  bool _writePending = false;
  Object? _session;
  Future<void> _operations = Future.value();

  /// One queue includes initial reads after a filter change. A new filter cannot
  /// race an in-flight PATCH and publish an older status after that write.
  Future<T> _serialize<T>(Future<T> Function() operation) {
    final task = _operations.then((_) => operation());
    _operations = task.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return task;
  }

  void _require(String permission) {
    if (!adminCan(ref, permission)) throw const AppFailure.unauthorized();
  }

  @override
  Future<AdminOrdersState> build() async {
    final session = ref.watch(adminSessionProvider);
    final repo = ref.watch(adminOrderRepositoryProvider);
    final query = ref.watch(adminOrderFilterProvider);
    final generation = ++_generation;
    ref.onDispose(() => _generation++);
    if (_session != session) {
      _session = session;
      _operations = Future.value();
      _writePending = false;
      ++_writeToken;
    }
    _require(Permissions.ordersView);
    return _serialize(() async {
      if (generation != _generation) throw const AppFailure.unauthorized();
      final page = await _fetch(repo, query, 1);
      return AdminOrdersState(page: page, items: List.unmodifiable(page.data));
    });
  }

  Future<OrderPage> _fetch(
    AdminOrderRepository repo,
    AdminOrderQuery query,
    int number,
  ) async {
    final page = await repo.fetchOrders(
      query: query,
      page: number,
      perPage: 20,
    );
    if (page.page != number ||
        page.perPage != 20 ||
        page.total < 0 ||
        (page.data.isEmpty && (number - 1) * 20 < page.total)) {
      throw const AppFailure(FailureKind.server);
    }
    return page;
  }

  Future<void> refresh() {
    final generation = _generation;
    final query = ref.read(adminOrderFilterProvider);
    return _serialize(() async {
      if (generation != _generation) return;
      _require(Permissions.ordersView);
      await _reload(generation, query);
    });
  }

  Future<void> _reload(int generation, AdminOrderQuery query) async {
    state = const AsyncLoading<AdminOrdersState>();
    try {
      final page = await _fetch(
        ref.read(adminOrderRepositoryProvider),
        query,
        1,
      );
      if (generation == _generation) {
        state = AsyncData(
          AdminOrdersState(page: page, items: List.unmodifiable(page.data)),
        );
      }
    } catch (error, stack) {
      if (generation == _generation) state = AsyncError(error, stack);
    }
  }

  Future<void> loadMore() {
    final current = state.valueOrNull;
    if (state.isLoading ||
        state.hasError ||
        current == null ||
        current.loadingMore ||
        _writePending ||
        !current.hasMore) {
      return Future.value();
    }
    final generation = _generation, query = ref.read(adminOrderFilterProvider);
    state = AsyncData(
      AdminOrdersState(
        page: current.page,
        items: current.items,
        loadingMore: true,
      ),
    );
    return _serialize(() async {
      if (generation != _generation) return;
      _require(Permissions.ordersView);
      final latest = state.valueOrNull;
      if (latest == null || !latest.hasMore) return;
      try {
        final page = await _fetch(
          ref.read(adminOrderRepositoryProvider),
          query,
          latest.page.page + 1,
        );
        if (generation != _generation) return;
        final items = {for (final order in latest.items) order.id: order};
        for (final order in page.data) {
          items[order.id] = order;
        }
        state = AsyncData(
          AdminOrdersState(page: page, items: List.unmodifiable(items.values)),
        );
      } catch (error) {
        if (generation == _generation) {
          state = AsyncData(
            AdminOrdersState(
              page: latest.page,
              items: latest.items,
              appendError: error,
            ),
          );
        }
      }
    });
  }

  Future<bool> updateStatus(
    String id,
    String status, {
    required String expectedStatus,
  }) async {
    _require(Permissions.ordersView);
    // OpenAPI assigns every status update, including confirmation, to this key.
    _require(Permissions.ordersUpdate);
    if (!adminOrderStatuses.contains(status)) {
      throw const AppFailure(FailureKind.validation);
    }
    final current = state.valueOrNull;
    if (_writePending ||
        state.isLoading ||
        state.hasError ||
        current == null ||
        current.loadingMore) {
      return false;
    }
    final order = current.items.where((o) => o.id == id).firstOrNull;
    if (order == null) throw const AppFailure(FailureKind.notFound);
    if (order.status != expectedStatus) {
      throw const AppFailure(FailureKind.validation);
    }
    if (order.status == status) return false;
    final generation = _generation, token = ++_writeToken;
    final query = ref.read(adminOrderFilterProvider);
    _writePending = true;
    state = AsyncData(
      AdminOrdersState(
        page: current.page,
        items: current.items,
        appendError: current.appendError,
        updatingId: id,
      ),
    );
    try {
      return await _serialize(() async {
        if (generation != _generation) return false;
        _require(Permissions.ordersUpdate);
        final latest = state.valueOrNull;
        if (state.hasError || latest == null) return false;
        final actual = latest.items.where((o) => o.id == id).firstOrNull;
        if (actual == null || actual.status != expectedStatus) {
          state = AsyncData(
            AdminOrdersState(
              page: latest.page,
              items: latest.items,
              appendError: latest.appendError,
            ),
          );
          throw const AppFailure(FailureKind.validation);
        }
        try {
          final updated = await ref
              .read(adminOrderRepositoryProvider)
              .updateStatus(id, status);
          if (generation != _generation) return false;
          if (updated.id != id) throw const AppFailure(FailureKind.server);
          // Restart pagination: removing a record from a status filter shifts
          // subsequent offsets. A reload error must never retry a saved PATCH.
          await _reload(generation, query);
          return generation == _generation;
        } catch (_) {
          if (generation != _generation) return false;
          state = AsyncData(
            AdminOrdersState(
              page: latest.page,
              items: latest.items,
              appendError: latest.appendError,
            ),
          );
          rethrow;
        }
      });
    } finally {
      if (token == _writeToken) _writePending = false;
    }
  }
}

final adminOrdersProvider =
    AsyncNotifierProvider<AdminOrdersController, AdminOrdersState>(
      AdminOrdersController.new,
    );

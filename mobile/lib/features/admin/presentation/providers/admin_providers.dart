import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../catalog/data/catalog_repository_mock.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../data/admin_repository_mock.dart';
import '../../data/admin_repository_remote.dart';
import '../../domain/admin_repository.dart';

final adminRepositoryProvider = Provider<AdminRepository>((ref) {
  final catalog = ref.watch(catalogRepositoryProvider);
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => AdminRepositoryMock(
      catalog: catalog is CatalogRepositoryMock ? catalog : null,
    ),
    DataSource.remote => AdminRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

final adminSessionProvider = Provider((ref) {
  final session = ref.watch(sessionControllerProvider).valueOrNull;
  return (
    id: session?.user?.id,
    staff: session?.isSignedIn == true && session?.role == UserRole.staff,
    permissions: (session?.permissions ?? []).join('|'),
  );
});

bool adminCan(Ref ref, String permission) {
  final session = ref.read(sessionControllerProvider).valueOrNull;
  return session?.isSignedIn == true &&
      session?.role == UserRole.staff &&
      session?.can(permission) == true;
}

class AdminQuery {
  const AdminQuery(
    this.resource, {
    this.text = '',
    this.role,
    this.warehouseId,
  });
  final AdminResource resource;
  final String text;
  final String? role, warehouseId;
  @override
  bool operator ==(Object other) =>
      other is AdminQuery &&
      resource == other.resource &&
      text == other.text &&
      role == other.role &&
      warehouseId == other.warehouseId;
  @override
  int get hashCode => Object.hash(resource, text, role, warehouseId);
}

class AdminList {
  const AdminList(
    this.page,
    this.items, {
    this.loadingMore = false,
    this.appendError,
  });
  final AdminPage page;
  final List<AdminRecord> items;
  final bool loadingMore;
  final Object? appendError;
}

class AdminListController
    extends AutoDisposeFamilyAsyncNotifier<AdminList, AdminQuery> {
  int _generation = 0;
  bool _saving = false;
  @override
  Future<AdminList> build(AdminQuery arg) async {
    ref.watch(adminSessionProvider);
    final repo = ref.watch(adminRepositoryProvider);
    ++_generation;
    _saving = false;
    ref.onDispose(() => _generation++);
    _require(arg.resource.readPermission);
    final page = await _fetch(repo, 1);
    return AdminList(page, page.items);
  }

  void _require(String permission) {
    if (!adminCan(ref, permission)) throw const AppFailure.unauthorized();
  }

  Future<AdminPage> _fetch(AdminRepository repo, int number) async {
    final page = await repo.fetch(
      arg.resource,
      page: number,
      perPage: 20,
      query: arg.text,
      role: arg.role,
      warehouseId: arg.warehouseId,
    );
    if (page.page != number ||
        page.perPage <= 0 ||
        (page.items.isEmpty && (number - 1) * page.perPage < page.total)) {
      throw const AppFailure(FailureKind.server);
    }
    return page;
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    try {
      await future;
    } catch (_) {
      /* The list renders the error and retry. */
    }
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (state.isLoading ||
        state.hasError ||
        current == null ||
        current.loadingMore ||
        !current.page.hasMore ||
        _saving) {
      return;
    }
    final generation = _generation;
    state = AsyncData(
      AdminList(current.page, current.items, loadingMore: true),
    );
    try {
      final page = await _fetch(
        ref.read(adminRepositoryProvider),
        current.page.page + 1,
      );
      if (generation != _generation) return;
      final items = {for (final item in current.items) item.id: item};
      for (final item in page.items) {
        items[item.id] = item;
      }
      state = AsyncData(AdminList(page, List.unmodifiable(items.values)));
    } catch (error) {
      if (generation == _generation) {
        state = AsyncData(
          AdminList(current.page, current.items, appendError: error),
        );
      }
    }
  }

  Future<bool> save(Map<String, dynamic> input, {String? id}) => _write(
    () => ref.read(adminRepositoryProvider).save(arg.resource, input, id: id),
  );
  Future<bool> delete(String id) =>
      _write(() => ref.read(adminRepositoryProvider).delete(arg.resource, id));
  Future<bool> _write(Future<Object?> Function() operation) async {
    _require(arg.resource.writePermission);
    if (_saving) return false;
    final generation = _generation;
    _saving = true;
    try {
      await operation();
      if (generation != _generation) return false;
      // A successful write stays successful even if the subsequent GET fails.
      ref.invalidate(adminLookupsProvider);
      if (arg.resource == AdminResource.roles) {
        ref.invalidate(adminListProvider);
      }
      if (arg.resource == AdminResource.products ||
          arg.resource == AdminResource.categories) {
        ref.invalidate(categoriesProvider);
        ref.invalidate(categoryFeedProvider);
        ref.invalidate(productProvider);
      }
      ref.invalidateSelf();
      return true;
    } catch (_) {
      if (generation != _generation) return false;
      rethrow;
    } finally {
      if (generation == _generation) _saving = false;
    }
  }
}

final adminListProvider =
    AutoDisposeAsyncNotifierProvider.family<
      AdminListController,
      AdminList,
      AdminQuery
    >(AdminListController.new);

/// Complete options for pickers: a later-page role/location must be selectable.
final adminLookupsProvider = FutureProvider.autoDispose
    .family<List<AdminRecord>, AdminQuery>((ref, query) async {
      ref.watch(adminSessionProvider);
      if (!adminCan(ref, query.resource.readPermission)) {
        throw const AppFailure.unauthorized();
      }
      final repo = ref.watch(adminRepositoryProvider);
      final items = <String, AdminRecord>{};
      var disposed = false;
      ref.onDispose(() => disposed = true);
      for (var number = 1; ; number++) {
        final page = await repo.fetch(
          query.resource,
          page: number,
          perPage: 20,
          warehouseId: query.warehouseId,
        );
        if (disposed) return const [];
        if (page.page != number ||
            page.perPage <= 0 ||
            (page.items.isEmpty && (number - 1) * page.perPage < page.total)) {
          throw const AppFailure(FailureKind.server);
        }
        for (final item in page.items) {
          items[item.id] = item;
        }
        if (!page.hasMore) break;
      }
      return List.unmodifiable(items.values);
    });

class WarehouseSelection {
  const WarehouseSelection({this.warehouse, this.location});
  final AdminRecord? warehouse, location;
}

class WarehouseSelectionController extends Notifier<WarehouseSelection> {
  @override
  WarehouseSelection build() {
    ref.watch(adminSessionProvider);
    return const WarehouseSelection();
  }

  void selectWarehouse(AdminRecord warehouse) {
    if (!adminCan(ref, AdminResource.warehouses.readPermission) ||
        !warehouse.flag('is_active')) {
      throw const AppFailure.unauthorized();
    }
    if (state.warehouse?.id != warehouse.id) {
      state = WarehouseSelection(warehouse: warehouse);
    }
  }

  void selectLocation(AdminRecord location) {
    if (!adminCan(ref, AdminResource.locations.readPermission) ||
        state.warehouse?.id != location.text('warehouse_id')) {
      throw const AppFailure(FailureKind.validation);
    }
    state = WarehouseSelection(warehouse: state.warehouse, location: location);
  }
}

final warehouseSelectionProvider =
    NotifierProvider<WarehouseSelectionController, WarehouseSelection>(
      WarehouseSelectionController.new,
    );

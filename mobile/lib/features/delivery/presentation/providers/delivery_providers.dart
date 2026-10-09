import '../../../../core/storage/pending_request_store.dart';
import '../../domain/delivery_collection_input.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/storage/session_credentials.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/delivery.dart';
import '../../data/delivery_repository_mock.dart';
import '../../data/delivery_repository_remote.dart';
import '../../domain/delivery_repository.dart';

final _agentProvider = Provider((ref) {
  final session = ref.watch(sessionControllerProvider).value;
  return (
    id: session?.user?.id,
    revision: ref.watch(sessionCredentialsProvider).revision,
    allowed: session?.isSignedIn == true && session?.role == UserRole.delivery,
  );
});

final deliveryRepositoryProvider = Provider<DeliveryRepository>((ref) {
  final agent = ref.watch(_agentProvider);
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => DeliveryRepositoryMock(agentId: agent.id ?? ''),
    DataSource.remote => DeliveryRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// Like monitor filters, the selection belongs to the current work account.
class DeliveryStatusFilter extends Notifier<String?> {
  @override
  String? build() {
    ref.watch(_agentProvider);
    return null;
  }

  void select(String? status) {
    if (status != null && !Delivery.statuses.contains(status)) {
      throw const AppFailure(FailureKind.validation);
    }
    if (status != state) state = status;
  }
}

final deliveryStatusFilterProvider =
    NotifierProvider<DeliveryStatusFilter, String?>(DeliveryStatusFilter.new);

class DeliveryListState {
  const DeliveryListState({
    required this.page,
    required this.items,
    this.loadingMore = false,
    this.loadMoreError,
    this.updatingId,
  });
  final DeliveryPage page;
  final List<Delivery> items;
  final bool loadingMore;
  final Object? loadMoreError;
  final String? updatingId;
  bool get hasMore =>
      page.data.isNotEmpty && page.page * page.perPage < page.total;
}

class DeliveriesController extends AsyncNotifier<DeliveryListState> {
  static const _perPage = 20;
  int _generation = 0;
  int? _refreshGeneration;

  /// Refreshing the same query keeps data; a new account or filter must reload.
  bool get isRefreshing => _refreshGeneration == _generation && state.isLoading;

  Future<void> _operations = Future.value();
  final _updating = <Object>{};

  @override
  Future<DeliveryListState> build() async {
    final agent = ref.watch(_agentProvider);
    final repo = ref.watch(deliveryRepositoryProvider);
    final status = ref.watch(deliveryStatusFilterProvider);
    ++_generation;
    _operations = Future.value();
    ref.onDispose(() => _generation++);
    if (!agent.allowed) throw const AppFailure.unauthorized();
    final page = await _fetch(repo, 1, status);
    return DeliveryListState(page: page, items: List.unmodifiable(page.data));
  }

  Future<DeliveryPage> _fetch(
    DeliveryRepository repo,
    int number,
    String? status,
  ) async {
    final page = await repo.fetchAssigned(
      status: status,
      page: number,
      perPage: _perPage,
    );
    if (page.page != number ||
        page.perPage != _perPage ||
        (page.data.isEmpty && (number - 1) * _perPage < page.total)) {
      throw const AppFailure(FailureKind.server);
    }
    return page;
  }

  Future<void> _reload(int generation) async {
    _refreshGeneration = generation;
    state = const AsyncLoading<DeliveryListState>();
    try {
      final page = await _fetch(
        ref.read(deliveryRepositoryProvider),
        1,
        ref.read(deliveryStatusFilterProvider),
      );
      if (generation != _generation) return;
      state = AsyncData(
        DeliveryListState(page: page, items: List.unmodifiable(page.data)),
      );
    } catch (error, stack) {
      if (generation == _generation) state = AsyncError(error, stack);
    }
  }

  Future<void> refresh() => _enqueue(_reload, allowLoadFailure: true);

  Future<void> loadMore() {
    final current = state.value;
    if (state.isLoading ||
        state.hasError ||
        current == null ||
        current.loadingMore ||
        current.updatingId != null ||
        !current.hasMore) {
      return Future.value();
    }
    // Mark immediately so repeated scroll notifications cannot queue duplicates.
    state = AsyncData(
      DeliveryListState(
        page: current.page,
        items: current.items,
        loadingMore: true,
      ),
    );
    return _enqueue((generation) async {
      final latest = state.requireValue;
      try {
        final page = await _fetch(
          ref.read(deliveryRepositoryProvider),
          latest.page.page + 1,
          ref.read(deliveryStatusFilterProvider),
        );
        if (generation != _generation) return;
        final items = {for (final item in latest.items) item.id: item};
        for (final item in page.data) {
          items[item.id] = item;
        }
        state = AsyncData(
          DeliveryListState(page: page, items: List.unmodifiable(items.values)),
        );
      } catch (error) {
        if (generation != _generation) return;
        state = AsyncData(
          DeliveryListState(
            page: latest.page,
            items: latest.items,
            loadMoreError: error,
          ),
        );
      }
    });
  }

  String _collectionSlot(String id) => PendingRequestStore.slot(
    ref.read(appConfigProvider).apiBaseUrl,
    ref.read(_agentProvider).id!,
    'delivery',
    id,
  );

  Future<DeliveryCollectionInput?> pendingCollection(String id) async {
    final owner = ref.read(_agentProvider);
    if (!owner.allowed) throw const AppFailure.unauthorized();
    final request = await ref
        .read(pendingRequestStoreProvider)
        .read(_collectionSlot(id));
    if (!ref.mounted || ref.read(_agentProvider) != owner) {
      throw const AppFailure.unauthorized();
    }
    if (request == null) return null;
    return request.body['collection_confirmation'] == 'unconfirmed'
        ? const DeliveryCollectionInput.unconfirmed()
        : DeliveryCollectionInput.confirmed(
            request.body['collected_amount'] as String,
          );
  }

  /// Reads and writes share a queue. Durable collection intent survives filter
  /// refreshes; session/generation checks prevent publishing stale responses.
  Future<bool> updateStatus(
    String id,
    String status, {
    String? reason,
    DeliveryCollectionInput? collection,
  }) async {
    final generationAtStart = _generation;
    final key = (
      ref.read(_agentProvider),
      ref.read(sessionCredentialsProvider).revision,
      id,
    );
    if (!_updating.add(key)) return false;
    var saved = false;
    try {
      await _enqueue((generation) async {
        if (!Delivery.updateStatuses.contains(status)) {
          throw const AppFailure(FailureKind.validation);
        }
        final current = state.requireValue;
        final item = current.items.where((item) => item.id == id).firstOrNull;
        if (item == null) throw const AppFailure(FailureKind.notFound);
        final store = ref.read(pendingRequestStoreProvider);
        final slot = _collectionSlot(id);
        final previous = await store.read(slot);
        if (generation != _generation) return;
        if (previous != null &&
            (status != 'delivered' ||
                collection == null ||
                collection.confirmation !=
                    previous.body['collection_confirmation'] ||
                collection.amount != previous.body['collected_amount'])) {
          throw const AppFailure(FailureKind.conflict, code: 'PENDING_REQUEST');
        }
        if (previous == null) {
          if (item.status == status) return;
          if (item.orderVersion == null ||
              item.orderVersion! < 1 ||
              (status == 'failed' &&
                  (reason == null ||
                      reason.trim().isEmpty ||
                      reason.trim().length > 500)) ||
              !item.nextStatuses.contains(status) ||
              (status == 'delivered' && collection == null)) {
            throw const AppFailure(FailureKind.validation);
          }
          if (status == 'delivered') collection!.validate(item.amountDue);
        }
        final request = status == 'delivered'
            ? await store.prepare(
                slot,
                previous?.body ??
                    {
                      'status': status,
                      'order_version': item.orderVersion!,
                      'collection_confirmation': collection!.confirmation,
                      'collected_amount': ?collection.amount,
                    },
              )
            : null;
        if (generation != _generation) return;
        state = AsyncData(
          DeliveryListState(
            page: current.page,
            items: current.items,
            loadMoreError: current.loadMoreError,
            updatingId: id,
          ),
        );
        try {
          final updated = await ref
              .read(deliveryRepositoryProvider)
              .updateStatus(
                id,
                status,
                orderVersion:
                    (request?.body['order_version'] as int?) ??
                    item.orderVersion!,
                operationId: request?.id,
                collectionConfirmation:
                    request?.body['collection_confirmation'] as String?,
                collectedAmount: request?.body['collected_amount'] as String?,
                reason: status == 'failed' ? reason?.trim() : null,
              );
          if (updated.id != id) throw const AppFailure(FailureKind.server);
          if (request != null) await store.complete(slot, request.id);
          if (generation != _generation) return;
          state = AsyncData(
            DeliveryListState(
              page: current.page,
              items: List.unmodifiable([
                for (final item in current.items)
                  item.id == id ? updated : item,
              ]),
              loadMoreError: current.loadMoreError,
            ),
          );
          saved = true;
          // A status change alters membership and page boundaries of a filtered
          // query. Reload from page one rather than guessing the new total.
          if (previous != null ||
              ref.read(deliveryStatusFilterProvider) != null) {
            await _reload(generation);
          }
        } catch (error) {
          // Release visible busy state even when secure-storage cleanup fails.
          if (generation == _generation) state = AsyncData(current);
          try {
            if (request != null && isDefinitiveWriteRejection(error)) {
              await store.complete(slot, request.id);
            }
          } finally {
            if (generation == _generation &&
                error is AppFailure &&
                error.statusCode == 409) {
              // The server owns conflicts; refresh, never repeat automatically.
              await _reload(generation);
            }
          }
          if (generation != _generation) return;
          rethrow;
        }
      });
      return saved && generationAtStart == _generation;
    } finally {
      _updating.remove(key);
    }
  }

  Future<void> _enqueue(
    Future<void> Function(int) operation, {
    bool allowLoadFailure = false,
  }) {
    final generation = _generation;
    final task = _operations.then((_) async {
      if (generation != _generation) return;
      try {
        await future;
      } catch (_) {
        if (generation != _generation) return;
        if (!allowLoadFailure) rethrow;
      }
      if (generation != _generation) return;
      if (!ref.read(_agentProvider).allowed) {
        throw const AppFailure.unauthorized();
      }
      try {
        await operation(generation);
      } catch (_) {
        if (generation == _generation) rethrow;
      }
    });
    _operations = task.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return task;
  }
}

/// One agent-owned workspace across tab navigation. Refresh/status changes and
/// confirmed mutations reload it; identity changes discard prior generations.
final deliveriesProvider =
    AsyncNotifierProvider<DeliveriesController, DeliveryListState>(
      DeliveriesController.new,
    );

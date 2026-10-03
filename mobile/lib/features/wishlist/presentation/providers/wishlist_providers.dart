import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/wishlist_item.dart';
import '../../data/wishlist_repository_mock.dart';
import '../../data/wishlist_repository_remote.dart';
import '../../domain/wishlist_repository.dart';

/// Mock ⇄ remote switch for the wishlist.
final wishlistRepositoryProvider = Provider<WishlistRepository>((ref) {
  // The mock represents the active customer's data, just like the remote API.
  ref.watch(
    sessionControllerProvider.select(
      (s) =>
          (signedIn: s.value?.isSignedIn ?? false, userId: s.value?.user?.id),
    ),
  );
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => WishlistRepositoryMock(),
    DataSource.remote => WishlistRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// Reads the complete wishlist so heart buttons also know about products on
/// later pages. No partial result is published as a complete membership set.
class WishlistController extends AsyncNotifier<List<WishlistItem>> {
  static const _perPage = 8;
  int _generation = 0;
  int? _refreshGeneration;

  /// A manual refresh keeps visible data; a new session/repository must reload.
  bool get isRefreshing => _refreshGeneration == _generation && state.isLoading;

  Future<void> _operations = Future.value();
  final _pending = <Object, ({bool? saved, Future<void> task})>{};

  @override
  Future<List<WishlistItem>> build() async {
    final session = ref.watch(
      sessionControllerProvider.select(
        (s) =>
            (signedIn: s.value?.isSignedIn ?? false, userId: s.value?.user?.id),
      ),
    );
    final repository = ref.watch(wishlistRepositoryProvider);
    final generation = ++_generation;
    _operations = Future.value();
    ref.onDispose(() => _generation++);
    if (!session.signedIn) return const [];
    return _readAll(repository, generation);
  }

  Future<List<WishlistItem>> _readAll(
    WishlistRepository repository,
    int generation,
  ) async {
    final items = <String, WishlistItem>{};
    for (var page = 1; ; page++) {
      final result = await repository.fetchWishlist(
        page: page,
        perPage: _perPage,
      );
      if (generation != _generation) return const [];
      // Reject inconsistent paging rather than marking unseen products unsaved
      // or repeatedly requesting the same page from a broken response.
      if (result.page != page ||
          result.perPage != _perPage ||
          (result.data.isEmpty && (page - 1) * _perPage < result.total)) {
        throw const AppFailure(FailureKind.server);
      }
      for (final item in result.data) {
        items[item.productId] = item;
      }
      if (page * result.perPage >= result.total) break;
    }
    return List.unmodifiable(items.values);
  }

  bool isWishlisted(String productId) =>
      state.value?.any((w) => w.productId == productId) ?? false;

  Future<void> add(String productId) => _change(productId, saved: true);
  Future<void> remove(String productId) => _change(productId, saved: false);
  Future<void> toggle(String productId) => _change(productId);

  Future<void> _change(String productId, {bool? saved}) {
    final key = (_generation, productId);
    final previous = _pending[key];
    if (previous != null && previous.saved == saved) return previous.task;
    late final Future<void> task;
    task = _write(productId, saved: saved).whenComplete(() {
      if (identical(_pending[key]?.task, task)) _pending.remove(key);
    });
    _pending[key] = (saved: saved, task: task);
    return task;
  }

  Future<void> _write(String productId, {bool? saved}) => _enqueue((
    generation,
  ) async {
    if (!(ref.read(sessionControllerProvider).value?.isSignedIn ?? false)) {
      return;
    }
    final items = state.requireValue;
    final save = saved ?? !items.any((item) => item.productId == productId);
    final repository = ref.read(wishlistRepositoryProvider);
    if (save) {
      final item = await repository.add(productId);
      if (generation != _generation) return;
      // Apply the successful repository response, keeping all previously read
      // pages. Re-adding an existing item must not reorder it.
      final exists = items.any((entry) => entry.productId == productId);
      state = AsyncData(
        List.unmodifiable(
          exists
              ? [
                  for (final entry in items)
                    if (entry.productId == productId) item else entry,
                ]
              : [item, ...items],
        ),
      );
    } else {
      await repository.remove(productId);
      if (generation != _generation) return;
      state = AsyncData(
        List.unmodifiable(items.where((item) => item.productId != productId)),
      );
    }
  });

  Future<void> refresh() => _enqueue((generation) async {
    if (!(ref.read(sessionControllerProvider).value?.isSignedIn ?? false)) {
      return;
    }
    _refreshGeneration = generation;
    state = const AsyncLoading<List<WishlistItem>>();
    try {
      final items = await _readAll(
        ref.read(wishlistRepositoryProvider),
        generation,
      );
      if (generation != _generation) return;
      state = AsyncData(items);
    } catch (error, stack) {
      if (generation != _generation) return;
      state = AsyncError<List<WishlistItem>>(error, stack);
    }
  }, allowLoadFailure: true);

  /// Serialize refresh and mutations so one result cannot drop another change.
  /// A session/repository rebuild cancels queued work from the old generation.
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

final wishlistControllerProvider =
    AsyncNotifierProvider<WishlistController, List<WishlistItem>>(
      WishlistController.new,
    );

/// Whether a given product is in the wishlist — a narrow view so a heart button
/// only rebuilds when its own product's membership changes.
final isWishlistedProvider = Provider.autoDispose.family<bool, String>(
  (ref, productId) => ref.watch(
    wishlistControllerProvider.select(
      (s) => s.value?.any((w) => w.productId == productId) ?? false,
    ),
  ),
);

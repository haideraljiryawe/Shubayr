import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/address.dart';
import '../../data/address_repository_mock.dart';
import '../../data/address_repository_remote.dart';
import '../../domain/address_repository.dart';

/// Mock ⇄ remote switch for the address.
final addressRepositoryProvider = Provider<AddressRepository>((ref) {
  // The mock represents the active customer's data, just like the remote API.
  ref.watch(
    sessionControllerProvider.select(
      (s) =>
          (signedIn: s.value?.isSignedIn ?? false, userId: s.value?.user?.id),
    ),
  );
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => AddressRepositoryMock(),
    DataSource.remote => AddressRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// Loads every page before checkout resolves its default address. Mutations
/// keep the complete list and the single-default invariant in sync.
class AddressesController extends AsyncNotifier<List<Address>> {
  static const _perPage = 8;
  int _generation = 0;
  final _pending = <Object, ({Object intent, Future<void> task})>{};
  int? _refreshGeneration;

  /// A manual refresh keeps visible data; a new session/repository must reload.
  bool get isRefreshing => _refreshGeneration == _generation && state.isLoading;

  Future<void> _operations = Future.value();

  @override
  Future<List<Address>> build() async {
    final session = ref.watch(
      sessionControllerProvider.select(
        (s) =>
            (signedIn: s.value?.isSignedIn ?? false, userId: s.value?.user?.id),
      ),
    );
    final repository = ref.watch(addressRepositoryProvider);
    final generation = ++_generation;
    _operations = Future.value();
    ref.onDispose(() => _generation++);
    if (!session.signedIn) return const [];
    return _readAll(repository, generation);
  }

  Future<List<Address>> _readAll(
    AddressRepository repository,
    int generation,
  ) async {
    final items = <String, Address>{};
    for (var page = 1; ; page++) {
      final result = await repository.fetchAddresses(
        page: page,
        perPage: _perPage,
      );
      if (generation != _generation) return const [];
      // Reject incomplete or inconsistent results rather than silently hiding
      // an address (possibly the default) from checkout.
      if (result.page != page ||
          result.perPage != _perPage ||
          (result.data.isEmpty && (page - 1) * _perPage < result.total)) {
        throw const AppFailure(FailureKind.server);
      }
      for (final item in result.data) {
        items[item.id] = item;
      }
      if (page * result.perPage >= result.total) break;
    }
    return List.unmodifiable(items.values);
  }

  Future<void> add(AddressInput input) => _once(
    'add',
    jsonEncode(input.toJson()),
    () => _save((repository) => repository.createAddress(input)),
  );

  Future<void> edit(String id, AddressInput input) => _once(
    ('address', id),
    ('edit', jsonEncode(input.toJson())),
    () => _save((repository) => repository.updateAddress(id, input)),
  );

  Future<void> setDefault(Address address) => _once(
    ('address', address.id),
    'default',
    () => _save((repository) {
      final current = state.requireValue.firstWhere((a) => a.id == address.id);
      return repository.updateAddress(
        current.id,
        current.toInput(isDefault: true),
      );
    }),
  );

  Future<void> _save(Future<Address> Function(AddressRepository) save) =>
      _enqueue((generation) async {
        _requireSignedIn();
        final saved = await save(ref.read(addressRepositoryProvider));
        if (generation != _generation) return;
        final items = state.requireValue;
        // Use the saved response, preserving all pages. A confirmed new default
        // clears only the default flag on the other addresses.
        state = AsyncData(
          List.unmodifiable([
            for (final address in items)
              if (address.id == saved.id)
                saved
              else if (saved.isDefault && address.isDefault)
                address.withDefault(false)
              else
                address,
            if (!items.any((address) => address.id == saved.id)) saved,
          ]),
        );
      });

  Future<void> remove(String id) => _once(
    ('address', id),
    'remove',
    () => _enqueue((generation) async {
      _requireSignedIn();
      await ref.read(addressRepositoryProvider).deleteAddress(id);
      if (generation != _generation) return;
      state = AsyncData(
        List.unmodifiable(
          state.requireValue.where((address) => address.id != id),
        ),
      );
    }),
  );

  Future<void> _once(
    Object entity,
    Object intent,
    Future<void> Function() run,
  ) {
    final key = (_generation, entity);
    final previous = _pending[key];
    if (previous != null && previous.intent == intent) return previous.task;
    late final Future<void> task;
    task = run().whenComplete(() {
      if (identical(_pending[key]?.task, task)) _pending.remove(key);
    });
    _pending[key] = (intent: intent, task: task);
    return task;
  }

  void _requireSignedIn() {
    if (!(ref.read(sessionControllerProvider).value?.isSignedIn ?? false)) {
      throw const AppFailure.unauthorized();
    }
  }

  Future<void> refresh() => _enqueue((generation) async {
    if (!(ref.read(sessionControllerProvider).value?.isSignedIn ?? false)) {
      return;
    }
    _refreshGeneration = generation;
    state = const AsyncLoading<List<Address>>();
    try {
      final items = await _readAll(
        ref.read(addressRepositoryProvider),
        generation,
      );
      if (generation != _generation) return;
      state = AsyncData(items);
    } catch (error, stack) {
      if (generation != _generation) return;
      state = AsyncError<List<Address>>(error, stack);
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

final addressesControllerProvider =
    AsyncNotifierProvider<AddressesController, List<Address>>(
      AddressesController.new,
    );

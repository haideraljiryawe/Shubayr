import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';

import 'support/order_history_repository.dart';

void main() {
  late OrderHistoryRepository repository;
  late ProviderContainer container;

  setUp(() {
    repository = OrderHistoryRepository();
    container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [orderRepositoryProvider.overrideWithValue(repository)],
    );
  });
  tearDown(() => container.dispose());

  test(
    'loads every page in order, stops at total and avoids duplicates',
    () async {
      var list = await container.read(ordersProvider.future);
      expect(list.items, hasLength(20));
      final firstId = list.items.first.id;
      final controller = container.read(ordersProvider.notifier);
      while (list.hasMore) {
        await controller.loadMore();
        list = container.read(ordersProvider).requireValue;
      }
      expect(list.items, hasLength(52));
      expect(list.items.first.id, firstId);
      expect(list.items.map((o) => o.id).toSet(), hasLength(52));
      for (var i = 1; i < list.items.length; i++) {
        expect(
          list.items[i - 1].placedAt!.isAfter(list.items[i].placedAt!),
          isTrue,
        );
      }
      await controller.loadMore();
      expect(repository.requests.map((r) => r.page), [1, 2, 3]);
    },
  );

  test(
    'filters the repository before paging and refresh keeps the status',
    () async {
      await container.read(ordersProvider.future);
      container.read(orderStatusFilterProvider.notifier).state = 'delivered';
      var list = await container.read(ordersProvider.future);
      expect(list.items, hasLength(20));
      final controller = container.read(ordersProvider.notifier);
      await controller.loadMore();
      list = container.read(ordersProvider).requireValue;
      expect(list.items, hasLength(25));
      expect(list.items.every((o) => o.status == 'delivered'), isTrue);
      expect(list.hasMore, isFalse);
      await controller.refresh();
      expect(container.read(ordersProvider).requireValue.items, hasLength(20));
      expect(repository.requests.map((r) => (r.status, r.page)), [
        (null, 1),
        ('delivered', 1),
        ('delivered', 2),
        ('delivered', 1),
      ]);
    },
  );

  test(
    'failed append retains data and retry requests the same page once',
    () async {
      final initial = await container.read(ordersProvider.future);
      final pending = Completer<OrderPage>();
      repository.onFetch = (_) => pending.future;
      final controller = container.read(ordersProvider.notifier);
      final append = controller.loadMore();
      await controller.loadMore();
      expect(repository.requests, hasLength(2));
      pending.completeError(const AppFailure(FailureKind.network));
      await append;
      final failed = container.read(ordersProvider).requireValue;
      expect(failed.items, initial.items);
      expect(failed.loadMoreError, isA<AppFailure>());
      expect(failed.loadingMore, isFalse);
      repository.onFetch = null;
      await controller.loadMore();
      expect(container.read(ordersProvider).requireValue.items, hasLength(40));
      expect(container.read(ordersProvider).requireValue.loadMoreError, isNull);
      expect(repository.requests.map((r) => r.page), [1, 2, 2]);
    },
  );

  test(
    'refresh waits for page one and ignores an older append response',
    () async {
      await container.read(ordersProvider.future);
      final appendResponse = Completer<OrderPage>();
      final refreshResponse = Completer<OrderPage>();
      repository.onFetch = (r) =>
          r.page == 1 ? refreshResponse.future : appendResponse.future;
      final controller = container.read(ordersProvider.notifier);
      final append = controller.loadMore();
      var refreshed = false;
      final refresh = controller.refresh().then((_) => refreshed = true);
      await Future<void>.delayed(Duration.zero);
      expect(refreshed, isFalse);
      refreshResponse.complete(
        const OrderPage(total: 1, data: [Order(id: 'fresh')]),
      );
      await refresh;
      appendResponse.complete(
        const OrderPage(page: 2, total: 21, data: [Order(id: 'stale')]),
      );
      await append;
      expect(
        container.read(ordersProvider).requireValue.items.single.id,
        'fresh',
      );
    },
  );

  test(
    'late initial filter responses cannot replace the current selection',
    () async {
      final old = Completer<OrderPage>();
      repository.onFetch = (r) async => r.status == null
          ? old.future
          : const OrderPage(
              total: 1,
              data: [Order(id: 'filtered', status: 'processing')],
            );
      container.read(ordersProvider);
      container.read(orderStatusFilterProvider.notifier).state = 'processing';
      await container.read(ordersProvider.future);
      old.complete(const OrderPage(total: 1, data: [Order(id: 'old')]));
      await Future<void>.delayed(Duration.zero);
      expect(
        container.read(ordersProvider).requireValue.items.single.id,
        'filtered',
      );
    },
  );

  test(
    'switching away and back rejects an older append, including errors',
    () async {
      await container.read(ordersProvider.future);
      final old = Completer<OrderPage>();
      repository.onFetch = (_) => old.future;
      final append = container.read(ordersProvider.notifier).loadMore();
      repository.onFetch = null;
      container.read(orderStatusFilterProvider.notifier).state = 'processing';
      await container.read(ordersProvider.future);
      container.read(orderStatusFilterProvider.notifier).state = null;
      await container.read(ordersProvider.future);
      old.completeError(const AppFailure(FailureKind.network));
      await append;
      final list = container.read(ordersProvider).requireValue;
      expect(list.items, hasLength(20));
      expect(list.loadMoreError, isNull);
    },
  );

  test(
    'invalidation after cancellation and placement reloads active query',
    () async {
      container.read(orderStatusFilterProvider.notifier).state = 'pending';
      final initial = await container.read(ordersProvider.future);
      final id = initial.items.first.id;
      await repository.cancelOrder(id);
      container.invalidate(ordersProvider);
      var list = await container.read(ordersProvider.future);
      expect(list.items.any((o) => o.id == id), isFalse);
      final placed = await repository.placeOrder(addressId: 'addr-1');
      container.invalidate(ordersProvider);
      list = await container.read(ordersProvider.future);
      expect(list.items.first.id, placed.id);
      expect(
        repository.requests.every((r) => r.status == 'pending' && r.page == 1),
        isTrue,
      );
    },
  );

  test('refresh failure is exposed and can be retried', () async {
    await container.read(ordersProvider.future);
    repository.onFetch = (_) async =>
        throw const AppFailure(FailureKind.network);
    final controller = container.read(ordersProvider.notifier);
    await controller.refresh();
    expect(container.read(ordersProvider).hasError, isTrue);
    repository.onFetch = null;
    await controller.refresh();
    expect(container.read(ordersProvider).requireValue.items, hasLength(20));
  });

  test(
    'overlapping pages merge by ID and an empty page stops loading',
    () async {
      final initial = await container.read(ordersProvider.future);
      repository.onFetch = (_) async => OrderPage(
        page: 2,
        total: 60,
        data: [
          initial.items.last,
          const Order(id: 'new'),
        ],
      );
      final controller = container.read(ordersProvider.notifier);
      await controller.loadMore();
      expect(container.read(ordersProvider).requireValue.items, hasLength(21));
      repository.onFetch = (_) async => const OrderPage(page: 3, total: 100);
      await controller.loadMore();
      expect(container.read(ordersProvider).requireValue.hasMore, isFalse);
      await controller.loadMore();
      expect(repository.requests, hasLength(3));
    },
  );

  test('disposing while an append is pending ignores its completion', () async {
    await container.read(ordersProvider.future);
    final pending = Completer<OrderPage>();
    repository.onFetch = (_) => pending.future;
    final append = container.read(ordersProvider.notifier).loadMore();
    container.dispose();
    pending.complete(const OrderPage());
    await append;
    // Use a fresh container for tearDown.
    container = ProviderContainer(retry: (retryCount, error) => null);
  });
}

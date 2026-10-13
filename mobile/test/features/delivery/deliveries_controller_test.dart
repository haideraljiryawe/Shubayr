import 'package:shubayr/features/delivery/domain/delivery_collection_input.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/delivery/presentation/providers/delivery_providers.dart';
import 'support/delivery_fakes.dart';

void main() {
  late RecordingDeliveries repo;
  late DeliveryTestSession session;
  late ProviderContainer container;
  DeliveriesController controller() =>
      container.read(deliveriesProvider.notifier);
  DeliveryListState list() => container.read(deliveriesProvider).requireValue;
  setUp(() async {
    repo = RecordingDeliveries();
    session = DeliveryTestSession();
    container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [
        notificationSyncProvider.overrideWith((ref) {}),
        unreadCountProvider.overrideWith((ref) async => 0),
        dataSourceProvider.overrideWithValue(DataSource.mock),
        sessionControllerProvider.overrideWith(() => session),
        deliveryRepositoryProvider.overrideWithValue(repo),
      ],
    );
    await container.read(sessionControllerProvider.future);
  });
  tearDown(() => container.dispose());

  test(
    'duplicate delivery action never retries a failed write implicitly',
    () async {
      await container.read(deliveriesProvider.future);
      final item = list().items.firstWhere(
        (d) => d.status == 'out_for_delivery',
      );
      final gate = Completer<Delivery>();
      repo.onUpdate = (_, _) => gate.future;
      final first = controller().updateStatus(
        item.id,
        'delivered',
        collection: const DeliveryCollectionInput.unconfirmed(),
      );
      final failure = expectLater(first, throwsA(isA<StateError>()));
      expect(
        await controller().updateStatus(
          item.id,
          'delivered',
          collection: const DeliveryCollectionInput.unconfirmed(),
        ),
        isFalse,
      );
      await Future<void>.delayed(Duration.zero);
      gate.completeError(StateError('unexpected'));
      await failure;
      expect(repo.updates, hasLength(1));
      expect(list().updatingId, isNull);
      repo.onUpdate = null;
      expect(
        await controller().updateStatus(
          item.id,
          'delivered',
          collection: const DeliveryCollectionInput.unconfirmed(),
        ),
        isTrue,
      );
    },
  );

  test(
    'failure requires reason and retry sends the updated server version',
    () async {
      await container.read(deliveriesProvider.future);
      final item = list().items.firstWhere(
        (item) => item.status == 'out_for_delivery',
      );
      for (final reason in [null, '  ', 'x' * 501]) {
        await expectLater(
          controller().updateStatus(item.id, 'failed', reason: reason),
          throwsA(isA<AppFailure>()),
        );
      }
      expect(repo.updates, isEmpty);
      expect(
        await controller().updateStatus(
          item.id,
          'failed',
          reason: ' No answer ',
        ),
        isTrue,
      );
      expect(repo.versions.single, item.orderVersion);
      expect(repo.reasons.single, 'No answer');
      final failed = list().items.firstWhere((d) => d.id == item.id);
      expect(failed.failureReason, 'No answer');
      expect(failed.failedAt, isNotNull);
      expect(
        await controller().updateStatus(item.id, 'out_for_delivery'),
        isTrue,
      );
      expect(repo.versions.last, failed.orderVersion);
      expect(repo.reasons.last, isNull);
      final retried = list().items.firstWhere((d) => d.id == item.id);
      expect(retried.retryCount, 1);
      expect(retried.failureReason, isNull);
      expect(retried.failedAt, failed.failedAt);
    },
  );

  test(
    'filter is applied to every page and resets for a different agent',
    () async {
      repo.onFetch = (r) async => deliveryPage(r);
      container.read(deliveryStatusFilterProvider.notifier).select('failed');
      await container.read(deliveriesProvider.future);
      await controller().loadMore();
      expect(repo.requests.map((r) => (r.status, r.page)), [
        ('failed', 1),
        ('failed', 2),
      ]);
      expect(list().items.every((item) => item.status == 'failed'), isTrue);
      container.read(deliveryStatusFilterProvider.notifier).select('returned');
      await container.read(deliveriesProvider.future);
      expect(list().page.page, 1);
      expect(list().items, hasLength(20));
      expect(repo.requests.last.status, 'returned');
      session.setSession(
        const Session.signedIn(User(id: 'next', role: 'delivery_agent')),
      );
      await container.read(deliveriesProvider.future);
      expect(container.read(deliveryStatusFilterProvider), isNull);
      expect(repo.requests.last.status, isNull);
    },
  );

  test(
    'late append from a previous filter cannot contaminate the next one',
    () async {
      repo.onFetch = (r) async => deliveryPage(r);
      container.read(deliveryStatusFilterProvider.notifier).select('assigned');
      await container.read(deliveriesProvider.future);
      final pending = Completer<DeliveryPage>();
      repo.onFetch = (_) => pending.future;
      final oldAppend = controller().loadMore();
      await Future<void>.delayed(Duration.zero);
      repo.onFetch = (r) async => deliveryPage(r, total: 2);
      container.read(deliveryStatusFilterProvider.notifier).select('returned');
      await container.read(deliveriesProvider.future);
      pending.complete(
        deliveryPage((status: 'assigned', page: 2, perPage: 20)),
      );
      await oldAppend;
      expect(list().items, hasLength(2));
      expect(list().items.every((item) => item.status == 'returned'), isTrue);
      expect(list().page.page, 1);
      expect(list().loadingMore, isFalse);
    },
  );

  test('filtered save reloads authoritative membership and total', () async {
    container.read(deliveryStatusFilterProvider.notifier).select('assigned');
    await container.read(deliveriesProvider.future);
    expect(list().page.total, 9);
    final id = list().items.first.id;
    expect(await controller().updateStatus(id, 'out_for_delivery'), isTrue);
    expect(list().items.any((item) => item.id == id), isFalse);
    expect(list().page.total, 8);
    expect(list().page.page, 1);
    expect(list().hasMore, isFalse);
    expect(repo.requests.map((r) => r.status), ['assigned', 'assigned']);
  });

  test(
    'save remains successful when the following filtered reload fails',
    () async {
      container.read(deliveryStatusFilterProvider.notifier).select('assigned');
      await container.read(deliveriesProvider.future);
      final id = list().items.first.id;
      repo.onFetch = (_) async => throw const AppFailure.network();
      expect(await controller().updateStatus(id, 'out_for_delivery'), isTrue);
      expect(container.read(deliveriesProvider).hasError, isTrue);
      repo.onFetch = null;
      await controller().refresh();
      expect(list().page.total, 8);
      expect(repo.updates, hasLength(1));
    },
  );

  test(
    '409 refreshes current server state and still reports the rejected action',
    () async {
      await container.read(deliveriesProvider.future);
      final previous = list().items.first;
      const conflict = AppFailure(FailureKind.validation, statusCode: 409);
      repo.onUpdate = (_, _) async => throw conflict;
      repo.onFetch = (_) async => DeliveryPage(
        total: 1,
        data: [
          Delivery.fromJson({...previous.toJson(), 'status': 'failed'}),
        ],
      );
      await expectLater(
        controller().updateStatus(previous.id, 'out_for_delivery'),
        throwsA(same(conflict)),
      );
      expect(list().items.single.status, 'failed');
      expect(list().updatingId, isNull);
      expect(repo.requests, hasLength(2));
      await expectLater(
        controller().updateStatus(
          previous.id,
          'delivered',
          collection: const DeliveryCollectionInput.unconfirmed(),
        ),
        throwsA(isA<AppFailure>()),
      );
      expect(repo.updates, hasLength(1));
    },
  );

  test(
    'delivered can become returned; failed can retry; returned is terminal',
    () async {
      await container.read(deliveriesProvider.future);
      final delivered = list().items.firstWhere(
        (item) => item.status == 'delivered',
      );
      expect(await controller().updateStatus(delivered.id, 'returned'), isTrue);
      final failed = list().items.firstWhere((item) => item.status == 'failed');
      expect(
        await controller().updateStatus(failed.id, 'out_for_delivery'),
        isTrue,
      );
      for (final id in [delivered.id]) {
        await expectLater(
          controller().updateStatus(id, 'out_for_delivery'),
          throwsA(isA<AppFailure>()),
        );
      }
      expect(repo.updates, hasLength(2));
    },
  );

  test('refresh retains data, reports failure and can recover', () async {
    final previous = await container.read(deliveriesProvider.future);
    final pending = Completer<DeliveryPage>();
    repo.onFetch = (_) => pending.future;
    final notifier = controller();
    final refresh = notifier.refresh();
    await Future<void>.delayed(Duration.zero);
    expect(notifier.isRefreshing, isTrue);
    expect(container.read(deliveriesProvider).isLoading, isTrue);
    expect(container.read(deliveriesProvider).value, same(previous));
    pending.completeError(const AppFailure.network());
    await refresh;
    final failed = container.read(deliveriesProvider);
    expect(notifier.isRefreshing, isFalse);
    expect(failed.isLoading, isFalse);
    expect(failed.error, isA<AppFailure>());
    expect(failed.value, same(previous));
    repo.onFetch = (_) async =>
        deliveryPage((status: null, page: 1, perPage: 20), total: 1);
    await notifier.refresh();
    expect(container.read(deliveriesProvider).hasError, isFalse);
    expect(notifier.isRefreshing, isFalse);
  });

  test('session reload cancels an old refresh and queued work', () async {
    await container.read(deliveriesProvider.future);
    final oldPage = Completer<DeliveryPage>();
    repo.onFetch = (_) => oldPage.future;
    final notifier = controller();
    final oldRefresh = notifier.refresh();
    final queuedRefresh = notifier.refresh();
    await Future<void>.delayed(Duration.zero);
    expect(notifier.isRefreshing, isTrue);
    final newPage = Completer<DeliveryPage>();
    repo.onFetch = (_) => newPage.future;
    session.setSession(
      const Session.signedIn(User(id: 'next', role: 'delivery_agent')),
    );
    final next = container.read(deliveriesProvider.future);
    expect(notifier.isRefreshing, isFalse);
    expect(container.read(deliveriesProvider).isLoading, isTrue);
    final requests = repo.requests.length;
    oldPage.completeError(const AppFailure.network());
    await oldRefresh;
    await queuedRefresh;
    expect(repo.requests, hasLength(requests));
    expect(container.read(deliveriesProvider).hasError, isFalse);
    newPage.complete(
      deliveryPage((status: null, page: 1, perPage: 20), total: 1),
    );
    await next;
    expect(container.read(deliveriesProvider).hasError, isFalse);
    expect(notifier.isRefreshing, isFalse);
  });

  test('appends all pages once and stops at the end', () async {
    await container.read(deliveriesProvider.future);
    expect(list().items, hasLength(20));
    await Future.wait([controller().loadMore(), controller().loadMore()]);
    expect(list().items, hasLength(40));
    await controller().loadMore();
    await controller().loadMore();
    expect(list().items, hasLength(45));
    expect(list().hasMore, isFalse);
    expect(repo.requests.map((r) => r.page), [1, 2, 3]);
  });

  test('append failure retains cards and retry reads the same page', () async {
    await container.read(deliveriesProvider.future);
    repo.onFetch = (_) async => throw const AppFailure.network();
    await controller().loadMore();
    expect(list().items, hasLength(20));
    expect(list().loadMoreError, isA<AppFailure>());
    repo.onFetch = null;
    await controller().loadMore();
    expect(list().items, hasLength(40));
    expect(repo.requests.map((r) => r.page), [1, 2, 2]);
  });

  test(
    'first-page failure retries successfully and empty list cannot append',
    () async {
      repo.onFetch = (_) async => throw const AppFailure.network();
      await expectLater(
        container.read(deliveriesProvider.future),
        throwsA(isA<AppFailure>()),
      );
      repo.onFetch = (r) async => deliveryPage(r, total: 0);
      await controller().refresh();
      await controller().loadMore();
      expect(list().items, isEmpty);
      expect(repo.requests.map((r) => r.page), [1, 1]);
    },
  );

  test('saved status preserves other pages and survives refresh', () async {
    await container.read(deliveriesProvider.future);
    await controller().loadMore();
    final delivery = list().items[20];
    expect(
      await controller().updateStatus(delivery.id, 'out_for_delivery'),
      isTrue,
    );
    expect(list().items, hasLength(40));
    expect(list().items[20].status, 'out_for_delivery');
    await controller().refresh();
    await controller().loadMore();
    expect(list().items[20].status, 'out_for_delivery');
  });

  test(
    'failed status save keeps original status and next save succeeds',
    () async {
      await container.read(deliveriesProvider.future);
      final id = list().items.first.id;
      repo.onUpdate = (_, _) async => throw const AppFailure.network();
      await expectLater(
        controller().updateStatus(id, 'out_for_delivery'),
        throwsA(isA<AppFailure>()),
      );
      expect(list().items.first.status, 'assigned');
      expect(list().updatingId, isNull);
      repo.onUpdate = null;
      await controller().updateStatus(id, 'out_for_delivery');
      expect(list().items.first.status, 'out_for_delivery');
    },
  );

  test(
    'duplicate saves coalesce after first response and forbidden values never write',
    () async {
      await container.read(deliveriesProvider.future);
      final id = list().items.first.id;
      final results = await Future.wait([
        controller().updateStatus(id, 'out_for_delivery'),
        controller().updateStatus(id, 'out_for_delivery'),
      ]);
      expect(results, [true, false]);
      expect(repo.updates, hasLength(1));
      await expectLater(
        controller().updateStatus(id, 'assigned'),
        throwsA(isA<AppFailure>()),
      );
      expect(repo.updates, hasLength(1));
    },
  );

  test('refresh waits for a pending save and reads its saved result', () async {
    await container.read(deliveriesProvider.future);
    final pending = Completer<Delivery>();
    final original = list().items.first;
    repo.onUpdate = (_, _) => pending.future;
    final saving = controller().updateStatus(original.id, 'out_for_delivery');
    await Future<void>.delayed(Duration.zero);
    var refreshed = false;
    final refresh = controller().refresh().then((_) => refreshed = true);
    await Future<void>.delayed(Duration.zero);
    expect(repo.requests, hasLength(1));
    expect(refreshed, isFalse);
    final saved = Delivery.fromJson({
      ...original.toJson(),
      'status': 'out_for_delivery',
    });
    repo.onFetch = (_) async =>
        DeliveryPage(perPage: 20, total: 1, data: [saved]);
    pending.complete(saved);
    await saving;
    await refresh;
    expect(list().items.single.status, 'out_for_delivery');
  });

  test('append then status update cannot revert the updated item', () async {
    await container.read(deliveriesProvider.future);
    final pending = Completer<DeliveryPage>();
    final original = list().items.first;
    repo.onFetch = (_) => pending.future;
    final append = controller().loadMore();
    final save = controller().updateStatus(original.id, 'out_for_delivery');
    await Future<void>.delayed(Duration.zero);
    expect(repo.updates, isEmpty);
    pending.complete(
      DeliveryPage(page: 2, perPage: 20, total: 21, data: [original]),
    );
    await append;
    await save;
    expect(list().items, hasLength(20));
    expect(list().items.first.status, 'out_for_delivery');
  });

  test('inconsistent empty append becomes a retryable error', () async {
    await container.read(deliveriesProvider.future);
    repo.onFetch = (r) async =>
        DeliveryPage(page: r.page, perPage: 20, total: 45);
    await controller().loadMore();
    expect(list().loadMoreError, isA<AppFailure>());
    expect(list().items, hasLength(20));
  });

  for (final next in [
    const Session.signedOut(),
    const Session.signedIn(User(id: 'customer', role: 'customer')),
    const Session.signedIn(User(id: 'agent', role: 'order_monitor')),
  ]) {
    test(
      'denies reads and writes outside the delivery role: ${next.user?.role} ${next.user?.permissions}',
      () async {
        session.setSession(next);
        await expectLater(
          container.read(deliveriesProvider.future),
          throwsA(isA<AppFailure>()),
        );
        await expectLater(
          controller().updateStatus('d0', 'out_for_delivery'),
          throwsA(isA<AppFailure>()),
        );
        expect(repo.requests, isEmpty);
        expect(repo.updates, isEmpty);
      },
    );
  }

  test(
    'new agent is not blocked by old request or contaminated by its late error',
    () async {
      await container.read(deliveriesProvider.future);
      final pending = Completer<Delivery>();
      repo.onUpdate = (_, _) => pending.future;
      final oldSave = controller().updateStatus(
        list().items.first.id,
        'out_for_delivery',
      );
      await Future<void>.delayed(Duration.zero);
      session.setSession(
        const Session.signedIn(User(id: 'next-agent', role: 'delivery_agent')),
      );
      await container.read(deliveriesProvider.future);
      repo.onUpdate = null;
      await controller().updateStatus(
        list().items.first.id,
        'out_for_delivery',
      );
      pending.completeError(const AppFailure.network());
      expect(await oldSave, isFalse);
      expect(list().items.first.status, 'out_for_delivery');
    },
  );
}

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
    repo.onFetch = (_) async => deliveryPage((page: 1, perPage: 20), total: 1);
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
    newPage.complete(deliveryPage((page: 1, perPage: 20), total: 1));
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
        controller().updateStatus(id, 'failed'),
        throwsA(isA<AppFailure>()),
      );
      expect(list().items.first.status, 'assigned');
      expect(list().updatingId, isNull);
      repo.onUpdate = null;
      await controller().updateStatus(id, 'failed');
      expect(list().items.first.status, 'failed');
    },
  );

  test(
    'duplicate saves coalesce after first response and forbidden values never write',
    () async {
      await container.read(deliveriesProvider.future);
      final id = list().items.first.id;
      final results = await Future.wait([
        controller().updateStatus(id, 'delivered'),
        controller().updateStatus(id, 'delivered'),
      ]);
      expect(results, [true, false]);
      expect(repo.updates, hasLength(1));
      await expectLater(
        controller().updateStatus(id, 'returned'),
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
    final saving = controller().updateStatus(original.id, 'failed');
    await Future<void>.delayed(Duration.zero);
    var refreshed = false;
    final refresh = controller().refresh().then((_) => refreshed = true);
    await Future<void>.delayed(Duration.zero);
    expect(repo.requests, hasLength(1));
    expect(refreshed, isFalse);
    final saved = Delivery.fromJson({...original.toJson(), 'status': 'failed'});
    repo.onFetch = (_) async =>
        DeliveryPage(perPage: 20, total: 1, data: [saved]);
    pending.complete(saved);
    await saving;
    await refresh;
    expect(list().items.single.status, 'failed');
  });

  test('append then status update cannot revert the updated item', () async {
    await container.read(deliveriesProvider.future);
    final pending = Completer<DeliveryPage>();
    final original = list().items.first;
    repo.onFetch = (_) => pending.future;
    final append = controller().loadMore();
    final save = controller().updateStatus(original.id, 'delivered');
    await Future<void>.delayed(Duration.zero);
    expect(repo.updates, isEmpty);
    pending.complete(
      DeliveryPage(page: 2, perPage: 20, total: 21, data: [original]),
    );
    await append;
    await save;
    expect(list().items, hasLength(20));
    expect(list().items.first.status, 'delivered');
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
          controller().updateStatus('d0', 'failed'),
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
        'failed',
      );
      await Future<void>.delayed(Duration.zero);
      session.setSession(
        const Session.signedIn(User(id: 'next-agent', role: 'delivery_agent')),
      );
      await container.read(deliveriesProvider.future);
      repo.onUpdate = null;
      await controller().updateStatus(list().items.first.id, 'delivered');
      pending.completeError(const AppFailure.network());
      expect(await oldSave, isFalse);
      expect(list().items.first.status, 'delivered');
    },
  );
}

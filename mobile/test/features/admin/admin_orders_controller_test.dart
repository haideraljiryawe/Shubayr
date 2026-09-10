import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/admin/domain/admin_order_repository.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_order_providers.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'support/admin_fakes.dart';
import 'support/admin_order_fakes.dart';

void main() {
  late ProviderContainer container;
  late RecordingAdminOrders repo;
  late AdminTestSession session;
  Future<AdminOrdersState> ready() =>
      container.read(adminOrdersProvider.future);
  AdminOrdersController controller() =>
      container.read(adminOrdersProvider.notifier);
  void filter(AdminOrderQuery value) =>
      container.read(adminOrderFilterProvider.notifier).select(value);
  setUp(() async {
    repo = RecordingAdminOrders();
    session = AdminTestSession();
    container = ProviderContainer(
      overrides: [
        adminOrderRepositoryProvider.overrideWithValue(repo),
        sessionControllerProvider.overrideWith(() => session),
      ],
    );
    await container.read(sessionControllerProvider.future);
    container.listen(adminOrdersProvider, (_, _) {});
    await ready();
  });
  tearDown(() => container.dispose());
  test(
    'append failure preserves records, retry deduplicates requests, refresh starts page one',
    () async {
      repo.onRead = (_) async => throw const AppFailure.network();
      await controller().loadMore();
      expect((await ready()).items, hasLength(20));
      expect((await ready()).appendError, isA<AppFailure>());
      repo.onRead = null;
      await Future.wait([controller().loadMore(), controller().loadMore()]);
      expect((await ready()).items, hasLength(40));
      await controller().refresh();
      expect((await ready()).items, hasLength(20));
      expect(repo.reads.map((r) => r.page), [1, 2, 2, 1]);
    },
  );
  test(
    'filters restart page one and every append keeps search/status/dates',
    () async {
      final query = AdminOrderQuery(
        status: 'pending',
        search: 'Ahmed',
        from: DateTime(2026, 8, 1),
        to: DateTime(2026, 9, 9),
      );
      filter(query);
      await ready();
      await controller().loadMore();
      expect((await ready()).items, hasLength(23));
      expect(repo.reads.last.page, 2);
      expect(repo.reads.last.query, query);
      filter(const AdminOrderQuery(status: 'delivered'));
      await ready();
      expect(repo.reads.last.page, 1);
      expect(
        (await ready()).items.every((o) => o.status == 'delivered'),
        isTrue,
      );
    },
  );
  test(
    'confirmation removes pending row and restarts offsets without skipping later records',
    () async {
      filter(const AdminOrderQuery(status: 'pending'));
      await ready();
      await controller().loadMore();
      final order = (await ready()).items.first;
      expect(
        await controller().updateStatus(
          order.id,
          'confirmed',
          expectedStatus: order.status,
        ),
        isTrue,
      );
      final result = await ready();
      expect(result.page.page, 1);
      expect(result.page.total, 44);
      expect(result.items.any((o) => o.id == order.id), isFalse);
      await controller().loadMore();
      await controller().loadMore();
      expect((await ready()).items, hasLength(44));
      expect((await ready()).items.map((o) => o.id).toSet(), hasLength(44));
    },
  );
  test(
    'failed PATCH retains status and allows retry; duplicates are not queued',
    () async {
      final order = (await ready()).items.first;
      repo.onWrite = (_, _) async => throw const AppFailure.network();
      await expectLater(
        controller().updateStatus(
          order.id,
          'confirmed',
          expectedStatus: order.status,
        ),
        throwsA(isA<AppFailure>()),
      );
      expect((await ready()).items.first.status, order.status);
      final pending = Completer<Order>();
      repo.onWrite = (_, _) => pending.future;
      final save = controller().updateStatus(
        order.id,
        'confirmed',
        expectedStatus: order.status,
      );
      await Future<void>.delayed(Duration.zero);
      expect(
        await controller().updateStatus(
          order.id,
          'confirmed',
          expectedStatus: order.status,
        ),
        isFalse,
      );
      pending.complete(await repo.persist(order.id, 'confirmed'));
      expect(await save, isTrue);
      expect(repo.writes, hasLength(2));
    },
  );
  test(
    'a reload failure after PATCH remains a successful save and retry sends only GET',
    () async {
      final order = (await ready()).items.first;
      repo.onRead = (_) async => throw const AppFailure.network();
      expect(
        await controller().updateStatus(
          order.id,
          'confirmed',
          expectedStatus: order.status,
        ),
        isTrue,
      );
      expect(container.read(adminOrdersProvider).hasError, isTrue);
      repo.onRead = null;
      await controller().refresh();
      expect(repo.writes, hasLength(1));
      expect((await ready()).items.first.status, 'confirmed');
    },
  );
  test(
    'filter changed during PATCH reads after write and ignores old filter response',
    () async {
      final order = (await ready()).items.first;
      final pending = Completer<Order>();
      repo.onWrite = (_, _) => pending.future;
      final save = controller().updateStatus(
        order.id,
        'confirmed',
        expectedStatus: order.status,
      );
      await Future<void>.delayed(Duration.zero);
      filter(const AdminOrderQuery(status: 'confirmed'));
      final next = ready();
      expect(repo.reads, hasLength(1));
      pending.complete(await repo.persist(order.id, 'confirmed'));
      await save;
      expect(
        (await next).items.any(
          (o) => o.id == order.id && o.status == 'confirmed',
        ),
        isTrue,
      );
    },
  );
  test(
    'refresh during PATCH is serialized and cannot restore the old status',
    () async {
      final order = (await ready()).items.first;
      final pending = Completer<Order>();
      repo.onWrite = (_, _) => pending.future;
      final save = controller().updateStatus(
        order.id,
        'confirmed',
        expectedStatus: order.status,
      );
      await Future<void>.delayed(Duration.zero);
      final refresh = controller().refresh();
      expect(repo.reads, hasLength(1));
      pending.complete(await repo.persist(order.id, 'confirmed'));
      await save;
      await refresh;
      expect((await ready()).items.first.status, 'confirmed');
    },
  );
  test(
    'late append after changing filter cannot pollute the new list',
    () async {
      final pending = Completer<OrderPage>();
      repo.onRead = (_) => pending.future;
      final append = controller().loadMore();
      await Future<void>.delayed(Duration.zero);
      repo.onRead = null;
      filter(const AdminOrderQuery(status: 'returned'));
      final next = ready();
      pending.complete(
        const OrderPage(
          page: 2,
          perPage: 20,
          total: 21,
          data: [Order(id: 'stale')],
        ),
      );
      await append;
      expect((await next).items.every((o) => o.status == 'returned'), isTrue);
    },
  );
  test(
    'read-only and confirm-only staff cannot PATCH; customer cannot read',
    () async {
      final order = (await ready()).items.first;
      session.change(
        const Session.signedIn(
          User(
            id: 'w',
            role: 'warehouse',
            permissions: ['orders.view', 'orders.confirm'],
          ),
        ),
      );
      await ready();
      await expectLater(
        controller().updateStatus(
          order.id,
          'confirmed',
          expectedStatus: order.status,
        ),
        throwsA(isA<AppFailure>()),
      );
      expect(repo.writes, isEmpty);
      session.change(const Session.signedIn(User(id: 'c', role: 'customer')));
      await expectLater(ready(), throwsA(isA<AppFailure>()));
    },
  );
  test(
    'late write after session change is ignored and filters reset',
    () async {
      filter(const AdminOrderQuery(status: 'pending'));
      final order = (await ready()).items.first;
      final pending = Completer<Order>();
      repo.onWrite = (_, _) => pending.future;
      final save = controller().updateStatus(
        order.id,
        'confirmed',
        expectedStatus: order.status,
      );
      await Future<void>.delayed(Duration.zero);
      session.change(
        const Session.signedIn(
          User(id: 'other', role: 'warehouse', permissions: ['orders.view']),
        ),
      );
      final next = await ready();
      expect(container.read(adminOrderFilterProvider).status, isNull);
      pending.complete(
        Order.fromJson({...order.toJson(), 'status': 'confirmed'}),
      );
      expect(await save, isFalse);
      expect((await ready()).items, next.items);
    },
  );
  test(
    'refresh queued before a write rechecks the status instead of overwriting a newer state',
    () async {
      final order = (await ready()).items.first;
      final refresh = controller().refresh();
      final saved = controller().updateStatus(
        order.id,
        'confirmed',
        expectedStatus: order.status,
      );
      await repo.persist(order.id, 'cancelled');
      await refresh;
      await expectLater(saved, throwsA(isA<AppFailure>()));
      expect(repo.writes, isEmpty);
      expect((await ready()).items.first.status, 'cancelled');
    },
  );
  test('malformed page metadata produces recoverable list error', () async {
    repo.onRead = (_) async => const OrderPage(page: 2, perPage: 20, total: 99);
    await controller().refresh();
    expect(container.read(adminOrdersProvider).hasError, isTrue);
    repo.onRead = null;
    await controller().refresh();
    expect((await ready()).items, hasLength(20));
  });
  test(
    'wrong response identity and outdated dialog status do not change records',
    () async {
      final order = (await ready()).items.first;
      await expectLater(
        controller().updateStatus(
          order.id,
          'confirmed',
          expectedStatus: 'delivered',
        ),
        throwsA(isA<AppFailure>()),
      );
      expect(repo.writes, isEmpty);
      repo.onWrite = (_, _) async =>
          const Order(id: 'wrong', status: 'confirmed');
      await expectLater(
        controller().updateStatus(
          order.id,
          'confirmed',
          expectedStatus: order.status,
        ),
        throwsA(isA<AppFailure>()),
      );
      expect((await ready()).items.first.status, order.status);
    },
  );
}

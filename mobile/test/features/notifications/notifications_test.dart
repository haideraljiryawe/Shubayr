import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/notifications/data/notification_repository.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import '../../helpers/test_session.dart';

Map<String, dynamic> notification(
  String id, {
  bool read = false,
  String role = 'order_monitor',
}) => {
  'id': id,
  'target_role': role,
  'title_ar': 'طلب جديد',
  'title_en': 'New order',
  'body_ar': 'وصل طلب جديد',
  'body_en': 'An order arrived',
  'entity_type': 'order',
  'entity_id': 'order-1',
  'deep_link': 'https://untrusted.example/',
  'created_at': '2026-09-28T10:00:00Z',
  'read_at': read ? '2026-09-28T10:10:00Z' : null,
};

class InboxRepository extends NotificationRepository {
  InboxRepository() : super(ApiClient(Dio()));
  final reads = <String>[];
  bool readOnOtherDevice = false;
  Completer<void>? pendingRead;
  @override
  Future<InboxPage> fetch({int page = 1}) async => InboxPage.fromJson({
    'page': page,
    'total': 2,
    'data': [
      notification('1', read: readOnOtherDevice || reads.contains('1')),
      notification('2', read: reads.contains('2')),
    ],
  });
  @override
  Future<int> unreadCount() async => 2 - reads.length;
  @override
  Future<void> read(String id) async {
    await pendingRead?.future;
    reads.add(id);
  }
}

void main() {
  test('two markRead callers coalesce the same entity mutation', () async {
    final repo = InboxRepository()..pendingRead = Completer<void>();
    final c = ProviderContainer(
      overrides: [
        sessionControllerProvider.overrideWith(
          () => TestSession(initial: monitorSession),
        ),
        notificationRepositoryProvider.overrideWithValue(repo),
      ],
    );
    addTearDown(c.dispose);
    await c.read(sessionControllerProvider.future);
    final state = await c.read(inboxProvider.future);
    final controller = c.read(inboxProvider.notifier);
    final a = controller.markRead(state.items.first);
    final b = controller.markRead(state.items.first);
    repo.pendingRead!.complete();
    expect(await a, isTrue);
    expect(await b, isTrue);
    expect(repo.reads, ['1']);
  });

  test('deep links are rebuilt for the authenticated role only', () {
    final monitor = InboxNotification.fromJson(notification('1'));
    expect(monitor.destination(UserRole.monitor), '/monitor/orders/order-1');
    expect(monitor.destination(UserRole.customer), isNull);
    expect(monitor.destination(UserRole.delivery), isNull);
    expect(
      InboxNotification.fromJson(
        notification('2', role: 'customer'),
      ).destination(UserRole.customer),
      '/orders/order-1',
    );
    expect(
      InboxNotification.fromJson(
        notification('3', role: 'delivery_agent'),
      ).destination(UserRole.delivery),
      '/delivery',
    );
  });
  test(
    'remote inbox, badge and reading one item follow the contract',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              requests.add(r);
              h.resolve(
                Response(
                  requestOptions: r,
                  data: r.path.endsWith('unread-count')
                      ? {'unread_count': 2}
                      : r.method == 'PATCH'
                      ? {'id': '1', 'read_at': '2026-09-28T10:00:00Z'}
                      : {
                          'page': 1,
                          'total': 2,
                          'data': [notification('1'), notification('2')],
                        },
                ),
              );
            },
          ),
        );
      final repo = NotificationRepository(ApiClient(dio));
      expect((await repo.fetch()).items, hasLength(2));
      expect(await repo.unreadCount(), 2);
      expect(requests.every((r) => r.method == 'GET'), isTrue);
      await repo.read('1');
      expect(requests.last.method, 'PATCH');
      expect(requests.last.path, '/me/notifications/1/read');
      expect(requests.where((r) => r.path.endsWith('read-all')), isEmpty);
    },
  );
  test(
    'arrival never reads an item; other-device read state syncs without deleting history',
    () async {
      final repo = InboxRepository();
      final container = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(
            () => TestSession(initial: monitorSession),
          ),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      final initial = await container.read(inboxProvider.future);
      expect(repo.reads, isEmpty);
      repo.readOnOtherDevice = true;
      await container.read(inboxProvider.notifier).sync();
      final synced = container.read(inboxProvider).requireValue;
      expect(synced.items, hasLength(2));
      expect(synced.items.first.readAt, isNotNull);
      expect(synced.items.last.readAt, isNull);
      await container.read(inboxProvider.notifier).markRead(initial.items.last);
      await container.read(inboxProvider.future);
      expect(repo.reads, ['2']);
    },
  );
  test(
    'a late mark-read response cannot navigate a newly signed-in account',
    () async {
      final repo = InboxRepository()..pendingRead = Completer<void>();
      final session = TestSession(initial: monitorSession);
      final container = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      final initial = await container.read(inboxProvider.future);
      final pending = container
          .read(inboxProvider.notifier)
          .markRead(initial.items.first);
      session.setSession(customerSession);
      repo.pendingRead!.complete();
      expect(await pending, isFalse);
    },
  );
}

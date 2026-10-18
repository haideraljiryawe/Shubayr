import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/notifications/data/notification_repository.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import '../../helpers/test_session.dart';
import 'notifications_test.dart' show notification;

class _BulkInbox extends NotificationRepository {
  _BulkInbox() : super(ApiClient(Dio()));
  final pending = Completer<void>();
  int writes = 0, singleWrites = 0, fetches = 0, badgeReads = 0;
  bool done = false, newArrival = false;
  @override
  Future<InboxPage> fetch({int page = 1}) async {
    fetches++;
    return InboxPage.fromJson({
      'page': page,
      'total': 45,
      'data': [notification('1', read: done, role: 'customer')],
    });
  }

  @override
  Future<int> unreadCount() async {
    badgeReads++;
    return done ? (newArrival ? 1 : 0) : 45;
  }

  @override
  Future<void> readAll() async {
    writes++;
    await pending.future;
    done = true;
  }

  @override
  Future<void> read(String id) async {
    singleWrites++;
  }
}

void main() {
  test('bulk API uses one PATCH without page IDs or a request body', () async {
    final requests = <RequestOptions>[];
    final dio = Dio()
      ..interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) {
            requests.add(r);
            h.resolve(
              Response(
                requestOptions: r,
                data: {'updated': 45, 'read_at': '2026-10-18T12:00:00Z'},
              ),
            );
          },
        ),
      );
    await NotificationRepository(ApiClient(dio)).readAll();
    expect(requests, hasLength(1));
    expect(requests.single.method, 'PATCH');
    expect(requests.single.path, '/me/notifications/read-all');
    expect(requests.single.data, isNull);
  });

  for (final newArrival in [false, true]) {
    test(
      'bulk coalesces calls and refetches authoritative badge arrival=$newArrival',
      () async {
        final repo = _BulkInbox()..newArrival = newArrival;
        final c = ProviderContainer(
          overrides: [
            sessionControllerProvider.overrideWith(TestSession.new),
            notificationRepositoryProvider.overrideWithValue(repo),
          ],
        );
        addTearDown(c.dispose);
        final inbox = c.listen(inboxProvider, (_, _) {});
        final badge = c.listen(unreadCountProvider, (_, _) {});
        addTearDown(inbox.close);
        addTearDown(badge.close);
        await c.read(sessionControllerProvider.future);
        await c.read(inboxProvider.future);
        expect(await c.read(unreadCountProvider.future), 45);
        final controller = c.read(inboxProvider.notifier);
        final first = controller.markAllRead();
        final second = controller.markAllRead();
        expect(repo.writes, 1);
        expect(repo.singleWrites, 0);
        repo.pending.complete();
        expect(await first, isTrue);
        expect(await second, isTrue);
        expect(
          (await c.read(inboxProvider.future)).items.single.readAt,
          isNotNull,
        );
        expect(await c.read(unreadCountProvider.future), newArrival ? 1 : 0);
        // Reopening the list reads persisted server state, not a local-only flag.
        c.invalidate(inboxProvider);
        expect(
          (await c.read(inboxProvider.future)).items.single.readAt,
          isNotNull,
        );
      },
    );
  }

  test('failure retains unread state and allows retry', () async {
    final repo = _BulkInbox();
    final c = ProviderContainer(
      overrides: [
        sessionControllerProvider.overrideWith(TestSession.new),
        notificationRepositoryProvider.overrideWithValue(repo),
      ],
    );
    addTearDown(c.dispose);
    final sub = c.listen(inboxProvider, (_, _) {});
    addTearDown(sub.close);
    await c.read(sessionControllerProvider.future);
    await c.read(inboxProvider.future);
    final controller = c.read(inboxProvider.notifier);
    final first = controller.markAllRead();
    final failure = expectLater(first, throwsA(isA<StateError>()));
    repo.pending.completeError(StateError('test failure'));
    await failure;
    expect(c.read(inboxProvider).requireValue.items.single.readAt, isNull);
    expect(await c.read(unreadCountProvider.future), 45);
    await expectLater(controller.markAllRead(), throwsA(isA<StateError>()));
    expect(repo.writes, 2);
  });

  test(
    'completion from a previous account does not invalidate new account',
    () async {
      final repo = _BulkInbox();
      final c = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(TestSession.new),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(c.dispose);
      final sub = c.listen(inboxProvider, (_, _) {});
      addTearDown(sub.close);
      await c.read(sessionControllerProvider.future);
      await c.read(inboxProvider.future);
      final pending = c.read(inboxProvider.notifier).markAllRead();
      (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
        monitorSession,
      );
      await c.read(inboxProvider.future);
      final reads = repo.fetches;
      repo.pending.complete();
      expect(await pending, isFalse);
      expect(repo.fetches, reads);
    },
  );

  test(
    'leaving inbox during a write still refreshes the shared badge',
    () async {
      final repo = _BulkInbox();
      final c = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(TestSession.new),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(c.dispose);
      final inbox = c.listen(inboxProvider, (_, _) {});
      final badge = c.listen(unreadCountProvider, (_, _) {});
      addTearDown(badge.close);
      await c.read(sessionControllerProvider.future);
      await c.read(inboxProvider.future);
      expect(await c.read(unreadCountProvider.future), 45);
      final pending = c.read(inboxProvider.notifier).markAllRead();
      inbox.close();
      await c.pump();
      repo.pending.complete();
      expect(await pending, isTrue);
      expect(await c.read(unreadCountProvider.future), 0);
    },
  );

  test('signed-out callers cannot send the bulk mutation', () async {
    final repo = _BulkInbox();
    final c = ProviderContainer(
      overrides: [
        sessionControllerProvider.overrideWith(
          () => TestSession(initial: const Session.signedOut()),
        ),
        notificationRepositoryProvider.overrideWithValue(repo),
      ],
    );
    addTearDown(c.dispose);
    await c.read(sessionControllerProvider.future);
    expect(await c.read(inboxProvider.notifier).markAllRead(), isFalse);
    expect(repo.writes, 0);
  });
}

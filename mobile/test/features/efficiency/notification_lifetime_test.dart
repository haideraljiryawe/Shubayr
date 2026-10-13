import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/notifications/data/notification_repository.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import '../../helpers/test_session.dart';
import '../notifications/notifications_test.dart' show InboxRepository;

class CountingInbox extends InboxRepository {
  int fetches = 0;
  int badges = 0;
  @override
  Future<int> unreadCount() async => ++badges;
  Future<InboxPage> Function(int)? onFetch;
  @override
  Future<InboxPage> fetch({int page = 1}) {
    fetches++;
    return onFetch?.call(page) ?? super.fetch(page: page);
  }
}

void main() {
  testWidgets(
    'closing inbox releases state and badge polling never fetches inbox pages',
    (tester) async {
      final repo = CountingInbox();
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
      c.listen(notificationSyncProvider, (_, _) {});
      c.listen(unreadCountProvider, (_, _) {});
      final inbox = c.listen(inboxProvider, (_, _) {});
      await tester.pump();
      expect(repo.fetches, 1);
      inbox.close();
      await tester.pump();
      await tester.pump(const Duration(seconds: 30));
      expect(repo.fetches, 1);
      expect(c.exists(inboxProvider), isFalse);
      expect(repo.badges, 2);
      c.dispose();
    },
  );
  testWidgets(
    'visible inbox polls, pauses, resumes, stops on logout and reloads for B',
    (tester) async {
      final repo = CountingInbox();
      final session = TestSession(initial: monitorSession);
      final c = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      await c.read(sessionControllerProvider.future);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      c.listen(notificationSyncProvider, (_, _) {});
      final data = c.listen(inboxProvider, (_, _) {});
      var visible = c.listen(inboxSyncProvider, (_, _) {});
      await tester.pump();
      expect(repo.fetches, 1);
      await tester.pump(const Duration(seconds: 30));
      expect(repo.fetches, 2);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 90));
      expect(repo.fetches, 2);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(repo.fetches, 3);
      visible.close();
      data.close();
      await tester.pump();
      await tester.pump(const Duration(seconds: 60));
      expect(repo.fetches, 3);
      visible = c.listen(inboxSyncProvider, (_, _) {});
      await tester.pump();
      expect(repo.fetches, 4);
      session.setSession(const Session.signedOut());
      await tester.pump();
      await tester.pump(const Duration(seconds: 60));
      expect(repo.fetches, 4);
      session.setSession(
        const Session.signedIn(User(id: 'B', role: 'order_monitor')),
      );
      await tester.pump();
      c.read(inboxSyncProvider);
      await tester.pump();
      expect(repo.fetches, 5);
      visible.close();
      c.dispose();
    },
  );

  for (final stop in ['close', 'background', 'logout']) {
    testWidgets('pending page synchronization stops after $stop', (
      tester,
    ) async {
      final repo = CountingInbox();
      repo.onFetch = (number) async =>
          InboxPage(items: [], page: number, total: 40);
      final session = TestSession(initial: monitorSession);
      final c = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      await c.read(sessionControllerProvider.future);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      final visible = c.listen(inboxSyncProvider, (_, _) {});
      await tester.pump();
      final append = c.read(inboxProvider.notifier).loadMore();
      await tester.pump();
      await append;
      expect(repo.fetches, 2);
      final pending = Completer<InboxPage>();
      repo.onFetch = (_) => pending.future;
      await tester.pump(const Duration(seconds: 30));
      expect(repo.fetches, 3);
      if (stop == 'close') visible.close();
      if (stop == 'background') {
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.inactive,
        );
      }
      if (stop == 'logout') session.setSession(const Session.signedOut());
      await tester.pump();
      pending.complete(const InboxPage(items: [], page: 1, total: 40));
      await tester.pump();
      expect(repo.fetches, 3); // No second page for the obsolete sync.
      c.dispose();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    });
  }

  testWidgets(
    'A logout B drops pending inbox response and immediately hides A state',
    (tester) async {
      final repo = CountingInbox();
      final session = TestSession(initial: monitorSession);
      final c = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      await c.read(sessionControllerProvider.future);
      c.listen(inboxProvider, (_, _) {});
      await tester.pump();
      expect(c.read(inboxProvider).requireValue.items, hasLength(2));
      final pending = Completer<InboxPage>();
      repo.onFetch = (_) => pending.future;
      final oldSync = c.read(inboxProvider.notifier).sync();
      session.setSession(const Session.signedOut());
      await tester.pump();
      repo.onFetch = (_) async => const InboxPage(items: [], page: 1, total: 0);
      session.setSession(
        const Session.signedIn(User(id: 'B', role: 'order_monitor')),
      );
      expect(c.read(inboxProvider).value?.items ?? [], isEmpty);
      await tester.pump();
      pending.complete(await InboxRepository().fetch());
      await oldSync;
      await tester.pump();
      expect(c.read(inboxProvider).requireValue.items, isEmpty);
      c.dispose();
    },
  );
  testWidgets(
    'repeating synchronization page fails without an unbounded request loop',
    (tester) async {
      final repo = CountingInbox();
      repo.onFetch = (page) async =>
          InboxPage(items: [], page: page, total: 40);
      final c = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(
            () => TestSession(initial: monitorSession),
          ),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      await c.read(sessionControllerProvider.future);
      c.listen(inboxProvider, (_, _) {});
      await tester.pump();
      final append = c.read(inboxProvider.notifier).loadMore();
      await tester.pump();
      await append;
      repo.onFetch = (_) async =>
          const InboxPage(items: [], page: 1, total: 40);
      final sync = c.read(inboxProvider.notifier).sync();
      await tester.pump();
      await sync;
      expect(repo.fetches, 4); // Initial + append + two reads, then stop.
      expect(c.read(inboxProvider).requireValue.syncError, isNotNull);
      expect(c.read(inboxProvider).requireValue.page.page, 2);
      c.dispose();
    },
  );
}

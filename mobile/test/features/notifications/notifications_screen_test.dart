import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/notifications/data/notification_repository.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/features/notifications/presentation/notifications_screen.dart';
import '../../helpers/test_session.dart';
import 'notifications_test.dart' show notification;

class _Inbox extends NotificationRepository {
  _Inbox() : super(ApiClient(Dio()));
  final reads = <String>[];
  int fetches = 0;
  @override
  Future<InboxPage> fetch({int page = 1}) async {
    fetches++;
    return InboxPage.fromJson({
      'page': page,
      'total': 2,
      'data': [notification('1', read: reads.contains('1')), notification('2')],
    });
  }

  @override
  Future<void> read(String id) async {
    reads.add(id);
  }

  @override
  Future<int> unreadCount() async => 2 - reads.length;
}

void main() {
  for (final (width, language) in [
    (390.0, 'ar'),
    (600.0, 'en'),
    (900.0, 'ar'),
    (1200.0, 'en'),
    (1536.0, 'ar'),
    (1920.0, 'en'),
  ]) {
    testWidgets(
      'inbox fits $width $language and opens only the selected notification',
      (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final repo = _Inbox();
        final router = GoRouter(
          initialLocation: '/notifications',
          routes: [
            GoRoute(
              path: '/notifications',
              builder: (_, _) => const NotificationsScreen(),
            ),
            GoRoute(
              path: '/monitor/orders/:id',
              builder: (_, _) =>
                  const Scaffold(body: Text('Order destination')),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              sessionControllerProvider.overrideWith(
                () => TestSession(initial: monitorSession),
              ),
              notificationRepositoryProvider.overrideWithValue(repo),
            ],
            child: MaterialApp.router(
              routerConfig: router,
              locale: Locale(language),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              theme: language == 'ar'
                  ? AppTheme.dark(const Brand.bundled())
                  : AppTheme.light(const Brand.bundled()),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: const TextScaler.linear(2)),
                child: child!,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(repo.reads, isEmpty);
        await tester.tap(
          find.text(language == 'ar' ? 'طلب جديد' : 'New order').first,
        );
        await tester.pumpAndSettle();
        expect(repo.reads, ['1']);
        expect(router.state.uri.path, '/monitor/orders/order-1');
      },
    );
  }
  testWidgets(
    'sync pauses in background, resumes immediately, and disposes timers',
    (tester) async {
      final repo = _Inbox();
      final container = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(
            () => TestSession(initial: monitorSession),
          ),
          notificationRepositoryProvider.overrideWithValue(repo),
        ],
      );
      await container.read(sessionControllerProvider.future);
      await container.read(inboxProvider.future);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      final sub = container.listen(notificationSyncProvider, (_, _) {});
      await tester.pump(const Duration(seconds: 30));
      expect(repo.fetches, 2);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 60));
      expect(repo.fetches, 2);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(repo.fetches, 3);
      sub.close();
      container.dispose();
      await tester.pump(const Duration(seconds: 60));
      expect(repo.fetches, 3);
    },
  );
}

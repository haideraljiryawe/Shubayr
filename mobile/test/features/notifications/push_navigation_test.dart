import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/push_notification_bridge.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/app/startup_display_controller.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/notifications/domain/push_client.dart';
import 'package:shubayr/features/notifications/presentation/push_providers.dart';

class _Ready extends StartupDisplayController {
  @override
  bool build() => false;
  void ready() => state = true;
}

const _owner = (userId: 'customer', revision: 1, locale: 'en');
void main() {
  testWidgets(
    'cold notification waits for startup, opens inbox, ignores old session events',
    (tester) async {
      final events = StreamController<OwnedPushEvent>.broadcast();
      final router = GoRouter(
        initialLocation: AppRoutes.home,
        routes: [
          GoRoute(
            path: AppRoutes.home,
            builder: (_, _) => const Scaffold(body: Text('HOME')),
          ),
          GoRoute(
            path: AppRoutes.notifications,
            builder: (_, _) => const Scaffold(body: Text('INBOX')),
          ),
        ],
      );
      final container = ProviderContainer(
        overrides: [
          pushSyncProvider.overrideWith((ref) {}),
          pushOwnerProvider.overrideWithValue(_owner),
          pushEventsProvider.overrideWith((ref) => events.stream),
          startupDisplayReadyProvider.overrideWith(_Ready.new),
          routerProvider.overrideWithValue(router),
        ],
      );
      addTearDown(() async {
        container.dispose();
        router.dispose();
        await events.close();
      });
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: router,
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            builder: (_, child) => PushNotificationBridge(child: child!),
          ),
        ),
      );
      await tester.pumpAndSettle();
      events.add((event: PushEvent.opened, owner: _owner));
      await tester.pumpAndSettle();
      expect(find.text('HOME'), findsOneWidget);
      (container.read(startupDisplayReadyProvider.notifier) as _Ready).ready();
      await tester.pumpAndSettle();
      expect(find.text('INBOX'), findsOneWidget);
      router.go(AppRoutes.home);
      await tester.pumpAndSettle();
      events.add((event: PushEvent.foreground, owner: _owner));
      await tester.pumpAndSettle();
      expect(find.text('You have a new notification.'), findsOneWidget);
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      events.add((
        event: PushEvent.opened,
        owner: (userId: 'old', revision: 0, locale: 'en'),
      ));
      await tester.pumpAndSettle();
      expect(find.text('HOME'), findsOneWidget);
    },
  );
}

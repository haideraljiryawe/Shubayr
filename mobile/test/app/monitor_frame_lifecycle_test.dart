import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import '../helpers/test_session.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/shell/monitor_frame.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

GoRouter _router() => GoRouter(
  routes: [
    for (final path in [
      '/monitor/orders',
      '/monitor/orders/example',
      '/outside',
    ])
      GoRoute(path: path, builder: (_, _) => const SizedBox.shrink()),
  ],
);

// Exercise the real delegate notification that Router/Navigator delivers. The
// navigation view is replaced by a build probe so we can reproduce a buildScope
// outside scheduler persistentCallbacks, which ordinary pump() tests miss.
void _route(GoRouter router, String path) {
  router.routerDelegate.setNewRoutePath(
    router.configuration.findMatch(Uri.parse(path)),
  );
}

class _BuildProbe extends StatefulWidget {
  const _BuildProbe({super.key});
  @override
  State<_BuildProbe> createState() => _BuildProbeState();
}

class _BuildProbeState extends State<_BuildProbe> {
  VoidCallback? _pending;
  void onNextBuild(VoidCallback action) => setState(() => _pending = action);

  @override
  Widget build(BuildContext context) => MediaQuery(
    data: MediaQuery.of(context),
    child: Builder(
      builder: (_) {
        final action = _pending;
        _pending = null;
        action?.call();
        return const Scaffold(body: Text('Page content'));
      },
    ),
  );
}

Widget _host(GoRouter router, Widget child) => ProviderScope(
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    sessionControllerProvider.overrideWith(
      () => TestSession(initial: monitorSession),
    ),
  ],
  child: MaterialApp(
    locale: const Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: AppTheme.light(const Brand.bundled()),
    home: MonitorFrame(router: router, child: child),
  ),
);

void main() {
  setUp(() {
    final view =
        TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view.physicalSize = const Size(1200, 900);
    view.devicePixelRatio = 1;
  });
  tearDown(
    () => TestWidgetsFlutterBinding.instance.platformDispatcher.views.first
        .reset(),
  );

  testWidgets(
    'route notifications during an idle buildScope never rebuild an ancestor',
    (tester) async {
      final router = _router();
      addTearDown(router.dispose);
      _route(router, '/monitor/orders');
      final probe = GlobalKey<_BuildProbeState>();
      await tester.pumpWidget(_host(router, _BuildProbe(key: probe)));
      await tester.pumpAndSettle();
      final global = find.byType(GlobalMonitorHeader);
      final originalHeader = tester.element(global);

      void notifyInsideIdleBuild(String path) {
        probe.currentState!.onNextBuild(() {
          expect(SchedulerBinding.instance.schedulerPhase, SchedulerPhase.idle);
          _route(router, path);
        });
        // Initial attachment/reassembly can build without a persistent scheduler
        // callback. Force that exact lifecycle rather than faking scheduler state.
        tester.binding.buildOwner!.buildScope(probe.currentContext! as Element);
        expect(tester.takeException(), isNull);
      }

      notifyInsideIdleBuild('/monitor/orders/example');
      expect(identical(tester.element(global), originalHeader), isTrue);
      expect(originalHeader.dirty, isFalse);
      await tester.pumpAndSettle();
      expect(router.state.uri.path, '/monitor/orders/example');
      expect(identical(tester.element(global), originalHeader), isTrue);

      // Also exercise a route that really changes global-header visibility.
      notifyInsideIdleBuild('/outside');
      expect(
        global,
        findsOneWidget,
        reason: 'Visibility changes only after build',
      );
      await tester.pumpAndSettle();
      expect(global, findsNothing);
      _route(router, '/monitor/orders');
      await tester.pumpAndSettle();
      expect(global, findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(tester.binding.hasScheduledFrame, isFalse);
    },
  );
}

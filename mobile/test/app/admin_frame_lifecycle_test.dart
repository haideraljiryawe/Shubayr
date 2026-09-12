import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/shell/admin_frame.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_hub_screen.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

import '../features/admin/support/admin_fakes.dart';

GoRouter _router() => GoRouter(
  routes: [
    for (final path in ['/admin/products', '/admin/users', '/outside'])
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
  overrides: [sessionControllerProvider.overrideWith(AdminTestSession.new)],
  child: MaterialApp(
    locale: const Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: AppTheme.light(const Brand.bundled()),
    home: AdminFrame(router: router, child: child),
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
      _route(router, '/admin/products');
      final probe = GlobalKey<_BuildProbeState>();
      await tester.pumpWidget(_host(router, _BuildProbe(key: probe)));
      await tester.pumpAndSettle();
      final global = find.byType(GlobalAdminHeader);
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

      notifyInsideIdleBuild('/admin/users');
      expect(identical(tester.element(global), originalHeader), isTrue);
      expect(originalHeader.dirty, isFalse);
      await tester.pumpAndSettle();
      expect(router.state.uri.path, '/admin/users');
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
      _route(router, '/admin/products');
      await tester.pumpAndSettle();
      expect(global, findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(tester.binding.hasScheduledFrame, isFalse);
    },
  );

  for (final locale in ['ar', 'en']) {
    testWidgets(
      'real admin navigation updates Page Header and retains Global Header $locale',
      (tester) async {
        final router = GoRouter(
          initialLocation: AppRoutes.adminCatalog,
          routes: [
            GoRoute(
              path: AppRoutes.adminCatalog,
              builder: (_, _) => const AdminHubScreen(catalog: true),
            ),
            GoRoute(
              path: AppRoutes.adminUsers,
              builder: (_, _) => const AdminHubScreen(catalog: false),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              sessionControllerProvider.overrideWith(AdminTestSession.new),
            ],
            child: MaterialApp.router(
              routerConfig: router,
              locale: Locale(locale),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              theme: AppTheme.light(const Brand.bundled()),
              builder: (context, child) =>
                  AdminFrame(router: router, child: child!),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final global = find.byType(GlobalAdminHeader);
        final headerElement = tester.element(global);
        final headerRect = tester.getRect(global);
        final labels = AppLocalizations.of(
          tester.element(find.byType(AdminHubScreen)),
        );
        final pageHeader = find.byKey(const ValueKey('admin-page-header'));
        expect(
          find.descendant(
            of: pageHeader,
            matching: find.text(labels.adminSectionCatalog),
          ),
          findsOneWidget,
        );
        router.push(AppRoutes.adminUsers);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          find.descendant(
            of: pageHeader,
            matching: find.text(labels.adminSectionUsers),
          ),
          findsOneWidget,
        );
        expect(identical(tester.element(global), headerElement), isTrue);
        expect(tester.getRect(global), headerRect);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(
          find.descendant(
            of: pageHeader,
            matching: find.text(labels.adminSectionCatalog),
          ),
          findsOneWidget,
        );
        expect(identical(tester.element(global), headerElement), isTrue);
        // MediaQuery-driven rebuilds must not turn delegate notifications into
        // ancestor rebuilds, including hot reassembly of the existing tree.
        tester.view.physicalSize = const Size(900, 1000);
        await tester.pumpAndSettle();
        final reassemble = tester.binding.reassembleApplication();
        await tester.pumpAndSettle();
        await reassemble;
        expect(
          find.descendant(
            of: pageHeader,
            matching: find.text(labels.adminSectionCatalog),
          ),
          findsOneWidget,
        );
        expect(identical(tester.element(global), headerElement), isTrue);
        expect(tester.takeException(), isNull);
        expect(tester.binding.hasScheduledFrame, isFalse);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets(
    'notifications coalesce to the latest route without rebuild loops',
    (tester) async {
      final router = _router();
      addTearDown(router.dispose);
      _route(router, '/admin/products');
      await tester.pumpWidget(_host(router, const _BuildProbe()));
      await tester.pumpAndSettle();
      final header = tester.element(find.byType(GlobalAdminHeader));
      _route(router, '/outside');
      _route(router, '/admin/users');
      _route(router, '/outside');
      _route(router, '/admin/products');
      await tester.pumpAndSettle();
      expect(
        identical(tester.element(find.byType(GlobalAdminHeader)), header),
        isTrue,
      );
      expect(header.dirty, isFalse);
      expect(tester.binding.hasScheduledFrame, isFalse);

      _route(router, '/outside');
      await tester.pumpAndSettle();
      expect(find.byType(GlobalAdminHeader), findsNothing);
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'router replacement and disposal detach listeners and pending updates',
    (tester) async {
      final oldRouter = _router(), nextRouter = _router();
      addTearDown(oldRouter.dispose);
      addTearDown(nextRouter.dispose);
      _route(oldRouter, '/admin/products');
      _route(nextRouter, '/outside');
      await tester.pumpWidget(_host(oldRouter, const _BuildProbe()));
      await tester.pumpAndSettle();
      _route(
        oldRouter,
        '/outside',
      ); // Leave an update pending across replacement.
      await tester.pumpWidget(_host(nextRouter, const _BuildProbe()));
      await tester.pumpAndSettle();
      expect(find.byType(GlobalAdminHeader), findsNothing);
      _route(oldRouter, '/admin/users');
      expect(tester.binding.hasScheduledFrame, isFalse);
      _route(nextRouter, '/admin/products');
      await tester.pumpAndSettle();
      expect(find.byType(GlobalAdminHeader), findsOneWidget);

      _route(nextRouter, '/outside'); // Dispose with a callback still queued.
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      _route(nextRouter, '/admin/users');
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.takeException(), isNull);
    },
  );
}

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/session_verification_gate.dart';
import 'package:shubayr/app/router/session_navigation_guard.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/state_views.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/data/auth_result.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

class _Repository extends AuthRepositoryMock {
  _Repository() : super(delay: Duration.zero);
  Future<User> Function()? read;
  int reads = 0;
  @override
  Future<AuthResult> verifyOtp({
    required String phone,
    required String code,
  }) async => const AuthResult(
    accessToken: 'access',
    refreshToken: 'refresh',
    user: User(id: 'mock-user', role: 'customer'),
  );
  @override
  Future<User> currentUser() {
    reads++;
    return read?.call() ??
        Future.value(const User(id: 'mock-user', role: 'customer'));
  }
}

void background(WidgetTester tester) {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
}

void resume(WidgetTester tester) {
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
}

// Mirrors the app's root Navigator and independent StatefulShellRoute branches.
// Guards are installed on each Navigator, rather than around MaterialApp.builder.
final _navigationRouterProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.listen(sessionControllerProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);
  return GoRouter(
    initialLocation: '/home',
    observers: [SessionNavigationGuard(ref)],
    refreshListenable: refresh,
    redirect: (_, state) {
      final signedIn =
          ref.read(sessionControllerProvider).asData?.value.isSignedIn == true;
      return !signedIn && state.uri.path != '/login' ? '/login' : null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const Text('guest login')),
      GoRoute(path: '/root-edit', builder: (_, _) => const _DraftPage()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => Scaffold(
          body: shell,
          bottomNavigationBar: Row(
            children: [
              TextButton(
                onPressed: () => shell.goBranch(0),
                child: const Text('Home tab'),
              ),
              TextButton(
                onPressed: () => shell.goBranch(1),
                child: const Text('Other tab'),
              ),
            ],
          ),
        ),
        branches: [
          StatefulShellBranch(
            observers: [SessionNavigationGuard(ref)],
            routes: [
              GoRoute(
                path: '/home',
                builder: (_, _) => const Text('home'),
                routes: [
                  GoRoute(path: 'edit', builder: (_, _) => const _DraftPage()),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            observers: [SessionNavigationGuard(ref)],
            routes: [
              GoRoute(path: '/other', builder: (_, _) => const Text('other')),
            ],
          ),
        ],
      ),
    ],
  );
});

class _DraftPage extends StatelessWidget {
  const _DraftPage();
  @override
  Widget build(BuildContext context) => const Scaffold(body: TextField());
}

void main() {
  testWidgets(
    'resume covers private draft, retries offline, and keeps route and form mounted',
    (tester) async {
      final repo = _Repository();
      final tokens = InMemoryTokenStore();
      final c = ProviderContainer(
        overrides: [
          dataSourceProvider.overrideWithValue(DataSource.mock),
          tokenStoreProvider.overrideWithValue(tokens),
          authRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(c.dispose);
      await c.read(sessionControllerProvider.future);
      await c
          .read(sessionControllerProvider.notifier)
          .verifyOtp(phone: '07700000000', code: '123456');
      final draft = TextEditingController();
      addTearDown(draft.dispose);
      final router = GoRouter(
        initialLocation: '/edit',
        routes: [
          GoRoute(
            path: '/edit',
            builder: (_, _) => Scaffold(
              body: Column(
                children: [
                  const Text('private account details'),
                  TextField(controller: draft),
                ],
              ),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp.router(
            routerConfig: router,
            theme: AppTheme.light(const Brand.bundled()),
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            builder: (_, child) => SessionVerificationGate(child: child!),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'unsaved address');
      final field = tester.element(find.byType(TextField));
      final first = Completer<User>();
      repo.read = () => first.future;
      background(tester);
      await tester.pump();
      expect(find.text('private account details'), findsNothing);
      expect(find.byType(TextField), findsNothing);
      expect(repo.reads, 0);
      resume(tester);
      await tester.pump();
      expect(find.byType(AppLoadingView), findsOneWidget);
      expect(repo.reads, 1);
      // A transient inactive/resumed pair (e.g. a system sheet) is not another
      // background visit and cannot start a second request.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(repo.reads, 1);
      first.completeError(const AppFailure(FailureKind.network));
      await tester.pumpAndSettle();
      expect(find.byType(AppErrorView), findsOneWidget);
      expect(find.text('private account details'), findsNothing);
      expect(draft.text, 'unsaved address');
      expect(await tokens.readRefreshToken(), isNotNull);
      expect(router.routeInformationProvider.value.uri.path, '/edit');
      repo.read = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(repo.reads, 2);
      expect(find.byType(AppErrorView), findsNothing);
      expect(find.text('private account details'), findsOneWidget);
      expect(identical(tester.element(find.byType(TextField)), field), isTrue);
      expect(draft.text, 'unsaved address');
      expect(router.routeInformationProvider.value.uri.path, '/edit');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  for (final rootOverlay in [false, true]) {
    testWidgets(
      '${rootOverlay ? 'root overlay' : 'nested branch'} Back retains drafts through verification/error, then releases; rejection redirects',
      (tester) async {
        final repo = _Repository();
        final tokens = InMemoryTokenStore();
        final c = ProviderContainer(
          overrides: [
            dataSourceProvider.overrideWithValue(DataSource.mock),
            tokenStoreProvider.overrideWithValue(tokens),
            authRepositoryProvider.overrideWithValue(repo),
          ],
        );
        addTearDown(c.dispose);
        await c.read(sessionControllerProvider.future);
        await c
            .read(sessionControllerProvider.notifier)
            .verifyOtp(phone: '07700000000', code: '123456');
        final router = c.read(_navigationRouterProvider);
        addTearDown(router.dispose);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: c,
            child: MaterialApp.router(
              routerConfig: router,
              theme: AppTheme.light(const Brand.bundled()),
              locale: const Locale('en'),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              builder: (_, child) => SessionVerificationGate(child: child!),
            ),
          ),
        );
        await tester.pumpAndSettle();
        unawaited(router.push('/home/edit'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField), 'branch draft');
        // An inactive branch retains its draft as in the real tab shell.
        await tester.tap(find.text('Other tab'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Home tab'));
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<EditableText>(find.byType(EditableText))
              .controller
              .text,
          'branch draft',
        );
        if (rootOverlay) {
          unawaited(router.push('/root-edit'));
          await tester.pumpAndSettle();
          await tester.enterText(find.byType(TextField), 'root draft');
        }
        final field = tester.element(find.byType(TextField));
        final editable = tester.widget<EditableText>(find.byType(EditableText));
        final route = ModalRoute.of(field)!;
        final pending = Completer<User>();
        repo.read = () => pending.future;
        background(tester);
        await tester.pump();
        resume(tester);
        await tester.pump();

        Future<void> expectBackBlocked() async {
          // Also covers the route disposition used by predictive/gesture Back.
          expect(route.popDisposition, RoutePopDisposition.doNotPop);
          await tester.binding.handlePopRoute();
          await tester.pump();
          expect(await Navigator.of(field).maybePop(), isTrue);
          await tester.pump();
          expect(field.mounted, isTrue);
          expect(route.isCurrent, isTrue);
          expect(
            editable.controller.text,
            rootOverlay ? 'root draft' : 'branch draft',
          );
          expect(find.byType(TextField), findsNothing);
        }

        await expectBackBlocked();
        pending.completeError(const AppFailure(FailureKind.network));
        await tester.pumpAndSettle();
        expect(find.byType(AppErrorView), findsOneWidget);
        await expectBackBlocked();
        expect(await tokens.readRefreshToken(), isNotNull);
        repo.read = null;
        await tester.tap(find.text('Retry'));
        await tester.pumpAndSettle();
        expect(
          identical(tester.element(find.byType(TextField)), field),
          isTrue,
        );
        expect(route.popDisposition, RoutePopDisposition.pop);
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(field.mounted, isFalse);
        if (rootOverlay) {
          expect(
            tester
                .widget<EditableText>(find.byType(EditableText))
                .controller
                .text,
            'branch draft',
          );
          await tester.binding.handlePopRoute();
          await tester.pumpAndSettle();
        }
        expect(find.text('home'), findsOneWidget);
        // Even the first branch page consumes Back instead of bubbling to OS.
        c.read(sessionControllerProvider.notifier).requireVerification();
        await tester.pump();
        expect(await router.routerDelegate.popRoute(), isTrue);
        await c.read(sessionControllerProvider.notifier).revalidate();
        await tester.pumpAndSettle();
        unawaited(router.push(rootOverlay ? '/root-edit' : '/home/edit'));
        await tester.pumpAndSettle();
        final rejectedField = tester.element(find.byType(TextField));
        await tester.enterText(find.byType(TextField), 'revoked account draft');
        // Redirecting out of a rejected session must remove the protected page.
        final rejected = Completer<User>();
        repo.read = () => rejected.future;
        background(tester);
        await tester.pump();
        resume(tester);
        await tester.pump();
        expect(await router.routerDelegate.popRoute(), isTrue);
        rejected.completeError(const AppFailure.unauthorized());
        await tester.pumpAndSettle();
        expect(find.text('guest login'), findsOneWidget);
        expect(rejectedField.mounted, isFalse);
        expect(find.byType(AppErrorView), findsNothing);
        expect(c.read(sessionVerificationBlockedProvider), isFalse);
        expect(await tokens.readAccessToken(), isNull);
        expect(await tokens.readRefreshToken(), isNull);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}

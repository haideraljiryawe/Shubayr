import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_order_providers.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_home_screen.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_orders_screen.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'support/admin_fakes.dart';
import 'support/admin_order_fakes.dart';

Widget host(
  RecordingAdminOrders repo, {
  String lang = 'en',
  bool dark = false,
  double scale = 1,
  AdminTestSession? session,
  GoRouter? router,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    adminOrderRepositoryProvider.overrideWithValue(repo),
    sessionControllerProvider.overrideWith(() => session ?? AdminTestSession()),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: router == null
      ? MaterialApp(
          locale: Locale(lang),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          theme: dark
              ? AppTheme.dark(const Brand.bundled())
              : AppTheme.light(const Brand.bundled()),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: const AdminOrdersScreen(),
        )
      : MaterialApp.router(
          routerConfig: router,
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          theme: AppTheme.light(const Brand.bundled()),
        ),
);
ProviderContainer container(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(AdminOrdersScreen)));
Future<void> chip(WidgetTester tester, String label) async {
  final target = find.widgetWithText(ChoiceChip, label);
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> beginConfirm(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(AppButton, 'Confirm order').first);
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  WidgetController.hitTestWarningShouldBeFatal = true;
  setUpAll(() async {
    final font = FontLoader('Cairo')
      ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
    await font.load();
  });
  testWidgets('dashboard Orders tile opens the staff list', (tester) async {
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, _) => const AdminHomeScreen()),
        GoRoute(
          path: '/admin/orders',
          builder: (_, _) => const AdminOrdersScreen(),
        ),
      ],
    );
    addTearDown(router.dispose);
    final repo = RecordingAdminOrders();
    await tester.pumpWidget(host(repo, router: router));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Orders'));
    await tester.pumpAndSettle();
    expect(find.byType(AdminOrdersScreen), findsOneWidget);
    expect(repo.reads, isNotEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('pending chips paginate all 45 matching orders', (tester) async {
    final repo = RecordingAdminOrders();
    await tester.pumpWidget(host(repo));
    await tester.pumpAndSettle();
    final l = AppLocalizations.of(
      tester.element(find.byType(AdminOrdersScreen)),
    );
    await chip(tester, l.orderStatusPending);
    await tester.scrollUntilVisible(
      find.text('SH-3043'),
      600,
      maxScrolls: 60,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expect(
      container(tester).read(adminOrdersProvider).requireValue.items,
      hasLength(45),
    );
    expect(
      repo.reads.where((r) => r.query.status == 'pending').map((r) => r.page),
      [1, 2, 3],
    );
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'search debounce and clear query use repository and empty state',
    (tester) async {
      final repo = RecordingAdminOrders();
      await tester.pumpWidget(host(repo));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'notfound');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      expect(find.text('No matching records'), findsOneWidget);
      expect(repo.reads.last.query.search, 'notfound');
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(repo.reads.last.query.search, '');
      expect(find.text('SH-3003'), findsOneWidget);
    },
  );
  testWidgets(
    'confirmation requires consent and removes row from pending filter after success',
    (tester) async {
      final repo = RecordingAdminOrders();
      await tester.pumpWidget(host(repo));
      await tester.pumpAndSettle();
      final l = AppLocalizations.of(
        tester.element(find.byType(AdminOrdersScreen)),
      );
      await chip(tester, l.orderStatusPending);
      await beginConfirm(tester);
      expect(repo.writes, isEmpty);
      await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(repo.writes, isEmpty);
      await beginConfirm(tester);
      await tester.tap(find.widgetWithText(TextButton, 'Confirm order'));
      await tester.pumpAndSettle();
      expect(repo.writes.single.status, 'confirmed');
      expect(find.text('SH-3003'), findsNothing);
      expect(find.text('Order status updated'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('failed write preserves pending order and can be retried', (
    tester,
  ) async {
    final repo = RecordingAdminOrders()
      ..onWrite = (_, _) async => throw const AppFailure.network();
    await tester.pumpWidget(host(repo));
    await tester.pumpAndSettle();
    await beginConfirm(tester);
    await tester.tap(find.widgetWithText(TextButton, 'Confirm order'));
    await tester.pumpAndSettle();
    expect(
      container(
        tester,
      ).read(adminOrdersProvider).requireValue.items.first.status,
      'pending',
    );
    expect(find.text('Order status updated'), findsNothing);
    repo.onWrite = null;
    await beginConfirm(tester);
    await tester.tap(find.widgetWithText(TextButton, 'Confirm order'));
    await tester.pumpAndSettle();
    expect(repo.writes, hasLength(2));
    expect(
      container(
        tester,
      ).read(adminOrdersProvider).requireValue.items.first.status,
      'confirmed',
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'status dialog offers contract statuses and submits selected status',
    (tester) async {
      final repo = RecordingAdminOrders();
      await tester.pumpWidget(host(repo));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppButton, 'Update status').first);
      await tester.pumpAndSettle();
      final dropdown = tester.widget<DropdownButtonFormField<String>>(
        find.byType(DropdownButtonFormField<String>),
      );
      expect(dropdown, isNotNull);
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      final l = AppLocalizations.of(
        tester.element(find.byType(AdminOrdersScreen)),
      );
      await tester.tap(find.text(l.orderStatusConfirmed).last);
      await tester.pumpAndSettle();
      expect(repo.writes, isEmpty);
      await tester.tap(find.widgetWithText(TextButton, 'Save'));
      await tester.pumpAndSettle();
      expect(repo.writes.single.status, 'confirmed');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  for (final width in [390.0, 900.0, 1920.0]) {
    testWidgets(
      'date range input and clearing filter reach the query at $width',
      (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final repo = RecordingAdminOrders();
        await tester.pumpWidget(host(repo));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Date range'));
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.edit_outlined));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField).at(1), '09/01/2026');
        await tester.enterText(find.byType(TextField).at(2), '09/09/2026');
        await tester.tap(find.text('OK'));
        await tester.pumpAndSettle();
        expect(repo.reads.last.query.from, DateTime(2026, 9, 1));
        expect(repo.reads.last.query.to, DateTime(2026, 9, 9));
        await tester.tap(find.byTooltip('Clear date filter'));
        await tester.pumpAndSettle();
        expect(repo.reads.last.query.from, isNull);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('read-only staff see orders without mutation actions', (
    tester,
  ) async {
    final repo = RecordingAdminOrders();
    final session = AdminTestSession(
      initial: const Session.signedIn(
        User(id: 'w', role: 'warehouse', permissions: ['orders.view']),
      ),
    );
    await tester.pumpWidget(host(repo, session: session));
    await tester.pumpAndSettle();
    expect(find.text('SH-3003'), findsOneWidget);
    expect(find.widgetWithText(AppButton, 'Update status'), findsNothing);
    expect(find.widgetWithText(AppButton, 'Confirm order'), findsNothing);
    session.change(const Session.signedOut());
    await tester.pumpAndSettle();
    expect(find.text('SH-3003'), findsNothing);
    expect(repo.writes, isEmpty);
  });
  testWidgets('permission lost while dialog is open blocks update', (
    tester,
  ) async {
    final repo = RecordingAdminOrders();
    final session = AdminTestSession();
    await tester.pumpWidget(host(repo, session: session));
    await tester.pumpAndSettle();
    await beginConfirm(tester);
    session.change(
      const Session.signedIn(
        User(id: 'a', role: 'warehouse', permissions: ['orders.view']),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Confirm order'));
    await tester.pumpAndSettle();
    expect(repo.writes, isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'changing staff while confirmation is open cancels the old intent',
    (tester) async {
      final repo = RecordingAdminOrders();
      final session = AdminTestSession();
      await tester.pumpWidget(host(repo, session: session));
      await tester.pumpAndSettle();
      await beginConfirm(tester);
      session.change(
        const Session.signedIn(
          User(
            id: 'another-admin',
            role: 'admin',
            permissions: ['orders.view', 'orders.update'],
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Confirm order'));
      await tester.pumpAndSettle();
      expect(repo.writes, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('initial error retries and append error retains pages', (
    tester,
  ) async {
    final repo = RecordingAdminOrders()
      ..onRead = (_) async => throw const AppFailure.network();
    await tester.pumpWidget(host(repo));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    repo.onRead = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    repo.onRead = (_) async => throw const AppFailure.network();
    await tester.scrollUntilVisible(
      find.text('Retry'),
      600,
      maxScrolls: 60,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expect(
      container(tester).read(adminOrdersProvider).requireValue.items,
      hasLength(20),
    );
    repo.onRead = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(
      container(tester).read(adminOrdersProvider).requireValue.items.length,
      greaterThanOrEqualTo(40),
    );
  });
  testWidgets('loading displays skeleton then records without stale status', (
    tester,
  ) async {
    final repo = RecordingAdminOrders();
    final pending = Completer<OrderPage>();
    repo.onRead = (_) => pending.future;
    await tester.pumpWidget(host(repo));
    await tester.pump();
    expect(find.text('SH-3003'), findsNothing);
    pending.complete(
      const OrderPage(
        data: [Order(id: 'o', orderNumber: 'SH-TEST')],
        total: 1,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('SH-TEST'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  for (final lang in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets(
        '320px $lang dark=$dark supports enlarged text, chips and dialog',
        (tester) async {
          tester.view.physicalSize = const Size(320, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final repo = RecordingAdminOrders();
          await tester.pumpWidget(host(repo, lang: lang, dark: dark, scale: 2));
          await tester.pumpAndSettle();
          final l = AppLocalizations.of(
            tester.element(find.byType(AdminOrdersScreen)),
          );
          expect(tester.takeException(), isNull);
          for (final label in [
            l.orderStatusOutForDelivery,
            l.orderStatusReturnRequested,
            l.orderStatusPending,
          ]) {
            await chip(tester, label);
            expect(tester.takeException(), isNull);
          }
          final confirm = find
              .widgetWithText(AppButton, l.adminOrderConfirm)
              .first;
          await tester.ensureVisible(confirm);
          await tester.tap(confirm);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.tap(find.widgetWithText(TextButton, l.actionCancel));
          await tester.pumpAndSettle();
        },
      );
    }
  }
}

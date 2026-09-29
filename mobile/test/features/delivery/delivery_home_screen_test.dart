import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/delivery/presentation/providers/delivery_providers.dart';
import 'package:shubayr/features/delivery/presentation/screens/delivery_home_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'support/delivery_fakes.dart';

Widget _host(
  RecordingDeliveries repo, {
  String locale = 'en',
  bool dark = false,
  double textScale = 1,
  Session session = agentSession,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    sessionControllerProvider.overrideWith(
      () => DeliveryTestSession(initial: session),
    ),
    deliveryRepositoryProvider.overrideWithValue(repo),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(textScale)),
      child: child!,
    ),
    home: const DeliveryHomeScreen(),
  ),
);

Future<void> _chooseStatus(WidgetTester tester, String status) async {
  await tester.tap(find.widgetWithText(AppButton, 'Update status').first);
  await tester.pumpAndSettle();
  await tester.tap(find.byType(DropdownButtonFormField<String>));
  await tester.pumpAndSettle();
  await tester.tap(find.text(status).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('refresh keeps content but a new session hides previous data', (
    tester,
  ) async {
    final repo = RecordingDeliveries()
      ..onFetch = (r) async => deliveryPage(r, total: 1);
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    expect(find.text('order-0'), findsOneWidget);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(DeliveryHomeScreen)),
    );
    final oldPage = Completer<DeliveryPage>();
    repo.onFetch = (_) => oldPage.future;
    final refresh = container.read(deliveriesProvider.notifier).refresh();
    await tester.pump();
    expect(find.text('order-0'), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    final newPage = Completer<DeliveryPage>();
    repo.onFetch = (_) => newPage.future;
    (container.read(sessionControllerProvider.notifier) as DeliveryTestSession)
        .setSession(
          const Session.signedIn(User(id: 'next', role: 'delivery_agent')),
        );
    await tester.pump();
    await tester.pump();
    expect(find.text('order-0'), findsNothing);
    oldPage.completeError(const AppFailure.network());
    await tester.pump();
    await refresh;
    expect(find.text('Retry'), findsNothing);
    newPage.complete(deliveryPage((page: 1, perPage: 20), total: 0));
    await tester.pumpAndSettle();
    expect(container.read(deliveriesProvider).hasError, isFalse);
    expect(find.text('order-0'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('Cairo')
      ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
    await font.load();
  });

  testWidgets(
    'scrolling reaches all 45 assigned deliveries across three pages',
    (tester) async {
      final repo = RecordingDeliveries();
      await tester.pumpWidget(_host(repo));
      await tester.pumpAndSettle();
      final last = find.text('20000000-0000-4000-8000-000000000045');
      await tester.scrollUntilVisible(last, 600, maxScrolls: 60);
      await tester.pumpAndSettle();
      expect(last, findsOneWidget);
      expect(repo.requests.map((r) => r.page), [1, 2, 3]);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'delivery confirmation survives regrouping the selected card on resize',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final repo = RecordingDeliveries();
      await tester.pumpWidget(_host(repo));
      await tester.pumpAndSettle();
      final secondAction = find
          .widgetWithText(AppButton, 'Update status')
          .at(1);
      await tester.ensureVisible(secondAction);
      await tester.tap(secondAction);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delivered').last);
      await tester.pumpAndSettle();
      await tester.binding.setSurfaceSize(const Size(1200, 1200));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Save'));
      await tester.pumpAndSettle();
      expect(repo.updates.single.id, '10000000-0000-4000-8000-000000000002');
      expect(repo.updates.single.status, 'delivered');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('status changes only after save and successful response', (
    tester,
  ) async {
    final repo = RecordingDeliveries();
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    await _chooseStatus(tester, 'Out for delivery');
    expect(repo.updates, isEmpty);
    await tester.tap(find.widgetWithText(TextButton, 'Save'));
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(DeliveryHomeScreen)),
    );
    expect(
      container.read(deliveriesProvider).requireValue.items.first.status,
      'out_for_delivery',
    );
    expect(repo.updates.single.status, 'out_for_delivery');
    expect(find.text('Delivery status updated'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'cancel sends nothing and failed save preserves the displayed status',
    (tester) async {
      final repo = RecordingDeliveries()
        ..onUpdate = (_, _) async => throw const AppFailure.network();
      await tester.pumpWidget(_host(repo));
      await tester.pumpAndSettle();
      await _chooseStatus(tester, 'Delivered');
      await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(repo.updates, isEmpty);
      await _chooseStatus(tester, 'Delivered');
      await tester.tap(find.widgetWithText(TextButton, 'Save'));
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byKey(
            const ValueKey('10000000-0000-4000-8000-000000000001'),
          ),
          matching: find.text('Assigned'),
        ),
        findsOneWidget,
      );
      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.text('Delivery status updated'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('initial error retries and loads cards', (tester) async {
    final repo = RecordingDeliveries()
      ..onFetch = (_) async => throw const AppFailure.network();
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    repo.onFetch = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Order reference'), findsWidgets);
  });

  testWidgets('append error keeps old cards and retry reaches the final page', (
    tester,
  ) async {
    final repo = RecordingDeliveries()
      ..onFetch = (r) async {
        if (r.page == 2) throw const AppFailure.network();
        return deliveryPage(r);
      };
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Retry'), 700, maxScrolls: 30);
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(DeliveryHomeScreen)),
    );
    expect(
      container.read(deliveriesProvider).requireValue.items,
      hasLength(20),
    );
    repo.onFetch = (r) async => deliveryPage(r);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('order-44'), 700, maxScrolls: 30);
    expect(repo.requests.map((r) => r.page), [1, 2, 2, 3]);
  });

  testWidgets('empty list refresh waits for the repository response', (
    tester,
  ) async {
    final repo = RecordingDeliveries()
      ..onFetch = (r) async => deliveryPage(r, total: 0);
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    expect(find.text('No assigned deliveries'), findsOneWidget);
    final pending = Completer<DeliveryPage>();
    repo.onFetch = (_) => pending.future;
    await tester.drag(find.byType(Scrollable), const Offset(0, 500));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(RefreshProgressIndicator), findsOneWidget);
    pending.complete(deliveryPage((page: 1, perPage: 20), total: 1));
    await tester.pumpAndSettle();
    expect(find.text('order-0'), findsOneWidget);
    expect(find.byType(RefreshProgressIndicator), findsNothing);
  });

  testWidgets('monitor sees no delivery list or status actions', (
    tester,
  ) async {
    final repo = RecordingDeliveries();
    await tester.pumpWidget(
      _host(
        repo,
        session: const Session.signedIn(
          User(id: 'agent', role: 'order_monitor'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Your account does not have access to assigned deliveries.'),
      findsOneWidget,
    );
    expect(repo.requests, isEmpty);
    expect(find.widgetWithText(AppButton, 'Update status'), findsNothing);
  });

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
          'cards and status dialog fit at 320, $locale, dark=$dark, scale=$scale',
          (tester) async {
            await tester.binding.setSurfaceSize(const Size(320, 950));
            addTearDown(() => tester.binding.setSurfaceSize(null));
            final repo = RecordingDeliveries();
            await tester.pumpWidget(
              _host(repo, locale: locale, dark: dark, textScale: scale),
            );
            await tester.pumpAndSettle();
            final context = tester.element(find.byType(DeliveryHomeScreen));
            final l10n = AppLocalizations.of(context);
            expect(
              Directionality.of(context),
              locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
            );
            await tester.ensureVisible(
              find.widgetWithText(AppButton, l10n.deliveryUpdateStatus).first,
            );
            await tester.tap(
              find.widgetWithText(AppButton, l10n.deliveryUpdateStatus).first,
            );
            await tester.pumpAndSettle();
            await tester.tap(find.byType(DropdownButtonFormField<String>));
            await tester.pumpAndSettle();
            await tester.tap(find.text(l10n.deliveryDelivered).last);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            await tester.tap(
              find.widgetWithText(TextButton, l10n.actionCancel),
            );
            await tester.pumpAndSettle();
            expect(repo.updates, isEmpty);
          },
        );
      }
    }
  }
}

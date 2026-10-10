import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/widgets/skeleton.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/orders_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

import 'support/order_history_repository.dart';
import '../../helpers/test_session.dart';

Widget _host(
  OrderHistoryRepository repository, {
  String locale = 'en',
  bool dark = false,
  bool active = true,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    sessionControllerProvider.overrideWith(TestSession.new),
    orderRepositoryProvider.overrideWithValue(repository),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: TickerMode(enabled: active, child: const OrdersScreen()),
  ),
);

void main() {
  testWidgets('shows an empty state when there are no orders', (tester) async {
    await tester.pumpWidget(_host(OrderHistoryRepository(orders: [])));
    await tester.pumpAndSettle();

    expect(find.text('No orders yet'), findsOneWidget);
  });

  final twoOrders = OrderPage(
    total: 2,
    data: [
      Order(
        version: 1,
        id: 'o1',
        orderNumber: 'SH-1042',
        status: 'delivered',
        total: 30000,
        placedAt: DateTime(2026, 9, 1, 0, 15).toUtc(),
      ),
      Order(
        version: 1,
        id: 'o2',
        orderNumber: 'SH-1061',
        status: 'processing',
        total: 15000,
        placedAt: DateTime(2026, 9, 5, 0, 15).toUtc(),
      ),
    ],
  );

  testWidgets('lists orders with their number, status and total', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(OrderHistoryRepository(orders: twoOrders.data)),
    );
    await tester.pumpAndSettle();

    expect(find.text('SH-1042'), findsOneWidget);
    expect(find.text('SH-1061'), findsOneWidget);
    expect(find.text('2026/09/01'), findsOneWidget);
    expect(find.text('2026/09/05'), findsOneWidget);
    // Each status label now shows on the card pill and again on its filter chip.
    expect(find.text('Delivered'), findsWidgets);
    expect(find.text('Processing'), findsWidgets);
  });

  testWidgets('a status chip filters the list to matching orders', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(OrderHistoryRepository(orders: twoOrders.data)),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('SH-1042'),
      findsOneWidget,
    ); // delivered, visible under "All"

    await tester.tap(find.widgetWithText(ChoiceChip, 'Processing'));
    await tester.pumpAndSettle();

    expect(find.text('SH-1061'), findsOneWidget); // processing stays
    expect(find.text('SH-1042'), findsNothing); // delivered filtered out
  });

  final orderScroll = find
      .descendant(
        of: find.byType(RefreshIndicator),
        matching: find.byType(Scrollable),
      )
      .first;

  testWidgets('scroll loads later pages and stops after the last order', (
    tester,
  ) async {
    final repository = OrderHistoryRepository();
    await tester.pumpWidget(_host(repository));
    await tester.pumpAndSettle();
    expect(repository.requests.map((r) => r.page), [1]);
    await tester.scrollUntilVisible(
      find.text('SH-994'),
      500,
      scrollable: orderScroll,
      maxScrolls: 40,
    );
    await tester.pumpAndSettle();
    expect(repository.requests.map((r) => r.page), [1, 2, 3]);
    await tester.drag(orderScroll, const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(repository.requests, hasLength(3));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'status finds orders beyond page one and empty filter stays usable',
    (tester) async {
      final repository = OrderHistoryRepository(
        orders: [
          for (var i = 0; i < 21; i++)
            Order(version: 1, id: 'o$i', orderNumber: 'SH-$i'),
          const Order(
            version: 1,
            id: 'later',
            orderNumber: 'SH-LATER',
            status: 'processing',
          ),
        ],
      );
      await tester.pumpWidget(_host(repository));
      await tester.pumpAndSettle();
      expect(find.text('SH-LATER'), findsNothing);
      await tester.tap(find.widgetWithText(ChoiceChip, 'Processing'));
      await tester.pumpAndSettle();
      expect(find.text('SH-LATER'), findsOneWidget);
      expect(repository.requests.last.status, 'processing');
      await tester.tap(find.widgetWithText(ChoiceChip, 'Confirmed'));
      await tester.pumpAndSettle();
      final l10n = AppLocalizations.of(
        tester.element(find.byType(OrdersScreen)),
      );
      expect(find.text(l10n.ordersFilterEmpty), findsOneWidget);
      await tester.tap(find.widgetWithText(ChoiceChip, 'All'));
      await tester.pumpAndSettle();
      expect(find.text('SH-0'), findsOneWidget);
      expect(repository.requests.last.status, isNull);
    },
  );

  testWidgets(
    'failed later page keeps cards and retries without skipping a page',
    (tester) async {
      final repository = OrderHistoryRepository();
      await tester.pumpWidget(_host(repository));
      await tester.pumpAndSettle();
      repository.onFetch = (_) async => throw const AppFailure.network();
      await tester.scrollUntilVisible(
        find.text('Retry'),
        500,
        scrollable: orderScroll,
        maxScrolls: 20,
      );
      await tester.pumpAndSettle();
      expect(find.text('SH-1026'), findsOneWidget);
      expect(repository.requests.map((r) => r.page), [1, 2]);
      await tester.drag(orderScroll, const Offset(0, -100));
      await tester.pumpAndSettle();
      expect(repository.requests, hasLength(2));
      repository.onFetch = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(repository.requests.map((r) => r.page), [1, 2, 2]);
      expect(find.text('Retry'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('initial failure retries and filters remain available', (
    tester,
  ) async {
    final repository = OrderHistoryRepository()
      ..onFetch = (_) async => throw const AppFailure.network();
    await tester.pumpWidget(_host(repository));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ChoiceChip, 'Processing'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    expect(repository.requests, hasLength(1));
    repository.onFetch = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('SH-1063'), findsOneWidget);
  });

  testWidgets('hidden orders resume with the current filter and data', (
    tester,
  ) async {
    final repository = OrderHistoryRepository(orders: twoOrders.data);
    await tester.pumpWidget(_host(repository));
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(OrdersScreen)),
    );
    await tester.pumpWidget(_host(repository, active: false));
    container.read(orderStatusFilterProvider.notifier).state = 'processing';
    await tester.pump();
    await tester.pumpWidget(_host(repository));
    await tester.pumpAndSettle();
    expect(find.text('SH-1061'), findsOneWidget);
    expect(find.text('SH-1042'), findsNothing);
    expect(container.read(orderStatusFilterProvider), 'processing');
    expect(repository.requests.last.status, 'processing');
    expect(tester.takeException(), isNull);
  });

  testWidgets('pull refresh on an empty filter waits and keeps its status', (
    tester,
  ) async {
    final repository = OrderHistoryRepository(orders: []);
    await tester.pumpWidget(_host(repository));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Processing'));
    await tester.pumpAndSettle();
    final response = Completer<OrderPage>();
    repository.onFetch = (_) => response.future;
    await tester.drag(orderScroll, const Offset(0, 500));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(repository.requests.last.status, 'processing');
    expect(repository.requests.last.page, 1);
    expect(repository.requests, hasLength(3));
    expect(find.byType(RefreshProgressIndicator), findsOneWidget);
    response.complete(
      const OrderPage(
        total: 1,
        data: [
          Order(
            version: 1,
            id: 'fresh',
            orderNumber: 'SH-FRESH',
            status: 'processing',
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('SH-FRESH'), findsOneWidget);
    expect(find.byType(RefreshProgressIndicator), findsNothing);
  });

  testWidgets(
    'tall viewport fills automatically and uses skeleton while loading',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(800, 3500));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final repository = OrderHistoryRepository();
      final initial = Completer<OrderPage>();
      repository.onFetch = (_) => initial.future;
      await tester.pumpWidget(_host(repository));
      await tester.pump();
      expect(find.byType(SkeletonCardList), findsOneWidget);
      repository.onFetch = null;
      initial.complete(
        OrderPage(
          total: 52,
          data: [
            for (var i = 0; i < 20; i++)
              Order(version: 1, id: 'tall-$i', orderNumber: 'TALL-$i'),
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(repository.requests.length, greaterThan(1));
      expect(tester.takeException(), isNull);
    },
  );

  for (final dark in [false, true]) {
    testWidgets(
      'Arabic narrow history filters and paginates in ${dark ? 'dark' : 'light'} mode',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(320, 640));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final repository = OrderHistoryRepository();
        await tester.pumpWidget(_host(repository, locale: 'ar', dark: dark));
        await tester.pumpAndSettle();
        final context = tester.element(find.byType(OrdersScreen));
        final l10n = AppLocalizations.of(context);
        expect(Directionality.of(context), TextDirection.rtl);
        final chip = find.widgetWithText(ChoiceChip, l10n.orderStatusDelivered);
        await tester.scrollUntilVisible(
          chip,
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        await tester.tap(chip);
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text('SH-995'),
          400,
          scrollable: orderScroll,
          maxScrolls: 40,
        );
        await tester.pumpAndSettle();
        expect(repository.requests.last.status, 'delivered');
        expect(repository.requests.last.page, 2);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

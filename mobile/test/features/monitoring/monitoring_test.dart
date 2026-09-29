import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/app/router/role_guard.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/monitoring/data/monitor_repository.dart';
import 'package:shubayr/features/monitoring/presentation/monitor_providers.dart';
import 'package:shubayr/features/monitoring/presentation/monitor_orders_screen.dart';
import 'package:shubayr/features/monitoring/presentation/monitor_detail_screen.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import '../../helpers/test_session.dart';

Map<String, dynamic> item(String id) => {
  'id': id,
  'order_number': 'SH-$id',
  'status': 'pending',
  'customer_name': 'زبون للاختبار',
  'customer_phone': '+9647700000006',
  'total': 12500,
  'payment_method': 'cod',
  'placed_at': '2026-09-28T10:00:00Z',
};
MonitorPage page(int number) => MonitorPage.fromJson({
  'page': number,
  'per_page': 20,
  'total': 45,
  'status_counts': {'pending': 45, 'confirmed': 2, 'all': 47},
  'data': [
    for (var i = (number - 1) * 20; i < number * 20 && i < 45; i++) item('$i'),
  ],
});

class RecordingMonitor extends MonitorRepository {
  RecordingMonitor() : super(ApiClient(Dio()));
  final requests = <({MonitorQuery query, int page})>[];
  Future<MonitorPage> Function(MonitorQuery, int)? onFetch;
  @override
  Future<MonitorPage> fetch({
    MonitorQuery query = const MonitorQuery(),
    int page = 1,
  }) async {
    requests.add((query: query, page: page));
    return onFetch?.call(query, page) ?? monitoringPage(page);
  }

  @override
  Future<MonitorOrder> detail(String id) async => MonitorOrder.fromJson({
    ...item(id),
    'customer': {'name': 'زبون للاختبار', 'phone': '+9647700000006'},
    'shipping_snapshot': {
      'city': 'بغداد',
      'area': 'المنصور',
      'details': 'قرب السوق',
    },
    'items': [
      {
        'id': 'i1',
        'product_id': 'p1',
        'product_name_ar': 'منتج محفوظ',
        'product_name_en': 'Saved item',
        'quantity': 2,
        'unit_price': 5000,
        'line_total': 10000,
      },
    ],
    'subtotal': 10000,
    'delivery_fee': 2500,
  });
  MonitorPage monitoringPage(int number) => page(number);
}

void main() {
  test(
    'API 7.1 rejected orders can be requested by monitor status filter',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            expect(options.path, '/monitor/orders');
            expect(options.queryParameters['status'], 'rejected');
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'page': 1,
                  'total': 1,
                  'status_counts': {'rejected': 1, 'all': 1},
                  'data': [
                    {...item('rejected-1'), 'status': 'rejected'},
                  ],
                },
              ),
            );
          },
        ),
      );
      final result = await MonitorRepository(
        ApiClient(dio),
      ).fetch(query: const MonitorQuery(status: 'rejected'));
      expect(result.items.single.order.status, 'rejected');
      expect(result.counts['rejected'], 1);
    },
  );
  test(
    'normal launches always use remote; work roles cannot enter shopping/admin',
    () {
      expect(AppConfig.fromEnvironment().dataSource, DataSource.remote);
      for (final role in [UserRole.monitor, UserRole.delivery]) {
        for (final path in [
          '/admin',
          '/admin/manage/products',
          '/cart',
          '/checkout',
          '/home',
          '/products/p1',
        ]) {
          expect(RoleGuard.allows(role, path), isFalse);
        }
        expect(RoleGuard.allows(role, AppRoutes.notifications), isTrue);
      }
      expect(RoleGuard.allows(UserRole.customer, AppRoutes.monitor), isFalse);
      expect(
        RoleGuard.allows(UserRole.monitor, '/monitor/orders-other'),
        isFalse,
      );
      expect(
        const Session.signedIn(
          User(role: 'order_monitor', surface: 'admin'),
        ).isSignedIn,
        isFalse,
      );
    },
  );
  test(
    'monitor contract uses combined Baghdad date filters and only GET paths',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              requests.add(r);
              h.resolve(
                Response(
                  requestOptions: r,
                  data: r.path.endsWith('/x')
                      ? {
                          ...item('x'),
                          'customer': {'name': null, 'phone': '+9647700000006'},
                        }
                      : {
                          'page': 2,
                          'per_page': 20,
                          'total': 45,
                          'status_counts': {'all': 45},
                          'data': [item('x')],
                        },
                ),
              );
            },
          ),
        );
      final repo = MonitorRepository(ApiClient(dio));
      await repo.fetch(
        query: MonitorQuery(
          status: 'pending',
          search: ' Ahmed ',
          from: DateTime(2026, 9, 1),
          to: DateTime(2026, 9, 28),
        ),
        page: 2,
      );
      expect(requests.single.path, '/monitor/orders');
      expect(requests.single.queryParameters, {
        'page': 2,
        'per_page': 20,
        'status': 'pending',
        'q': 'Ahmed',
        'date_from': '2026-09-01',
        'date_to': '2026-09-28',
      });
      await repo.detail('x');
      expect(requests.last.path, '/monitor/orders/x');
      expect(requests.every((r) => r.method == 'GET'), isTrue);
    },
  );
  test(
    'pagination, filter reset, and session changes discard late results',
    () async {
      final repo = RecordingMonitor();
      final session = TestSession(initial: monitorSession);
      final container = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          monitorRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      await container.read(monitorOrdersProvider.future);
      final controller = container.read(monitorOrdersProvider.notifier);
      await controller.loadMore();
      await controller.loadMore();
      expect(
        container.read(monitorOrdersProvider).requireValue.items,
        hasLength(45),
      );
      final pending = Completer<MonitorPage>();
      repo.onFetch = (_, _) => pending.future;
      container
          .read(monitorFilterProvider.notifier)
          .select(const MonitorQuery(search: 'old'));
      final old = container.read(monitorOrdersProvider.future);
      repo.onFetch = (_, number) async => page(number);
      container
          .read(monitorFilterProvider.notifier)
          .select(const MonitorQuery(search: 'new'));
      await container.read(monitorOrdersProvider.future);
      pending.complete(MonitorPage(items: [], page: 1, total: 0, counts: {}));
      await old;
      expect(
        container.read(monitorOrdersProvider).requireValue.items,
        hasLength(20),
      );
      session.setSession(customerSession);
      await expectLater(
        container.read(monitorOrdersProvider.future),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test(
    'refresh errors stay in provider state instead of escaping a gesture',
    () async {
      final repo = RecordingMonitor();
      final container = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          sessionControllerProvider.overrideWith(
            () => TestSession(initial: monitorSession),
          ),
          monitorRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      await container.read(monitorOrdersProvider.future);
      repo.onFetch = (_, _) async => throw const AppFailure.network();
      await container.read(monitorOrdersProvider.notifier).refresh();
      expect(container.read(monitorOrdersProvider).error, isA<AppFailure>());
    },
  );
  for (final width in <double>[
    390,
    599,
    600,
    899,
    900,
    1199,
    1200,
    1535,
    1536,
    1920,
  ]) {
    testWidgets(
      'read-only monitoring list/details fit $width with large Arabic text',
      (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        for (final screen in [
          const MonitorOrdersScreen(),
          const MonitorDetailScreen(orderId: '1'),
        ]) {
          await tester.pumpWidget(
            ProviderScope(
              key: UniqueKey(),
              overrides: [
                sessionControllerProvider.overrideWith(
                  () => TestSession(initial: monitorSession),
                ),
                monitorRepositoryProvider.overrideWithValue(RecordingMonitor()),
                unreadCountProvider.overrideWith((ref) async => 0),
                brandProvider.overrideWithValue(const Brand.bundled()),
              ],
              child: MaterialApp(
                locale: const Locale('ar'),
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                theme: width < 900
                    ? AppTheme.light(const Brand.bundled())
                    : AppTheme.dark(const Brand.bundled()),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(
                    context,
                  ).copyWith(textScaler: const TextScaler.linear(2)),
                  child: child!,
                ),
                home: screen,
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.byType(Image), findsNothing);
          final l = AppLocalizations.of(
            tester.element(find.byType(Scaffold).first),
          );
          expect(find.text(l.adminOrderConfirm), findsNothing);
          expect(find.text(l.adminOrderUpdate), findsNothing);
          if (screen is MonitorOrdersScreen) {
            expect(find.text('${l.ordersFilterAll} (47)'), findsOneWidget);
          }
        }
      },
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/order_tracking.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:shubayr/features/orders/presentation/screens/orders_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

import '../../helpers/test_session.dart';
import 'support/order_history_repository.dart';

const _a = Session.signedIn(User(id: 'A', role: 'customer'));
const _b = Session.signedIn(User(id: 'B', role: 'customer'));

class _Orders extends OrderHistoryRepository {
  _Orders(this.owner);
  final String? Function() owner;
  final detailOwners = <String?>[];
  final trackingOwners = <String?>[];
  Future<Order> Function()? onDetail;
  Future<OrderTracking> Function()? onTracking;

  @override
  Future<Order> fetchOrder(String id) {
    detailOwners.add(owner());
    return onDetail?.call() ?? Future.value(_order(owner(), id));
  }

  @override
  Future<OrderTracking> fetchTracking(String id) {
    trackingOwners.add(owner());
    return onTracking?.call() ?? Future.value(_tracking(owner(), id));
  }
}

Order _order(String? owner, String id) =>
    Order(id: id, orderNumber: '$owner-private-order');

OrderTracking _tracking(String? owner, String id) => OrderTracking(
  orderId: id,
  events: [OrderEvent(status: 'pending', note: '$owner-private-tracking')],
);

void main() {
  late ProviderContainer container;
  late TestSession session;
  late _Orders repository;
  late List<({String? owner, String? status, int page})> requests;

  setUp(() async {
    requests = [];
    repository = _Orders(
      () => container.read(sessionControllerProvider).value?.user?.id,
    );
    repository.onFetch = (request) async {
      final owner = repository.owner();
      requests.add((owner: owner, status: request.status, page: request.page));
      return OrderPage(
        page: request.page,
        perPage: request.perPage,
        total: 40,
        data: [_order(owner, '$owner-page-${request.page}')],
      );
    };
    container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        dataSourceProvider.overrideWithValue(DataSource.mock),
        sessionControllerProvider.overrideWith(() => TestSession(initial: _a)),
        orderRepositoryProvider.overrideWithValue(repository),
        brandProvider.overrideWithValue(const Brand.bundled()),
      ],
    );
    await container.read(sessionControllerProvider.future);
    session = container.read(sessionControllerProvider.notifier) as TestSession;
    container.listen(ordersProvider, (_, _) {});
    // Keep the same detail ID subscribed across identities, as a route can be
    // mounted while the router processes a session change.
    container.listen(orderProvider('same-id'), (_, _) {});
    container.listen(orderTrackingProvider('same-id'), (_, _) {});
    await container.pump();
  });

  tearDown(() => container.dispose());

  test(
    'sign-out clears the filter and prevents private reads until B signs in',
    () async {
      container.read(orderStatusFilterProvider.notifier).state = 'delivered';
      await container.read(ordersProvider.future);
      await container.read(ordersProvider.notifier).loadMore();
      expect(container.read(ordersProvider).requireValue.items, hasLength(2));
      final reads = repository.requests.length;

      session.setSession(const Session.signedOut());
      await container.pump();
      await expectLater(
        container.read(ordersProvider.future),
        throwsA(isA<AppFailure>()),
      );
      expect(container.read(orderStatusFilterProvider), isNull);
      for (final value in <AsyncValue<Object>>[
        container.read(ordersProvider),
        container.read(orderProvider('same-id')),
        container.read(orderTrackingProvider('same-id')),
      ]) {
        expect(value.hasError, isTrue);
        expect(value.error, isA<AppFailure>());
      }
      await container.read(ordersProvider.notifier).loadMore();
      await container.read(ordersProvider.notifier).refresh();
      expect(repository.requests, hasLength(reads));
      expect(repository.detailOwners, ['A']);
      expect(repository.trackingOwners, ['A']);

      session.setSession(_b);
      await container.pump();
      await container.read(ordersProvider.future);
      expect(requests.last, (owner: 'B', status: null, page: 1));
      expect(
        container.read(ordersProvider).requireValue.items.single.id,
        'B-page-1',
      );
      expect(
        container.read(orderProvider('same-id')).requireValue.orderNumber,
        'B-private-order',
      );
      expect(
        container
            .read(orderTrackingProvider('same-id'))
            .requireValue
            .events
            .single
            .note,
        'B-private-tracking',
      );
    },
  );

  test(
    'direct identity change resets the filter and all subscribed reads',
    () async {
      container.read(orderStatusFilterProvider.notifier).state = 'pending';
      await container.read(ordersProvider.future);
      session.setSession(_b);
      await container.pump();
      expect(container.read(orderStatusFilterProvider), isNull);
      expect(requests.last, (owner: 'B', status: null, page: 1));
      expect(repository.detailOwners, ['A', 'B']);
      expect(repository.trackingOwners, ['A', 'B']);
    },
  );

  for (final fails in [false, true]) {
    test(
      'late A initial-page ${fails ? 'error' : 'result'} cannot replace B',
      () async {
        final old = Completer<OrderPage>();
        final fetch = repository.onFetch;
        repository.onFetch = (_) => old.future;
        container.invalidate(ordersProvider);
        container.read(ordersProvider);
        repository.onFetch = fetch;
        session.setSession(_b);
        await container.pump();
        expect(requests.last.owner, 'B');
        if (fails) {
          old.completeError(const AppFailure.network());
        } else {
          old.complete(const OrderPage(data: [Order(id: 'A-late')]));
        }
        await container.pump();
        expect(
          container.read(ordersProvider).requireValue.items.single.id,
          'B-page-1',
        );
      },
    );

    for (final next in [_a, _b]) {
      test(
        'late pagination ${fails ? 'error' : 'result'} is ignored after sign-out and ${next.user!.id} sign-in',
        () async {
          final old = Completer<OrderPage>();
          final fetch = repository.onFetch;
          repository.onFetch = (_) => old.future;
          final append = container.read(ordersProvider.notifier).loadMore();
          repository.onFetch = fetch;
          // Deliberately do not pump between sign-out and sign-in.
          session.setSession(const Session.signedOut());
          session.setSession(next);
          await container.pump();
          if (fails) {
            old.completeError(const AppFailure.network());
          } else {
            old.complete(const OrderPage(page: 2, data: [Order(id: 'A-late')]));
          }
          await append;
          final current = container.read(ordersProvider).requireValue;
          expect(current.items.map((o) => o.id), ['${next.user!.id}-page-1']);
          expect(current.page.page, 1);
          expect(current.loadMoreError, isNull);
          expect(current.loadingMore, isFalse);
        },
      );
    }

    test(
      'late detail/tracking ${fails ? 'errors' : 'results'} cannot replace B',
      () async {
        final detail = Completer<Order>();
        final tracking = Completer<OrderTracking>();
        repository.onDetail = () => detail.future;
        repository.onTracking = () => tracking.future;
        container.invalidate(orderProvider('same-id'));
        container.invalidate(orderTrackingProvider('same-id'));
        container.read(orderProvider('same-id'));
        container.read(orderTrackingProvider('same-id'));
        repository.onDetail = null;
        repository.onTracking = null;
        session.setSession(_b);
        await container.pump();
        expect(repository.detailOwners.last, 'B');
        expect(repository.trackingOwners.last, 'B');
        if (fails) {
          detail.completeError(const AppFailure.network());
          tracking.completeError(const AppFailure.network());
        } else {
          detail.complete(_order('A-late', 'same-id'));
          tracking.complete(_tracking('A-late', 'same-id'));
        }
        await container.pump();
        expect(
          container.read(orderProvider('same-id')).requireValue.orderNumber,
          'B-private-order',
        );
        expect(
          container
              .read(orderTrackingProvider('same-id'))
              .requireValue
              .events
              .single
              .note,
          'B-private-tracking',
        );
      },
    );
  }

  for (final next in [
    monitorSession,
    const Session.signedIn(User(role: 'customer')),
  ]) {
    test(
      'private reads stop for role ${next.user!.role} and ID ${next.user!.id}',
      () async {
        final reads = repository.requests.length;
        session.setSession(next);
        await container.pump();
        await expectLater(
          container.read(ordersProvider.future),
          throwsA(isA<AppFailure>()),
        );
        expect(container.read(ordersProvider).hasError, isTrue);
        expect(container.read(orderProvider('same-id')).hasError, isTrue);
        expect(
          container.read(orderTrackingProvider('same-id')).hasError,
          isTrue,
        );
        expect(repository.requests, hasLength(reads));
        expect(repository.detailOwners, ['A']);
        expect(repository.trackingOwners, ['A']);
      },
    );
  }

  test(
    'same customer profile changes preserve cache, filter and pagination',
    () async {
      container.read(orderStatusFilterProvider.notifier).state = 'delivered';
      await container.read(ordersProvider.future);
      final controller = container.read(ordersProvider.notifier);
      await controller.loadMore();
      final reads = requests.length;
      session.setSession(
        const Session.signedIn(
          User(
            id: 'A',
            role: 'customer',
            name: 'Updated name',
            email: 'new@example.com',
          ),
        ),
      );
      await container.pump();
      expect(requests, hasLength(reads));
      expect(repository.detailOwners, ['A']);
      expect(repository.trackingOwners, ['A']);
      expect(container.read(orderStatusFilterProvider), 'delivered');
      expect(container.read(ordersProvider).requireValue.page.page, 2);
      await controller.refresh();
      expect(requests.last, (owner: 'A', status: 'delivered', page: 1));
      await controller.loadMore();
      expect(requests.last, (owner: 'A', status: 'delivered', page: 2));
    },
  );

  test(
    'pagination completion cannot win a race with an identity rebuild',
    () async {
      final old = Completer<OrderPage>();
      final fetch = repository.onFetch;
      repository.onFetch = (_) => old.future;
      final append = container.read(ordersProvider.notifier).loadMore();
      repository.onFetch = fetch;
      session.setSession(_b);
      // No pump/read of Orders between the identity change and the old response.
      old.complete(const OrderPage(page: 2, data: [Order(id: 'A-late')]));
      await append;
      final current = await container.read(ordersProvider.future);
      expect(current.items.map((o) => o.id), ['B-page-1']);
      expect(current.page.page, 1);
    },
  );

  test(
    'old responses stay hidden while the new session reads are still pending',
    () async {
      final oldPage = Completer<OrderPage>();
      final oldDetail = Completer<Order>();
      final oldTracking = Completer<OrderTracking>();
      repository.onFetch = (_) => oldPage.future;
      repository.onDetail = () => oldDetail.future;
      repository.onTracking = () => oldTracking.future;
      container.invalidate(ordersProvider);
      container.invalidate(orderProvider('same-id'));
      container.invalidate(orderTrackingProvider('same-id'));
      container.read(ordersProvider);
      container.read(orderProvider('same-id'));
      container.read(orderTrackingProvider('same-id'));

      final newPage = Completer<OrderPage>();
      final newDetail = Completer<Order>();
      final newTracking = Completer<OrderTracking>();
      repository.onFetch = (_) => newPage.future;
      repository.onDetail = () => newDetail.future;
      repository.onTracking = () => newTracking.future;
      session.setSession(_b);
      await container.pump();
      expect(repository.detailOwners.last, 'B');
      oldPage.complete(const OrderPage(data: [Order(id: 'A-late')]));
      oldDetail.complete(_order('A-late', 'same-id'));
      oldTracking.complete(_tracking('A-late', 'same-id'));
      await container.pump();
      for (final value in <AsyncValue<Object>>[
        container.read(ordersProvider),
        container.read(orderProvider('same-id')),
        container.read(orderTrackingProvider('same-id')),
      ]) {
        expect(value.isLoading, isTrue);
        expect(
          value.when(
            data: (_) => 'data',
            error: (_, _) => 'error',
            loading: () => 'loading',
          ),
          'loading',
        );
      }
      newPage.complete(const OrderPage(data: [Order(id: 'B-fresh')]));
      newDetail.complete(_order('B', 'same-id'));
      newTracking.complete(_tracking('B', 'same-id'));
      await container.pump();
      expect(
        container.read(ordersProvider).requireValue.items.single.id,
        'B-fresh',
      );
      expect(
        container.read(orderProvider('same-id')).requireValue.orderNumber,
        'B-private-order',
      );
      expect(
        container
            .read(orderTrackingProvider('same-id'))
            .requireValue
            .events
            .single
            .note,
        'B-private-tracking',
      );
    },
  );

  for (final detailScreen in [false, true]) {
    testWidgets(
      '${detailScreen ? 'detail/tracking' : 'list/filter'} hides A while B loads and after B fails',
      (tester) async {
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              locale: const Locale('en'),
              theme: AppTheme.light(const Brand.bundled()),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              home: detailScreen
                  ? const OrderDetailScreen(orderId: 'same-id')
                  : const OrdersScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('A-private-order'), findsWidgets);
        if (detailScreen) {
          expect(find.text('A-private-tracking'), findsOneWidget);
        }
        container.read(orderStatusFilterProvider.notifier).state = 'delivered';
        await tester.pumpAndSettle();

        final page = Completer<OrderPage>();
        final detail = Completer<Order>();
        final tracking = Completer<OrderTracking>();
        repository.onFetch = (_) => page.future;
        repository.onDetail = () => detail.future;
        repository.onTracking = () => tracking.future;
        session.setSession(_b);
        await tester.pump();
        expect(find.text('A-private-order'), findsNothing);
        expect(find.text('A-private-tracking'), findsNothing);
        expect(container.read(orderStatusFilterProvider), isNull);

        page.completeError(const AppFailure.network());
        detail.completeError(const AppFailure.network());
        tracking.completeError(const AppFailure.network());
        await tester.pumpAndSettle();
        expect(find.text('A-private-order'), findsNothing);
        expect(find.text('A-private-tracking'), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}

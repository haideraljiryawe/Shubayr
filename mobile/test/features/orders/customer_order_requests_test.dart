import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/order_repository_remote.dart';
import 'package:shubayr/features/orders/domain/order_repository.dart';
import 'package:shubayr/features/orders/presentation/order_status.dart';
import 'package:shubayr/features/orders/presentation/providers/order_action_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/widgets/customer_order_requests.dart';

import '../../helpers/test_session.dart';
import 'order_action_lifecycle_test.dart' show Orders, Carts;

class Requests extends Orders {
  Requests() : super(Carts());
  final writes = <Object>[];
  Future<Order> Function()? response;
  @override
  Future<Order> requestCancellation(
    String id, {
    required int version,
    required String reason,
  }) {
    writes.add((id, version, reason));
    return response?.call() ??
        Future.value(Order(id: id, version: version + 1));
  }

  @override
  Future<Order> respondToShortage(
    String id, {
    required int version,
    required ShortageDecision decision,
  }) {
    writes.add((id, version, decision));
    return response?.call() ??
        Future.value(Order(id: id, version: version + 1));
  }
}

const proposedOrder = Order(
  id: 'o',
  version: 4,
  status: 'preparing',
  items: [
    OrderItem(
      id: 'i',
      productId: 'p',
      productNameAr: 'تمر',
      productNameEn: 'Dates',
      quantity: 1.25,
    ),
  ],
  attentionDetails: OrderAttentionDetails(
    reductionProposal: OrderQuantityProposal(
      orderItemId: 'i',
      oldQuantity: 1.25,
      newQuantity: .875,
      reason: 'Available quantity',
      status: 'pending',
    ),
  ),
);

void main() {
  test('only pending orders expose direct cancellation', () {
    for (final status in remoteOrderStatuses) {
      expect(isOrderCancellable(status, remote: true), status == 'pending');
      expect(isOrderCancellable(status), status == 'pending');
      expect(
        canRequestOrderCancellation(status),
        const {
          'confirmed',
          'preparing',
          'ready_for_dispatch',
          'dispatched',
          'failed',
        }.contains(status),
      );
    }
  });
  test(
    'official endpoints send exact version, reason and decision values',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      final requests = <RequestOptions>[];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            requests.add(request);
            handler.resolve(
              Response(
                requestOptions: request,
                data: {'id': 'o', 'version': 5},
              ),
            );
          },
        ),
      );
      final repository = OrderRepositoryRemote(ApiClient(dio));
      await repository.requestCancellation(
        'o',
        version: 4,
        reason: 'Changed plans',
      );
      expect(requests.last.path, '/orders/o/cancellation-request');
      expect(requests.last.data, {'version': 4, 'reason': 'Changed plans'});
      for (final decision in ShortageDecision.values) {
        await repository.respondToShortage('o', version: 4, decision: decision);
        expect(requests.last.path, '/orders/o/shortage-response');
        expect(requests.last.data, {'version': 4, 'decision': decision.name});
      }
    },
  );
  test('server request state and fractional proposal quantities decode', () {
    final order = Order.fromJson({
      ...proposedOrder.toJson(),
      'cancellation_request': {'status': 'pending', 'reason': 'Change'},
    });
    expect(order.cancellationRequest!.status, 'pending');
    expect(order.attentionDetails!.reductionProposal!.newQuantity, .875);
    expect(
      Order.fromJson({
        'id': 'o',
        'cancellation_request': null,
        'attention_details': null,
      }).attentionDetails,
      isNull,
    );
  });

  late Requests repository;
  late ProviderContainer container;
  setUp(() async {
    repository = Requests();
    container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        sessionControllerProvider.overrideWith(TestSession.new),
        orderRepositoryProvider.overrideWithValue(repository),
      ],
    );
    addTearDown(container.dispose);
    await container.read(sessionControllerProvider.future);
    container.listen(orderCancellationProvider('o'), (_, _) {});
  });
  OrderCancellationController controller() =>
      container.read(orderCancellationProvider('o').notifier);

  test(
    'request validates reason and shares duplicate guard with shortage response and cancel',
    () async {
      expect(
        (await controller().requestCancellation(
          version: 4,
          reason: ' ',
        )).status,
        OrderActionStatus.failed,
      );
      expect(repository.writes, isEmpty);
      final gate = Completer<Order>();
      repository.response = () => gate.future;
      final pending = controller().requestCancellation(
        version: 4,
        reason: '  Changed plans  ',
      );
      expect(
        (await controller().respondToShortage(
          version: 4,
          decision: ShortageDecision.accepted,
        )).status,
        OrderActionStatus.duplicate,
      );
      expect(
        (await controller().cancel(version: 4)).status,
        OrderActionStatus.duplicate,
      );
      expect(repository.writes, [('o', 4, 'Changed plans')]);
      gate.complete(const Order(id: 'o', version: 5));
      expect((await pending).status, OrderActionStatus.succeeded);
      expect(container.read(orderCancellationProvider('o')), isFalse);
    },
  );
  test(
    'conflict reloads server state and never automatically repeats the write',
    () async {
      container.listen(orderProvider('o'), (_, _) {});
      await container.read(orderProvider('o').future);
      final reads = repository.details;
      repository.response = () async => throw const AppFailure(
        FailureKind.conflict,
        statusCode: 409,
        code: 'STALE_ORDER_STATE',
      );
      expect(
        (await controller().respondToShortage(
          version: 4,
          decision: ShortageDecision.denied,
        )).status,
        OrderActionStatus.failed,
      );
      await container.read(orderProvider('o').future);
      expect(repository.details, greaterThan(reads));
      expect(repository.writes, hasLength(1));
      expect(container.read(orderCancellationProvider('o')), isFalse);
    },
  );
  test('late response after sign-out cannot publish success', () async {
    final gate = Completer<Order>();
    repository.response = () => gate.future;
    final pending = controller().requestCancellation(
      version: 4,
      reason: 'Change',
    );
    (container.read(sessionControllerProvider.notifier) as TestSession)
        .setSession(const Session.signedOut());
    await container.pump();
    gate.complete(const Order(id: 'o', version: 5));
    expect((await pending).status, OrderActionStatus.superseded);
  });

  for (final locale in ['ar', 'en']) {
    testWidgets(
      'proposal shows fractional quantities and confirms $locale at narrow width',
      (tester) async {
        tester.view.physicalSize = const Size(320, 1100);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final uiContainer = ProviderContainer(
          overrides: [
            sessionControllerProvider.overrideWith(TestSession.new),
            orderRepositoryProvider.overrideWithValue(repository),
            orderProvider('o').overrideWith((ref) async => proposedOrder),
          ],
        );
        addTearDown(uiContainer.dispose);
        await uiContainer.read(sessionControllerProvider.future);
        uiContainer.listen(orderProvider('o'), (_, _) {});
        await uiContainer.read(orderProvider('o').future);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: uiContainer,
            child: MaterialApp(
              locale: Locale(locale),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              home: const Scaffold(
                body: SingleChildScrollView(
                  child: CustomerOrderRequests(order: proposedOrder),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final context = tester.element(find.byType(CustomerOrderRequests));
        final l10n = AppLocalizations.of(context);
        expect(
          Directionality.of(context),
          locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
        );
        expect(
          find.text(l10n.orderReductionQuantities('1.25', '0.875')),
          findsOneWidget,
        );
        await tester.tap(find.text(l10n.orderReductionAccept));
        await tester.pumpAndSettle();
        expect(repository.writes, isEmpty);
        await tester.tap(find.text(l10n.actionContinue));
        await tester.pumpAndSettle();
        expect(repository.writes, [('o', 4, ShortageDecision.accepted)]);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_mock.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_remote.dart';

void main() {
  test(
    'mock pages contain all five statuses and only the current agent',
    () async {
      final repo = DeliveryRepositoryMock(agentId: 'a', delay: Duration.zero);
      final pages = [
        for (var page = 1; page <= 3; page++)
          await repo.fetchAssigned(page: page),
      ];
      expect(pages.map((p) => p.data.length), [20, 20, 5]);
      expect(pages.last.total, 45);
      final deliveries = pages.expand((p) => p.data).toList();
      expect(deliveries.map((d) => d.id).toSet(), hasLength(45));
      expect(
        deliveries.map((d) => d.status).toSet(),
        Delivery.statuses.toSet(),
      );
      expect(deliveries.every((d) => d.agentId == 'a'), isTrue);
      expect((await repo.fetchAssigned(page: 4)).data, isEmpty);
    },
  );

  test(
    'mock saves permitted statuses and timestamps and rejects unsupported writes',
    () async {
      final repo = DeliveryRepositoryMock(agentId: 'a', delay: Duration.zero);
      final original = (await repo.fetchAssigned()).data.first;
      final dispatched = await repo.updateStatus(
        original.id,
        'out_for_delivery',
      );
      expect(dispatched.dispatchedAt, isNotNull);
      final delivered = await repo.updateStatus(original.id, 'delivered');
      expect(delivered.deliveredAt, isNotNull);
      expect(delivered.dispatchedAt, dispatched.dispatchedAt);
      expect((await repo.fetchAssigned()).data.first.status, 'delivered');
      expect(delivered.orderId, original.orderId);
      expect(delivered.deliveryFee, original.deliveryFee);
      final returned = await repo.updateStatus(original.id, 'returned');
      expect(returned.status, 'returned');
      expect(returned.deliveredAt, delivered.deliveredAt);
      await expectLater(
        repo.updateStatus(original.id, 'delivered'),
        throwsA(isA<AppFailure>()),
      );
      await expectLater(
        repo.updateStatus('missing', 'failed'),
        throwsA(isA<AppFailure>()),
      );
    },
  );

  test(
    'remote honors paging, delivery ID and status-only PATCH payload',
    () async {
      final requests = <RequestOptions>[];
      final delivery = Delivery(
        id: 'delivery-id',
        orderId: 'order-id',
        agentId: 'agent-id',
        status: 'delivered',
        deliveryFee: 5000,
        deliveredAt: DateTime.utc(2026, 9, 8),
      );
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (request, handler) {
              requests.add(request);
              handler.resolve(
                Response(
                  requestOptions: request,
                  statusCode: 200,
                  data: request.method == 'GET'
                      ? DeliveryPage(
                          page: 3,
                          perPage: 20,
                          total: 41,
                          data: [delivery],
                        ).toJson()
                      : delivery.toJson(),
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final repo = DeliveryRepositoryRemote(ApiClient(dio));
      final page = await repo.fetchAssigned(status: 'delivered', page: 3);
      await repo.fetchAssigned(page: 3);
      expect(page.page, 3);
      expect(page.total, 41);
      expect(page.data.single.deliveredAt, delivery.deliveredAt);
      await repo.updateStatus('delivery-id', 'returned');
      expect(requests.first.path, '/deliveries/assigned');
      expect(requests.first.queryParameters, {
        'status': 'delivered',
        'page': 3,
        'per_page': 20,
      });
      expect(requests[1].queryParameters, {'page': 3, 'per_page': 20});
      expect(requests.last.path, '/deliveries/delivery-id');
      expect(requests.last.method, 'PATCH');
      expect(requests.last.data, {'status': 'returned'});
    },
  );
}

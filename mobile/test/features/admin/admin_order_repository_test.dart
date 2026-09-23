import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/admin/data/admin_order_repository_mock.dart';
import 'package:shubayr/features/admin/data/admin_order_repository_remote.dart';
import 'package:shubayr/features/admin/domain/admin_order_repository.dart';

void main() {
  test(
    '45 pending orders paginate 20/20/5 without duplicates in stable order',
    () async {
      final repo = AdminOrderRepositoryMock(delay: Duration.zero);
      final ids = <String>[];
      for (var page = 1; page <= 3; page++) {
        final result = await repo.fetchOrders(
          query: const AdminOrderQuery(status: 'pending'),
          page: page,
        );
        expect(result.total, 45);
        expect(result.data.length, page == 3 ? 5 : 20);
        expect(result.data.every((o) => o.status == 'pending'), isTrue);
        ids.addAll(result.data.map((o) => o.id));
      }
      expect(ids.toSet(), hasLength(45));
      expect(
        (await repo.fetchOrders(
          query: const AdminOrderQuery(status: 'pending'),
        )).data.map((o) => o.id),
        ids.take(20),
      );
    },
  );
  test(
    'combined search, status and inclusive date range filter before pagination',
    () async {
      final repo = AdminOrderRepositoryMock(
        delay: Duration.zero,
        now: DateTime(2026, 9, 9),
      );
      final result = await repo.fetchOrders(
        query: AdminOrderQuery(
          status: 'pending',
          search: '  Ahmed  ',
          from: DateTime(2026, 9, 8),
          to: DateTime(2026, 9, 9),
        ),
        perPage: 2,
      );
      expect(result.total, 3);
      expect(result.data, hasLength(2));
      final last = await repo.fetchOrders(
        query: AdminOrderQuery(
          status: 'pending',
          search: 'أحمد',
          from: DateTime(2026, 9, 8),
          to: DateTime(2026, 9, 9),
        ),
        page: 2,
        perPage: 2,
      );
      expect(last.data.single.id, 'admin-order-5');
      expect(
        (await repo.fetchOrders(
          query: const AdminOrderQuery(search: 'SH-3081'),
        )).data.single.orderNumber,
        'SH-3081',
      );
      expect(
        (await repo.fetchOrders(
          query: const AdminOrderQuery(search: 'none'),
        )).total,
        0,
      );
    },
  );
  test(
    'all contract statuses update and preserve order data; invalid values rejected',
    () async {
      final repo = AdminOrderRepositoryMock(delay: Duration.zero);
      for (final status in adminOrderStatuses) {
        final result = await repo.updateStatus('admin-order-1', status);
        expect(result.status, status);
        expect(result.total, 50000);
        expect(result.items.single.productId, 'p1');
        expect(
          (await repo.fetchOrders(
            query: AdminOrderQuery(status: status, search: 'SH-3001'),
          )).total,
          1,
        );
      }
      await expectLater(
        repo.updateStatus('admin-order-1', 'shipped'),
        throwsA(isA<AppFailure>()),
      );
      await expectLater(
        repo.updateStatus('missing', 'confirmed'),
        throwsA(isA<AppFailure>()),
      );
      await expectLater(
        repo.fetchOrders(
          query: AdminOrderQuery(
            from: DateTime(2026, 9, 9),
            to: DateTime(2026, 9, 1),
          ),
        ),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test(
    'remote query and PATCH use exact contracted endpoints and fields',
    () async {
      final requests = <RequestOptions>[];
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
                      ? {
                          'page': 2,
                          'per_page': 20,
                          'total': 21,
                          'data': [
                            {'id': 'o1', 'status': 'pending'},
                          ],
                        }
                      : {'id': 'o1', 'status': request.data['status']},
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final repo = AdminOrderRepositoryRemote(ApiClient(dio));
      final result = await repo.fetchOrders(
        query: AdminOrderQuery(
          status: 'pending',
          search: '  Ahmed ',
          from: DateTime(2026, 9, 1),
          to: DateTime(2026, 9, 9),
        ),
        page: 2,
      );
      expect(result.total, 21);
      expect(requests.last.path, '/admin/orders');
      expect(requests.last.queryParameters, {
        'status': 'pending',
        'q': 'Ahmed',
        'from': '2026-09-01',
        'to': '2026-09-09',
        'page': 2,
        'per_page': 20,
      });
      await repo.fetchOrders();
      expect(requests.last.queryParameters, {'page': 1, 'per_page': 20});
      await repo.updateStatus('o1', 'confirmed');
      expect(requests.last.method, 'PATCH');
      expect(requests.last.path, '/admin/orders/o1/status');
      expect(requests.last.data, {'status': 'confirmed'});
      await expectLater(
        repo.updateStatus('o1', 'invalid'),
        throwsA(isA<AppFailure>()),
      );
      expect(requests, hasLength(3));
      for (final status in ['preparing', 'ready_for_dispatch', 'dispatched']) {
        await repo.updateStatus('o1', status);
        expect(requests.last.data, {'status': status});
      }
      final count = requests.length;
      for (final status in [
        'processing',
        'out_for_delivery',
        'delivered',
        'cancelled',
      ]) {
        await expectLater(
          repo.updateStatus('o1', status),
          throwsA(isA<AppFailure>()),
        );
      }
      await repo.fetchOrders(
        query: const AdminOrderQuery(status: 'ready_for_dispatch'),
      );
      expect(requests.last.queryParameters['status'], 'ready_for_dispatch');
      await expectLater(
        repo.fetchOrders(query: const AdminOrderQuery(status: 'processing')),
        throwsA(isA<AppFailure>()),
      );
      expect(requests, hasLength(count + 1));
    },
  );
}

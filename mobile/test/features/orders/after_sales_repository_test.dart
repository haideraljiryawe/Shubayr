import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/orders/data/after_sales_repository_mock.dart';
import 'package:shubayr/features/orders/data/after_sales_repository_remote.dart';
import 'package:shubayr/features/orders/data/order_repository_mock.dart';
import 'package:shubayr/features/orders/data/return_request.dart';

void main() {
  test(
    'remote history uses customer endpoints and preserves required correlation fields',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      final requests = <RequestOptions>[];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            requests.add(options);
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'page': 2,
                  'per_page': 100,
                  'total': 101,
                  'data': [
                    if (options.path == '/returns')
                      {
                        'id': 'return',
                        'order_id': 'order',
                        'status': 'completed',
                        'items': [
                          {
                            'order_item_id': 'item',
                            'quantity': .125,
                            'approved_quantity': .125,
                          },
                        ],
                      }
                    else
                      {
                        'id': 'review',
                        'product_id': 'product',
                        'order_item_id': 'item',
                        'rating': 4,
                        'status': 'rejected',
                        'created_at': '2026-10-03T00:00:00Z',
                        'product': {
                          'id': 'product',
                          'name_ar': 'منتج',
                          'name_en': 'Product',
                        },
                      },
                  ],
                },
              ),
            );
          },
        ),
      );
      final repo = AfterSalesRepositoryRemote(ApiClient(dio));
      final reviews = await repo.fetchOwnReviews(page: 2);
      final returns = await repo.fetchReturns(page: 2);
      expect(requests.map((r) => r.path), ['/me/reviews', '/returns']);
      expect(requests.every((r) => r.method == 'GET'), isTrue);
      expect(requests.last.queryParameters, {'page': 2, 'per_page': 100});
      expect(reviews.data.single.orderItemId, 'item');
      expect(reviews.data.single.status, 'rejected');
      expect(returns.data.single.orderId, 'order');
      expect(returns.data.single.items.single.approvedQuantity, .125);
      expect(
        ReturnPage.fromJson(
          returns.toJson(),
        ).data.single.items.single.approvedQuantity,
        .125,
      );
    },
  );
  late OrderRepositoryMock orders;
  late AfterSalesRepositoryMock repository;
  setUp(() {
    orders = OrderRepositoryMock(
      CartRepositoryMock(delay: Duration.zero),
      delay: Duration.zero,
    );
    repository = AfterSalesRepositoryMock(
      orders,
      userId: 'customer',
      delay: Duration.zero,
    );
  });
  test(
    'review references a delivered purchased item and stays pending',
    () async {
      final review = await repository.submitReview(
        productId: 'p5',
        orderItemId: 'oi-1042-p5',
        rating: 4,
        comment: 'Good',
      );
      expect(review.status, 'pending');
      expect(review.verifiedPurchase, isTrue);
      expect(review.orderItemId, 'oi-1042-p5');
      await expectLater(
        repository.submitReview(
          productId: 'p5',
          orderItemId: 'oi-1042-p5',
          rating: 5,
        ),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test(
    'rejects invalid stars, mismatched products and undelivered purchases',
    () async {
      for (final (product, item, stars) in [
        ('p5', 'oi-1042-p5', 0),
        ('p5', 'oi-1042-p5', 6),
        ('p11', 'oi-1042-p5', 5),
        ('p2', 'oi-1063-p2', 5),
      ]) {
        await expectLater(
          repository.submitReview(
            productId: product,
            orderItemId: item,
            rating: stars,
          ),
          throwsA(isA<AppFailure>()),
        );
      }
    },
  );
  test(
    'partial return keeps other items and caps cumulative quantities',
    () async {
      final result = await repository.requestReturn(
        orderId: 'order-1042',
        items: [
          const ReturnRequestItem(orderItemId: 'oi-1042-p5', quantity: 1),
        ],
      );
      expect(result.status, 'requested');
      expect(result.items.single.quantity, 1);
      expect((await orders.fetchOrder('order-1042')).items.length, 2);
      expect((await orders.fetchOrder('order-1042')).status, 'delivered');
      await expectLater(
        repository.requestReturn(
          orderId: 'order-1042',
          items: [
            const ReturnRequestItem(orderItemId: 'oi-1042-p5', quantity: 3),
          ],
        ),
        throwsA(isA<AppFailure>()),
      );
      final remaining = await repository.requestReturn(
        orderId: 'order-1042',
        items: [
          const ReturnRequestItem(orderItemId: 'oi-1042-p5', quantity: 2),
        ],
      );
      expect(remaining.items.single.quantity, 2);
    },
  );
  test('rejects empty, zero, foreign and duplicate return lines', () async {
    for (final lines in <List<ReturnRequestItem>>[
      [],
      [const ReturnRequestItem(orderItemId: 'oi-1042-p5', quantity: 0)],
      [const ReturnRequestItem(orderItemId: 'oi-1063-p2', quantity: 1)],
      [
        const ReturnRequestItem(orderItemId: 'oi-1042-p5', quantity: 1),
        const ReturnRequestItem(orderItemId: 'oi-1042-p5', quantity: 1),
      ],
    ]) {
      await expectLater(
        repository.requestReturn(orderId: 'order-1042', items: lines),
        throwsA(isA<AppFailure>()),
      );
    }
  });
  test('guest cannot submit reviews or returns', () async {
    final guest = AfterSalesRepositoryMock(
      orders,
      userId: null,
      delay: Duration.zero,
    );
    await expectLater(
      guest.submitReview(productId: 'p5', orderItemId: 'oi-1042-p5', rating: 5),
      throwsA(
        isA<AppFailure>().having(
          (e) => e.kind,
          'kind',
          FailureKind.unauthorized,
        ),
      ),
    );
    await expectLater(
      guest.requestReturn(orderId: 'order-1042', items: []),
      throwsA(
        isA<AppFailure>().having(
          (e) => e.kind,
          'kind',
          FailureKind.unauthorized,
        ),
      ),
    );
  });
  test(
    'remote preserves existing create payloads and parses responses',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            requests.add(options);
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 201,
                data: options.path == '/returns'
                    ? {
                        'id': 'r1',
                        'order_id': 'o1',
                        'status': 'requested',
                        'items': [
                          {'order_item_id': 'i1', 'quantity': 1},
                        ],
                      }
                    : {
                        'id': 'v1',
                        'product_id': 'p1',
                        'order_item_id': 'i1',
                        'rating': 4,
                        'status': 'pending',
                        'created_at': '2026-09-07T12:00:00Z',
                      },
              ),
            );
          },
        ),
      );
      final remote = AfterSalesRepositoryRemote(ApiClient(dio));
      final review = await remote.submitReview(
        productId: 'p1',
        orderItemId: 'i1',
        rating: 4,
      );
      expect(review.status, 'pending');
      expect(requests.first.path, '/products/p1/reviews');
      expect(requests.first.data, {'order_item_id': 'i1', 'rating': 4});
      final result = await remote.requestReturn(
        orderId: 'o1',
        reason: 'Reason',
        items: [const ReturnRequestItem(orderItemId: 'i1', quantity: 1)],
      );
      expect(result.id, 'r1');
      expect(requests.last.data, {
        'order_id': 'o1',
        'reason': 'Reason',
        'items': [
          {'order_item_id': 'i1', 'quantity': 1},
        ],
      });
    },
  );
}

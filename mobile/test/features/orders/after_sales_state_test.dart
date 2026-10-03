import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/catalog/data/review.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/return_request.dart';
import 'package:shubayr/features/orders/domain/after_sales_repository.dart';
import 'package:shubayr/features/orders/presentation/providers/after_sales_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import '../../helpers/test_session.dart';

Review review([String id = 'r', String item = 'i']) => Review(
  id: id,
  productId: 'p',
  orderItemId: item,
  rating: 5,
  status: 'pending',
  createdAt: DateTime(2026),
);
ReturnRequest returned({
  String id = 'r',
  String order = 'o',
  num quantity = .125,
  String status = 'requested',
  num? approved,
}) => ReturnRequest(
  id: id,
  orderId: order,
  status: status,
  items: [
    ReturnRequestItem(
      orderItemId: 'i',
      quantity: quantity,
      approvedQuantity: approved,
    ),
  ],
);
Order order({bool? reviewed = false}) => Order(
  id: 'o',
  status: 'delivered',
  items: [OrderItem(id: 'i', productId: 'p', quantity: .5, reviewed: reviewed)],
);

class Repository implements AfterSalesRepository {
  Future<ReviewPage> Function(int)? onReviews;
  Future<ReturnPage> Function(int)? onReturns;
  Future<Review> Function()? onSubmitReview;
  Future<ReturnRequest> Function()? onSubmitReturn;
  final reviewPages = <int>[], returnPages = <int>[];
  @override
  Future<ReviewPage> fetchOwnReviews({int page = 1, int perPage = 100}) {
    reviewPages.add(page);
    return onReviews?.call(page) ??
        Future.value(ReviewPage(page: page, perPage: perPage));
  }

  @override
  Future<ReturnPage> fetchReturns({int page = 1, int perPage = 100}) {
    returnPages.add(page);
    return onReturns?.call(page) ??
        Future.value(
          ReturnPage(page: page, perPage: perPage, total: 0, data: []),
        );
  }

  @override
  Future<Review> submitReview({
    required String productId,
    required String orderItemId,
    required int rating,
    String? comment,
  }) async => onSubmitReview == null ? review() : onSubmitReview!();
  @override
  Future<ReturnRequest> requestReturn({
    required String orderId,
    required List<ReturnRequestItem> items,
    String? reason,
  }) async => onSubmitReturn == null ? returned() : onSubmitReturn!();
}

void main() {
  late ProviderContainer c;
  late Repository repo;
  late Order serverOrder;
  late int orderReads;
  Future<ProviderContainer> create() async {
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        sessionControllerProvider.overrideWith(
          () => TestSession(
            initial: const Session.signedIn(User(id: 'A', role: 'customer')),
          ),
        ),
        afterSalesRepositoryProvider.overrideWithValue(repo),
        orderProvider('o').overrideWith((ref) async {
          ref.watch(ordersIdentityProvider);
          orderReads++;
          return serverOrder;
        }),
      ],
    );
    addTearDown(container.dispose);
    await container.read(sessionControllerProvider.future);
    return container;
  }

  Future<void> flush() async {
    await Future<void>.delayed(Duration.zero);
    await c.pump();
  }

  setUp(() async {
    repo = Repository();
    serverOrder = order();
    orderReads = 0;
    c = await create();
  });
  void watchReviews() => c.listen(reviewEligibilityProvider('o'), (_, _) {});
  void watchReturns() => c.listen(returnEligibilityProvider('o'), (_, _) {});

  test(
    'explicit reviewed flags avoid an account-wide review request',
    () async {
      for (final flag in [true, false]) {
        serverOrder = order(reviewed: flag);
        c.invalidate(orderProvider('o'));
        watchReviews();
        expect(
          await c.read(reviewEligibilityProvider('o').future),
          flag ? isEmpty : {'i'},
        );
      }
      expect(repo.reviewPages, isEmpty);
    },
  );
  test(
    'success updates eligibility immediately; a later server read replaces it',
    () async {
      watchReviews();
      await c.read(reviewEligibilityProvider('o').future);
      await c
          .read(reviewEligibilityProvider('o').notifier)
          .submit(item: serverOrder.items.single, rating: 5);
      expect(c.read(reviewEligibilityProvider('o')).requireValue, isEmpty);
      expect(orderReads, 1);
      // e.g. the review was deleted on another device; stale receipts cannot win.
      c.invalidate(orderProvider('o'));
      expect(await c.read(reviewEligibilityProvider('o').future), {'i'});
      serverOrder = order(reviewed: true);
      c.invalidate(orderProvider('o'));
      expect(await c.read(reviewEligibilityProvider('o').future), isEmpty);
    },
  );
  test(
    'missing reviewed flag reads every page, including pending/rejected reviews',
    () async {
      serverOrder = order(reviewed: null);
      repo.onReviews = (page) async => ReviewPage(
        page: page,
        perPage: 100,
        total: 101,
        data: page == 1
            ? [for (var i = 0; i < 100; i++) review('r$i', 'other$i')]
            : [review()],
      );
      watchReviews();
      expect(await c.read(reviewEligibilityProvider('o').future), isEmpty);
      expect(repo.reviewPages, [1, 2]);
    },
  );
  test(
    'persisted fractional returns are found on later pages and after recreation',
    () async {
      repo.onReturns = (page) async => ReturnPage(
        page: page,
        perPage: 100,
        total: 101,
        data: page == 1
            ? [
                for (var i = 0; i < 100; i++)
                  returned(id: 'r$i', order: 'other'),
              ]
            : [returned(id: 'last')],
      );
      watchReturns();
      expect(
        (await c.read(returnEligibilityProvider('o').future)).remaining['i'],
        .375,
      );
      final fresh = await create();
      fresh.listen(returnEligibilityProvider('o'), (_, _) {});
      expect(
        (await fresh.read(
          returnEligibilityProvider('o').future,
        )).remaining['i'],
        .375,
      );
      expect(repo.returnPages, [1, 2, 1, 2]);
    },
  );
  test(
    'an ambiguous successful return response cannot leave old eligibility usable',
    () async {
      watchReturns();
      await c.read(returnEligibilityProvider('o').future);
      repo.onSubmitReturn = () async => returned(status: 'rejected');
      await expectLater(
        c
            .read(returnEligibilityProvider('o').notifier)
            .submit(
              items: [
                const ReturnRequestItem(orderItemId: 'i', quantity: .125),
              ],
            ),
        throwsA(isA<AppFailure>()),
      );
      expect(c.read(returnEligibilityProvider('o')).hasError, isTrue);
      await expectLater(
        c
            .read(returnEligibilityProvider('o').notifier)
            .submit(
              items: [
                const ReturnRequestItem(orderItemId: 'i', quantity: .125),
              ],
            ),
        throwsA(isA<AppFailure>()),
      );
    },
  );
  test(
    'a successful receipt is counted once and a server refresh replaces it',
    () async {
      watchReturns();
      await c.read(returnEligibilityProvider('o').future);
      await c
          .read(returnEligibilityProvider('o').notifier)
          .submit(
            items: [const ReturnRequestItem(orderItemId: 'i', quantity: .125)],
          );
      expect(
        c.read(returnEligibilityProvider('o')).requireValue.remaining['i'],
        .375,
      );
      repo.onReturns = (page) async =>
          ReturnPage(page: page, perPage: 100, total: 1, data: [returned()]);
      c.invalidate(returnEligibilityProvider('o'));
      expect(
        (await c.read(returnEligibilityProvider('o').future)).remaining['i'],
        .375,
      );
      repo.onReturns = (page) async =>
          ReturnPage(page: page, perPage: 100, total: 0, data: []);
      c.invalidate(returnEligibilityProvider('o'));
      expect(
        (await c.read(returnEligibilityProvider('o').future)).remaining['i'],
        .5,
      );
    },
  );
  for (final (status, approved, remaining) in <(String, num?, num)>[
    ('requested', null, 0),
    ('approved', .5, 0),
    ('partially_approved', .5, 0),
    ('completed', .5, 0),
  ]) {
    test('$status uses its persisted quantity, approved=$approved', () {
      expect(
        ReturnEligibility(order(), [
          returned(quantity: .5, status: status, approved: approved),
        ]).remaining['i'],
        remaining,
      );
    });
  }
  for (final status in [
    'approved',
    'partially_approved',
    'completed',
    'rejected',
  ]) {
    test('$status cannot assume unapproved quantities were released', () {
      for (final approved in [0, .125]) {
        expect(
          () => ReturnEligibility(order(), [
            returned(quantity: .5, status: status, approved: approved),
          ]),
          throwsA(isA<AppFailure>()),
        );
      }
    });
  }
  test(
    'an approved partial request leaves the unrequested quantity available',
    () {
      expect(
        ReturnEligibility(order(), [
          returned(quantity: .125, status: 'approved', approved: .125),
        ]).remaining['i'],
        .375,
      );
    },
  );
  test('reviewed is preserved through order decoding and serialization', () {
    for (final value in [true, false, null]) {
      final item = OrderItem.fromJson({
        'id': 'i',
        'product_id': 'p',
        'reviewed': ?value,
      });
      expect(item.reviewed, value);
      expect(OrderItem.fromJson(item.toJson()).reviewed, value);
    }
  });
  test('unknown review history failure never becomes not-reviewed', () async {
    serverOrder = order(reviewed: null);
    repo.onReviews = (_) async => throw const AppFailure.timeout();
    watchReviews();
    await expectLater(
      c.read(reviewEligibilityProvider('o').future),
      throwsA(isA<AppFailure>()),
    );
    expect(c.read(reviewEligibilityProvider('o')).asData, isNull);
  });
  test('loaded A state disappears while B history is still pending', () async {
    final gate = Completer<ReturnPage>();
    repo.onReturns = (page) => repo.returnPages.length == 1
        ? Future.value(
            ReturnPage(
              page: page,
              perPage: 100,
              total: 1,
              data: [returned(quantity: .5)],
            ),
          )
        : gate.future;
    watchReturns();
    expect(
      (await c.read(returnEligibilityProvider('o').future)).remaining['i'],
      0,
    );
    (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
      const Session.signedIn(User(id: 'B', role: 'customer')),
    );
    await flush();
    expect(c.read(returnEligibilityProvider('o')).isLoading, isTrue);
    expect(c.read(returnEligibilityProvider('o')).value?.requests, isEmpty);
    expect(c.read(returnEligibilityProvider('o')).value?.remaining, isEmpty);
    gate.complete(const ReturnPage(page: 1, perPage: 100, total: 0, data: []));
    expect(
      (await c.read(returnEligibilityProvider('o').future)).remaining['i'],
      .5,
    );
  });
  test(
    'several pending fractional returns sum exactly without product-id correlation',
    () {
      expect(
        ReturnEligibility(order(), [
          returned(id: 'a', quantity: .1),
          returned(id: 'b', quantity: .2),
          returned(id: 'other', order: 'different', quantity: .5),
        ]).remaining['i'],
        .2,
      );
    },
  );
  for (final status in [
    'approved',
    'partially_approved',
    'completed',
    'rejected',
    'unknown',
  ]) {
    test(
      '$status without usable approved quantity is unknown, not eligible',
      () {
        expect(
          () => ReturnEligibility(order(), [returned(status: status)]),
          throwsA(isA<AppFailure>()),
        );
      },
    );
  }
  for (final failure in [
    const AppFailure.network(),
    const AppFailure.timeout(),
    const AppFailure(FailureKind.server),
  ]) {
    test(
      'history $failure cannot grant permission and supports retry',
      () async {
        repo.onReturns = (_) async => throw failure;
        watchReturns();
        await expectLater(
          c.read(returnEligibilityProvider('o').future),
          throwsA(isA<AppFailure>()),
        );
        expect(c.read(returnEligibilityProvider('o')).asData, isNull);
        repo.onReturns = null;
        c.invalidate(returnEligibilityProvider('o'));
        expect(
          (await c.read(returnEligibilityProvider('o').future)).remaining['i'],
          .5,
        );
      },
    );
  }
  test('incomplete or moving pages cannot prove absence', () async {
    repo.onReturns = (p) async =>
        ReturnPage(page: p, perPage: 100, total: 101, data: []);
    watchReturns();
    await expectLater(
      c.read(returnEligibilityProvider('o').future),
      throwsA(isA<AppFailure>()),
    );
    expect(repo.returnPages, [1]);
  });
  for (final reviews in [true, false]) {
    test(
      'late ${reviews ? 'review' : 'return'} history from A cannot appear in B',
      () async {
        serverOrder = order(reviewed: null);
        final oldReviews = Completer<ReviewPage>();
        final oldReturns = Completer<ReturnPage>();
        repo.onReviews = (_) => repo.reviewPages.length == 1
            ? oldReviews.future
            : Future.value(const ReviewPage(perPage: 100));
        repo.onReturns = (_) => repo.returnPages.length == 1
            ? oldReturns.future
            : Future.value(
                const ReturnPage(page: 1, perPage: 100, total: 0, data: []),
              );
        if (reviews) {
          watchReviews();
        } else {
          watchReturns();
        }
        await flush();
        (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
          const Session.signedIn(User(id: 'B', role: 'customer')),
        );
        await flush();
        if (reviews) {
          expect(await c.read(reviewEligibilityProvider('o').future), {'i'});
          oldReviews.complete(
            ReviewPage(perPage: 100, total: 1, data: [review()]),
          );
        } else {
          expect(
            (await c.read(
              returnEligibilityProvider('o').future,
            )).remaining['i'],
            .5,
          );
          oldReturns.complete(
            ReturnPage(
              page: 1,
              perPage: 100,
              total: 1,
              data: [returned(quantity: .5)],
            ),
          );
        }
        await flush();
        if (reviews) {
          expect(c.read(reviewEligibilityProvider('o')).requireValue, {'i'});
        } else {
          expect(
            c.read(returnEligibilityProvider('o')).requireValue.remaining['i'],
            .5,
          );
        }
      },
    );
    for (final fail in [false, true]) {
      test(
        'late ${reviews ? 'review' : 'return'} mutation result/error=$fail from A is discarded',
        () async {
          watchReviews();
          watchReturns();
          await c.read(reviewEligibilityProvider('o').future);
          await c.read(returnEligibilityProvider('o').future);
          final reviewResult = Completer<Review>();
          final returnResult = Completer<ReturnRequest>();
          repo.onSubmitReview = () => reviewResult.future;
          repo.onSubmitReturn = () => returnResult.future;
          final Future<Object?> pending = reviews
              ? c
                    .read(reviewEligibilityProvider('o').notifier)
                    .submit(item: serverOrder.items.single, rating: 5)
              : c
                    .read(returnEligibilityProvider('o').notifier)
                    .submit(
                      items: [
                        const ReturnRequestItem(
                          orderItemId: 'i',
                          quantity: .125,
                        ),
                      ],
                    );
          (c.read(sessionControllerProvider.notifier) as TestSession)
              .setSession(
                const Session.signedIn(User(id: 'B', role: 'customer')),
              );
          await flush();
          await c.read(reviewEligibilityProvider('o').future);
          await c.read(returnEligibilityProvider('o').future);
          if (reviews) {
            if (fail) {
              reviewResult.completeError(const AppFailure.network());
            } else {
              reviewResult.complete(review());
            }
          } else {
            if (fail) {
              returnResult.completeError(const AppFailure.network());
            } else {
              returnResult.complete(returned());
            }
          }
          expect(await pending, isNull);
          expect(c.read(reviewEligibilityProvider('o')).requireValue, {'i'});
          expect(
            c.read(returnEligibilityProvider('o')).requireValue.remaining['i'],
            .5,
          );
        },
      );
    }
  }
  test(
    'logout removes loaded state; login to the same customer refetches',
    () async {
      watchReturns();
      await c.read(returnEligibilityProvider('o').future);
      await c
          .read(returnEligibilityProvider('o').notifier)
          .submit(
            items: [const ReturnRequestItem(orderItemId: 'i', quantity: .125)],
          );
      final session = c.read(sessionControllerProvider.notifier) as TestSession;
      session.setSession(const Session.signedOut());
      await flush();
      expect(c.read(returnEligibilityProvider('o')).asData, isNull);
      session.setSession(
        const Session.signedIn(User(id: 'A', role: 'customer')),
      );
      await flush();
      expect(
        (await c.read(returnEligibilityProvider('o').future)).remaining['i'],
        .5,
      );
    },
  );
}

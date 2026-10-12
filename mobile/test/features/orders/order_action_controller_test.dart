import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/order_action_providers.dart';
import '../../helpers/test_session.dart';
import 'order_action_lifecycle_test.dart' show Carts, Orders, readyCart;

class QueuedCarts extends Carts {
  final events = <String>[];
  Completer<Cart>? mutation;
  @override
  Future<Cart> applyCoupon(String code) async {
    events.add('coupon:start');
    current = await mutation!.future;
    events.add('coupon:end');
    return current;
  }

  @override
  Future<Cart> fetchCart() {
    events.add('cart:read');
    return super.fetchCart();
  }
}

void main() {
  late QueuedCarts carts;
  late Orders orders;
  late ProviderContainer c;
  setUp(() async {
    carts = QueuedCarts();
    orders = Orders(carts);
    c = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        sessionControllerProvider.overrideWith(TestSession.new),
        cartRepositoryProvider.overrideWithValue(carts),
        orderRepositoryProvider.overrideWithValue(orders),
      ],
    );
    addTearDown(c.dispose);
    await c.read(sessionControllerProvider.future);
    await c.read(cartControllerProvider.future);
    c.listen(ordersProvider, (_, _) {});
    await c.read(ordersProvider.future);
    c.listen(checkoutControllerProvider, (_, _) {});
    c.listen(orderCancellationProvider('o'), (_, _) {});
  });
  Future<void> flush() async {
    await Future<void>.delayed(Duration.zero);
    await c.pump();
  }

  void switchCustomer(String id) =>
      (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
        Session.signedIn(User(id: id, role: 'customer')),
      );
  test(
    'checkout queues behind coupon repricing and uses the resulting server snapshot',
    () async {
      carts.mutation = Completer<Cart>();
      final mutation = c
          .read(cartControllerProvider.notifier)
          .applyCoupon('NEW');
      await flush();
      orders.onPlace = () async {
        carts.events.add('order:place');
        carts.current = const Cart();
        return const Order(version: 1, id: 'o', total: 777);
      };
      final checkout = c.read(checkoutControllerProvider.notifier).place('a');
      await flush();
      expect(orders.placements, 0);
      carts.mutation!.complete(
        Cart(items: readyCart.items, total: 777, couponCode: 'NEW'),
      );
      await mutation;
      final result = await checkout;
      expect(result.status, OrderActionStatus.succeeded);
      expect(result.order!.total, 777);
      expect(orders.coupon, 'NEW');
      expect(carts.events, [
        'cart:read',
        'coupon:start',
        'coupon:end',
        'order:place',
        'cart:read',
      ]);
      expect(c.read(cartControllerProvider).requireValue.isEmpty, isTrue);
    },
  );
  test(
    'cart mutations queued during placement wait for its server cart read',
    () async {
      final checkout = c.read(checkoutControllerProvider.notifier).place('a');
      await flush();
      carts.mutation = Completer<Cart>();
      final coupon = c
          .read(cartControllerProvider.notifier)
          .applyCoupon('LATER');
      await flush();
      expect(carts.events, ['cart:read']);
      carts.current = const Cart();
      orders.placeGate.complete(const Order(version: 1, id: 'o'));
      expect((await checkout).status, OrderActionStatus.succeeded);
      await flush();
      expect(carts.events, ['cart:read', 'cart:read', 'coupon:start']);
      carts.mutation!.complete(readyCart);
      await coupon;
      expect(c.read(cartControllerProvider).requireValue, readyCart);
    },
  );
  test(
    'failed prior reprice prevents placement using its old totals',
    () async {
      carts.mutation = Completer<Cart>();
      final mutation = c
          .read(cartControllerProvider.notifier)
          .applyCoupon('BAD');
      await flush();
      final checkout = c.read(checkoutControllerProvider.notifier).place('a');
      carts.mutation!.completeError(const AppFailure.network());
      await mutation;
      expect((await checkout).status, OrderActionStatus.failed);
      expect(orders.placements, 0);
      expect(c.read(checkoutControllerProvider), isFalse);
    },
  );
  test(
    'successful placement is not reported failed when refreshing the consumed cart fails',
    () async {
      final action = c.read(checkoutControllerProvider.notifier).place('a');
      await flush();
      carts.onFetch = () async => throw const AppFailure.network();
      orders.placeGate.complete(const Order(version: 1, id: 'o'));
      expect((await action).status, OrderActionStatus.succeeded);
      await flush();
      expect(c.read(cartControllerProvider).hasError, isTrue);
      expect(orders.reads, 2);
      expect(c.read(checkoutControllerProvider), isFalse);
      expect(
        (await c.read(checkoutControllerProvider.notifier).place('a')).status,
        OrderActionStatus.failed,
      );
      expect(orders.placements, 1);
    },
  );
  for (final checkout in [true, false]) {
    test(
      '${checkout ? 'checkout' : 'cancel'} duplicates are suppressed and unexpected errors release busy',
      () async {
        Future<OrderActionResult> run() => checkout
            ? c.read(checkoutControllerProvider.notifier).place('a')
            : c
                  .read(orderCancellationProvider('o').notifier)
                  .cancel(version: 1);
        final first = run();
        await flush();
        expect((await run()).status, OrderActionStatus.duplicate);
        (checkout ? orders.placeGate : orders.cancelGate).completeError(
          StateError('unexpected'),
        );
        expect((await first).status, OrderActionStatus.failed);
        expect(
          checkout
              ? c.read(checkoutControllerProvider)
              : c.read(orderCancellationProvider('o')),
          isFalse,
        );
        if (checkout) {
          orders.onPlace = () async => const Order(version: 1, id: 'retry');
        } else {
          orders.onCancel = () async => const Order(version: 1, id: 'retry');
        }
        expect((await run()).status, OrderActionStatus.succeeded);
      },
    );
    for (final fail in [true, false]) {
      test(
        '${checkout ? 'checkout' : 'cancel'} late ${fail ? 'error' : 'success'} cannot alter B or clear B busy',
        () async {
          final first = checkout
              ? c.read(checkoutControllerProvider.notifier).place('a')
              : c
                    .read(orderCancellationProvider('o').notifier)
                    .cancel(version: 1);
          await flush();
          switchCustomer('B');
          await flush();
          await c.read(cartControllerProvider.future);
          final next = Completer<Order>();
          if (checkout) {
            orders.onPlace = () => next.future;
          } else {
            orders.onCancel = () => next.future;
          }
          final second = checkout
              ? c.read(checkoutControllerProvider.notifier).place('b')
              : c
                    .read(orderCancellationProvider('o').notifier)
                    .cancel(version: 1);
          await flush();
          final reads = orders.reads, cartReads = carts.reads;
          if (fail) {
            (checkout ? orders.placeGate : orders.cancelGate).completeError(
              const AppFailure.network(),
            );
          } else {
            (checkout ? orders.placeGate : orders.cancelGate).complete(
              const Order(version: 1, id: 'A-private'),
            );
          }
          expect((await first).status, OrderActionStatus.superseded);
          expect(orders.reads, reads);
          expect(carts.reads, cartReads);
          expect(
            checkout
                ? c.read(checkoutControllerProvider)
                : c.read(orderCancellationProvider('o')),
            isTrue,
          );
          next.complete(const Order(version: 1, id: 'B'));
          expect((await second).order!.id, 'B');
        },
      );
    }
    test(
      '${checkout ? 'checkout' : 'cancel'} same-customer profile refresh preserves pending ownership',
      () async {
        final first = checkout
            ? c.read(checkoutControllerProvider.notifier).place('a')
            : c
                  .read(orderCancellationProvider('o').notifier)
                  .cancel(version: 1);
        await flush();
        (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
          const Session.signedIn(
            User(id: 'customer', role: 'customer', name: 'Updated'),
          ),
        );
        await flush();
        (checkout ? orders.placeGate : orders.cancelGate).complete(
          const Order(version: 1, id: 'o'),
        );
        expect((await first).status, OrderActionStatus.succeeded);
      },
    );
    test(
      '${checkout ? 'checkout' : 'cancel'} logout and login to the same customer rejects old completion',
      () async {
        final first = checkout
            ? c.read(checkoutControllerProvider.notifier).place('a')
            : c
                  .read(orderCancellationProvider('o').notifier)
                  .cancel(version: 1);
        await flush();
        (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
          const Session.signedOut(),
        );
        await flush();
        switchCustomer('customer');
        await flush();
        final reads = orders.reads;
        (checkout ? orders.placeGate : orders.cancelGate).complete(
          const Order(version: 1, id: 'old'),
        );
        expect((await first).status, OrderActionStatus.superseded);
        expect(orders.reads, reads);
      },
    );
  }
  test('cancellation refreshes only its own detail and tracking', () async {
    c.listen(orderProvider('o'), (_, _) {});
    c.listen(orderProvider('other'), (_, _) {});
    c.listen(orderTrackingProvider('o'), (_, _) {});
    c.listen(orderTrackingProvider('other'), (_, _) {});
    await c.read(orderProvider('o').future);
    await c.read(orderProvider('other').future);
    await c.read(orderTrackingProvider('o').future);
    await c.read(orderTrackingProvider('other').future);
    final details = orders.details, tracks = orders.tracks;
    final action = c
        .read(orderCancellationProvider('o').notifier)
        .cancel(version: 1);
    orders.cancelGate.complete(
      const Order(version: 1, id: 'o', status: 'cancelled'),
    );
    await action;
    await flush();
    expect(orders.details, details + 1);
    expect(orders.tracks, tracks + 1);
  });
}

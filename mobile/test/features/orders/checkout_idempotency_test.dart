import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/cart/presentation/screens/cart_screen.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/order_repository_remote.dart';
import 'package:shubayr/features/orders/presentation/providers/order_action_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/pending_checkout_provider.dart';

import '../../helpers/test_session.dart';
import 'api11_actions_test.dart' show conflict, priceCart;
import 'order_action_lifecycle_test.dart' show Carts, Orders;

class CheckoutOrders extends Orders {
  CheckoutOrders(super.cart);
  final keys = <String>[];
  final addresses = <String>[];
  final acceptances = <List<({String variantId, String priceVersion})>>[];
  @override
  Future<Order> placeOrder({
    required String idempotencyKey,
    required String addressId,
    String? couponCode,
    List<({String variantId, String priceVersion})> acceptedPriceVersions =
        const [],
  }) {
    keys.add(idempotencyKey);
    addresses.add(addressId);
    acceptances.add(acceptedPriceVersions);
    return super.placeOrder(
      idempotencyKey: idempotencyKey,
      addressId: addressId,
      couponCode: couponCode,
      acceptedPriceVersions: acceptedPriceVersions,
    );
  }
}

class UnwritableStore extends PendingRequestStore {
  UnwritableStore() : super.memory();
  @override
  Future<PendingRequest> prepare(
    String slot,
    Map<String, dynamic> body,
  ) async => throw StateError('storage unavailable');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Carts carts;
  late CheckoutOrders orders;
  late PendingRequestStore store;
  late ProviderContainer c;
  Future<ProviderContainer> start() async {
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        sessionControllerProvider.overrideWith(TestSession.new),
        pendingRequestStoreProvider.overrideWithValue(store),
        cartRepositoryProvider.overrideWithValue(carts),
        orderRepositoryProvider.overrideWithValue(orders),
      ],
    );
    addTearDown(container.dispose);
    await container.read(sessionControllerProvider.future);
    await container.read(cartControllerProvider.future);
    container.listen(checkoutControllerProvider, (_, _) {});
    return container;
  }

  setUp(() async {
    carts = Carts();
    orders = CheckoutOrders(carts);
    store = PendingRequestStore.memory();
    c = await start();
  });
  CheckoutController controller() =>
      c.read(checkoutControllerProvider.notifier);
  String slot() => c.read(pendingCheckoutSlotProvider)!;

  test(
    'persists before HTTP and recovers original key/payload after restart and consumed cart',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      store = PendingRequestStore();
      c = await start();
      final originalSlot = slot();
      orders.onPlace = () async {
        expect((await store.read(originalSlot))!.id, orders.keys.last);
        carts.current = const Cart(); // Server committed, response was lost.
        throw const AppFailure.timeout();
      };
      expect(
        (await controller().place('original-address')).status,
        OrderActionStatus.failed,
      );
      final key = orders.keys.single;
      expect(
        (await controller().place('different-address')).status,
        OrderActionStatus.failed,
      );
      expect(orders.keys, [key]);
      store = PendingRequestStore();
      final restarted = await start();
      orders.onPlace = () async =>
          const Order(id: 'original-order', version: 1);
      final result = await restarted
          .read(checkoutControllerProvider.notifier)
          .recover();
      expect(result.order!.id, 'original-order');
      expect(orders.keys, [key, key]);
      expect(orders.addresses, ['original-address', 'original-address']);
      expect(await store.read(originalSlot), isNull);
    },
  );
  test('storage failure prevents any order HTTP write', () async {
    store = UnwritableStore();
    c = await start();
    expect((await controller().place('a')).status, OrderActionStatus.failed);
    expect(orders.keys, isEmpty);
  });
  test(
    'PRICE_CHANGED rejection releases key; explicit consent uses a new key with exact tokens',
    () async {
      carts.current = priceCart;
      c.invalidate(cartControllerProvider);
      await c.read(cartControllerProvider.future);
      orders.onPlace = () async => throw conflict();
      final offered = await controller().place('a');
      expect(await store.read(slot()), isNull);
      orders.onPlace = () async => const Order(id: 'accepted', version: 1);
      expect(
        (await controller().place(
          'a',
          acceptedPriceChanges: offered.priceChanges,
        )).status,
        OrderActionStatus.succeeded,
      );
      expect(orders.keys[1], isNot(orders.keys[0]));
      expect(orders.acceptances[0], isEmpty);
      expect(orders.acceptances[1], [
        (variantId: 'v', priceVersion: 'server-new'),
      ]);
    },
  );
  test(
    'a later rejection never discards the key of an uncertain earlier attempt',
    () async {
      orders.onPlace = () async => throw const AppFailure.network();
      await controller().place('a');
      final key = orders.keys.single;
      orders.onPlace = () async => throw const AppFailure(
        FailureKind.conflict,
        statusCode: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
      );
      await controller().recover();
      expect((await store.read(slot()))!.id, key);
      expect(orders.keys, [key, key]);
    },
  );
  test('a new customer cannot recover another account checkout', () async {
    orders.onPlace = () async => throw const AppFailure.timeout();
    await controller().place('a');
    final previousSlot = slot();
    (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
      const Session.signedIn(User(id: 'B', role: 'customer')),
    );
    await c.pump();
    expect(slot(), isNot(previousSlot));
    expect((await controller().recover()).status, OrderActionStatus.failed);
    expect(orders.keys, hasLength(1));
    expect(await store.read(previousSlot), isNotNull);
  });
  test(
    'recovery suppresses duplicates and remains successful if cart reread fails',
    () async {
      orders.onPlace = () async => throw const AppFailure.timeout();
      await controller().place('a');
      final gate = Completer<Order>();
      orders.onPlace = () => gate.future;
      final recovering = controller().recover();
      expect(
        (await controller().recover()).status,
        OrderActionStatus.duplicate,
      );
      await Future<void>.delayed(Duration.zero);
      carts.onFetch = () async => throw const AppFailure.network();
      gate.complete(const Order(id: 'recovered', version: 1));
      expect((await recovering).order!.id, 'recovered');
      expect(c.read(cartControllerProvider).hasError, isTrue);
      expect(await store.read(slot()), isNull);
    },
  );
  test('remote order creation sends the operation key header', () async {
    final dio = Dio();
    addTearDown(dio.close);
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (request, handler) {
          expect(request.headers['Idempotency-Key'], 'persisted-operation-key');
          expect(request.data, {'address_id': 'a', 'payment_method': 'cod'});
          handler.resolve(
            Response(requestOptions: request, data: {'id': 'o', 'version': 1}),
          );
        },
      ),
    );
    await OrderRepositoryRemote(
      ApiClient(dio),
    ).placeOrder(idempotencyKey: 'persisted-operation-key', addressId: 'a');
  });
  testWidgets('empty cart exposes recovery after reopening', (tester) async {
    await tester.runAsync(() async {
      carts.current = const Cart();
      c.invalidate(cartControllerProvider);
      await c.read(cartControllerProvider.future);
      await store.prepare(slot(), {'address_id': 'a', 'payment_method': 'cod'});
      c.listen(pendingCheckoutProvider, (_, _) {});
      await c.read(pendingCheckoutProvider.future);
    });
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const CartScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Resolve previous checkout'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

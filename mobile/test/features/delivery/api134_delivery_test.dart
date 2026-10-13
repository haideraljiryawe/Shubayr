import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_remote.dart';
import 'package:shubayr/features/delivery/domain/delivery_collection_input.dart';
import 'package:shubayr/features/delivery/presentation/providers/delivery_providers.dart';

import 'support/delivery_fakes.dart';

class _Api {
  _Api() {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (request, handler) {
          if (request.method == 'GET') {
            handler.resolve(
              Response(
                requestOptions: request,
                data: {
                  'page': 1,
                  'per_page': 20,
                  'total': 1,
                  'data': [delivery],
                },
              ),
            );
            return;
          }
          final body = Map<String, dynamic>.from(request.data as Map);
          writes.add(body);
          if (staleOnce) {
            staleOnce = false;
            delivery = {...delivery, 'order_version': 2};
            handler.reject(
              DioException(
                requestOptions: request,
                type: DioExceptionType.badResponse,
                response: Response(
                  requestOptions: request,
                  statusCode: 409,
                  data: {'code': 'STALE_ORDER_STATE'},
                ),
              ),
            );
            return;
          }
          final id = body['operation_id'] as String;
          final answer = posted.putIfAbsent(id, () {
            delivery = {...delivery, 'status': 'delivered', 'order_version': 2};
            return Map<String, dynamic>.from(delivery);
          });
          if (loseOnce) {
            loseOnce = false;
            handler.reject(
              DioException(
                requestOptions: request,
                type: DioExceptionType.receiveTimeout,
              ),
            );
          } else {
            handler.resolve(Response(requestOptions: request, data: answer));
          }
        },
      ),
    );
  }
  final dio = Dio();
  var loseOnce = false;
  var staleOnce = false;
  final writes = <Map<String, dynamic>>[];
  final posted = <String, Map<String, dynamic>>{};
  Map<String, dynamic> delivery = {
    'id': 'd',
    'order_id': 'o',
    'status': 'out_for_delivery',
    'order_version': 1,
    'amount_due': 25000,
    'delivery_fee': 5000,
    'currency': 'IQD',
  };
}

class _UnavailableStore extends PendingRequestStore {
  _UnavailableStore({this.failCleanup = false}) : super.memory();
  final bool failCleanup;
  @override
  Future<PendingRequest> prepare(String slot, Map<String, dynamic> body) {
    if (!failCleanup) throw StateError('storage unavailable');
    return super.prepare(slot, body);
  }

  @override
  Future<void> complete(String slot, String id) =>
      throw StateError('storage unavailable');
}

Future<ProviderContainer> _container(
  _Api api,
  PendingRequestStore store,
) async {
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      dataSourceProvider.overrideWithValue(DataSource.mock),
      sessionControllerProvider.overrideWith(() => DeliveryTestSession()),
      pendingRequestStoreProvider.overrideWithValue(store),
      deliveryRepositoryProvider.overrideWithValue(
        DeliveryRepositoryRemote(ApiClient(api.dio)),
      ),
    ],
  );
  await container.read(sessionControllerProvider.future);
  await container.read(deliveriesProvider.future);
  return container;
}

void main() {
  for (final amount in ['25000', '20000', '0', null]) {
    test('delivered wire contract and authoritative due: $amount', () async {
      final api = _Api();
      addTearDown(api.dio.close);
      final c = await _container(api, PendingRequestStore.memory());
      addTearDown(c.dispose);
      expect(
        c.read(deliveriesProvider).requireValue.items.single.amountDue,
        25000,
      );
      final choice = amount == null
          ? const DeliveryCollectionInput.unconfirmed()
          : DeliveryCollectionInput.confirmed(amount);
      expect(
        await c
            .read(deliveriesProvider.notifier)
            .updateStatus('d', 'delivered', collection: choice),
        isTrue,
      );
      final body = api.writes.single;
      expect(body, {
        'status': 'delivered',
        'order_version': 1,
        'operation_id': isA<String>(),
        'collection_confirmation': amount == null ? 'unconfirmed' : 'confirmed',
        'collected_amount': ?amount,
      });
      expect((body['operation_id'] as String).length, inInclusiveRange(8, 128));
    });
  }

  test('invalid and excessive amounts never reach HTTP', () async {
    final api = _Api();
    addTearDown(api.dio.close);
    final c = await _container(api, PendingRequestStore.memory());
    addTearDown(c.dispose);
    for (final amount in ['25001', '-1', '', '1e3', '1.1234567', 'NaN']) {
      await expectLater(
        c
            .read(deliveriesProvider.notifier)
            .updateStatus(
              'd',
              'delivered',
              collection: DeliveryCollectionInput.confirmed(amount),
            ),
        throwsA(isA<AppFailure>()),
      );
    }
    expect(api.writes, isEmpty);
    expect(DeliveryCollectionInput.confirmed('٢٠٬٠٠٠').amount, '20000');
  });

  test(
    'lost success survives controller recreation and replays original version and body',
    () async {
      final api = _Api()..loseOnce = true;
      addTearDown(api.dio.close);
      final store = PendingRequestStore.memory();
      final first = await _container(api, store);
      await expectLater(
        first
            .read(deliveriesProvider.notifier)
            .updateStatus(
              'd',
              'delivered',
              collection: DeliveryCollectionInput.confirmed('20000'),
            ),
        throwsA(isA<AppFailure>()),
      );
      first.dispose();
      final c = await _container(api, store);
      addTearDown(c.dispose);
      final controller = c.read(deliveriesProvider.notifier);
      expect(
        c.read(deliveriesProvider).requireValue.items.single.orderVersion,
        2,
      );
      expect((await controller.pendingCollection('d'))!.amount, '20000');
      await expectLater(
        controller.updateStatus(
          'd',
          'delivered',
          collection: DeliveryCollectionInput.confirmed('25000'),
        ),
        throwsA(
          isA<AppFailure>().having((e) => e.code, 'code', 'PENDING_REQUEST'),
        ),
      );
      expect(api.writes, hasLength(1));
      expect(
        await controller.updateStatus(
          'd',
          'delivered',
          collection: DeliveryCollectionInput.confirmed('20000'),
        ),
        isTrue,
      );
      expect(api.writes[1], api.writes[0]);
      expect(api.posted, hasLength(1));
      expect(await controller.pendingCollection('d'), isNull);
    },
  );

  test(
    'stale version reloads and never repeats automatically; fresh choice gets a new operation',
    () async {
      final api = _Api()..staleOnce = true;
      addTearDown(api.dio.close);
      final c = await _container(api, PendingRequestStore.memory());
      addTearDown(c.dispose);
      final controller = c.read(deliveriesProvider.notifier);
      await expectLater(
        controller.updateStatus(
          'd',
          'delivered',
          collection: const DeliveryCollectionInput.unconfirmed(),
        ),
        throwsA(
          isA<AppFailure>().having((e) => e.code, 'code', 'STALE_ORDER_STATE'),
        ),
      );
      expect(api.writes, hasLength(1));
      expect(
        c.read(deliveriesProvider).requireValue.items.single.orderVersion,
        2,
      );
      expect(await controller.pendingCollection('d'), isNull);
      await controller.updateStatus(
        'd',
        'delivered',
        collection: const DeliveryCollectionInput.unconfirmed(),
      );
      expect(api.writes.last['order_version'], 2);
      expect(
        api.writes.last['operation_id'],
        isNot(api.writes.first['operation_id']),
      );
    },
  );

  test(
    'unavailable secure storage prevents dispatch of a new collection',
    () async {
      final api = _Api();
      addTearDown(api.dio.close);
      final c = await _container(api, _UnavailableStore());
      addTearDown(c.dispose);
      await expectLater(
        c
            .read(deliveriesProvider.notifier)
            .updateStatus(
              'd',
              'delivered',
              collection: const DeliveryCollectionInput.unconfirmed(),
            ),
        throwsStateError,
      );
      expect(api.writes, isEmpty);
      expect(c.read(deliveriesProvider).requireValue.updatingId, isNull);
    },
  );

  test(
    'cleanup failure after stale rejection still releases busy state and reloads',
    () async {
      final api = _Api()..staleOnce = true;
      addTearDown(api.dio.close);
      final c = await _container(api, _UnavailableStore(failCleanup: true));
      addTearDown(c.dispose);
      await expectLater(
        c
            .read(deliveriesProvider.notifier)
            .updateStatus(
              'd',
              'delivered',
              collection: const DeliveryCollectionInput.unconfirmed(),
            ),
        throwsStateError,
      );
      expect(c.read(deliveriesProvider).requireValue.updatingId, isNull);
      expect(
        c.read(deliveriesProvider).requireValue.items.single.orderVersion,
        2,
      );
      expect(api.writes, hasLength(1));
    },
  );

  test(
    'missing/invalid required due is malformed, never zero or delivery fee',
    () async {
      final api = _Api();
      addTearDown(api.dio.close);
      final repo = DeliveryRepositoryRemote(ApiClient(api.dio));
      for (final value in [null, -1, '25000', double.infinity]) {
        api.delivery['amount_due'] = value;
        await expectLater(
          repo.fetchAssigned(),
          throwsA(
            isA<AppFailure>().having(
              (e) => e.code,
              'code',
              'MALFORMED_RESPONSE',
            ),
          ),
        );
      }
      api.delivery.remove('amount_due');
      await expectLater(repo.fetchAssigned(), throwsA(isA<AppFailure>()));
    },
  );
}

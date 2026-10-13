import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/cart/data/cart_repository_remote.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_remote.dart';

/// Launched only by tool/verify_api134.mjs against its disposable database.
void main() {
  const enabled = bool.fromEnvironment('RUN_API134_LIVE');
  test(
    'Flutter repositories round-trip API 13.4 collection and cart replay',
    () async {
      final fixture =
          jsonDecode(
                await File(
                  const String.fromEnvironment('API134_FIXTURE'),
                ).readAsString(),
              )
              as Map<String, dynamic>;
      final uri = Uri.parse(fixture['api'] as String);
      expect(uri.host, '127.0.0.1');
      expect(uri.port, isNot(8000));
      expect(
        RegExp(
          r'^shubayr_[a-f0-9]{16}_verify$',
        ).hasMatch(fixture['database'] as String),
        isTrue,
      );
      final dio = Dio(BaseOptions(baseUrl: uri.toString()));
      addTearDown(dio.close);
      final api = ApiClient(dio);
      Future<void> login(String phone) async {
        dio.options.headers.remove('Authorization');
        final challenge = await api.post<Map<String, dynamic>>(
          '/auth/request-otp',
          body: {'phone': phone},
        );
        final result = await api.post<Map<String, dynamic>>(
          '/auth/verify-otp',
          body: {'phone': phone, 'code': challenge['dev_otp']},
        );
        dio.options.headers['Authorization'] =
            'Bearer ${result['access_token']}';
      }

      await login('+9647700000005');
      final deliveries = DeliveryRepositoryRemote(api);
      final page = await deliveries.fetchAssigned(perPage: 100);
      var index = 0;
      for (final amount in ['105000', '95000', null]) {
        final id = (fixture['deliveries'] as List)[index++] as String;
        final delivery = page.data.singleWhere((d) => d.id == id);
        expect(delivery.amountDue, 105000);
        expect(delivery.deliveryFee, 5000);
        final operation = 'flutter-api134-$id';
        if (amount != null) {
          await expectLater(
            deliveries.updateStatus(
              id,
              'delivered',
              orderVersion: delivery.orderVersion!,
              operationId: '$operation-invalid',
              collectionConfirmation: 'confirmed',
              collectedAmount: '105001',
            ),
            throwsA(
              isA<AppFailure>().having((e) => e.statusCode, 'status', 422),
            ),
          );
        }
        final updated = await deliveries.updateStatus(
          id,
          'delivered',
          orderVersion: delivery.orderVersion!,
          operationId: operation,
          collectionConfirmation: amount == null ? 'unconfirmed' : 'confirmed',
          collectedAmount: amount,
        );
        final replay = await deliveries.updateStatus(
          id,
          'delivered',
          orderVersion: delivery.orderVersion!,
          operationId: operation,
          collectionConfirmation: amount == null ? 'unconfirmed' : 'confirmed',
          collectedAmount: amount,
        );
        expect(updated.status, 'delivered');
        expect(replay.orderVersion, updated.orderVersion);
        expect(replay.amountDue, 105000);
      }
      final staleId = (fixture['deliveries'] as List)[3] as String;
      await expectLater(
        deliveries.updateStatus(
          staleId,
          'delivered',
          orderVersion: 1,
          operationId: 'flutter-stale-$staleId',
          collectionConfirmation: 'unconfirmed',
        ),
        throwsA(
          isA<AppFailure>().having((e) => e.code, 'code', 'STALE_ORDER_STATE'),
        ),
      );
      await login('+9647700000006');
      final carts = CartRepositoryRemote(api);
      final variant = fixture['variant_id'] as String;
      final product = fixture['product_id'] as String;
      final before = await carts.fetchCart();
      final beforeQuantity = before.items
          .where((i) => i.variantId == variant)
          .fold<num>(0, (n, i) => n + i.quantity);
      final added = await carts.addItem(
        productId: product,
        variantId: variant,
        quantity: 1,
        idempotencyKey: 'flutter-cart-add-134',
      );
      final replay = await carts.addItem(
        productId: product,
        variantId: variant,
        quantity: 1,
        idempotencyKey: 'flutter-cart-add-134',
      );
      expect(
        added.items.singleWhere((i) => i.variantId == variant).quantity,
        beforeQuantity + 1,
      );
      expect(
        replay.items.singleWhere((i) => i.variantId == variant).quantity,
        beforeQuantity + 1,
      );
      await expectLater(
        carts.addItem(
          productId: product,
          variantId: variant,
          quantity: 2,
          idempotencyKey: 'flutter-cart-add-134',
        ),
        throwsA(
          isA<AppFailure>().having(
            (e) => e.code,
            'code',
            'IDEMPOTENCY_KEY_REUSED',
          ),
        ),
      );
    },
    skip: enabled ? false : 'Requires tool/verify_api134.mjs isolated API',
    timeout: const Timeout(Duration(minutes: 2)),
  );
}

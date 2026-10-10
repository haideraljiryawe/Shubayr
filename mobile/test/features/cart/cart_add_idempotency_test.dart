import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/cart_repository_remote.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import '../../helpers/test_session.dart';

void main() {
  test(
    'lost cart add reuses only the original intent; a later add gets a fresh key',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      final writes = <RequestOptions>[];
      final committed = <String>{};
      num totalQuantity = 0;
      var loseOnce = true;
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            if (request.method == 'POST') {
              writes.add(request);
              final key = request.headers['Idempotency-Key'] as String;
              if (committed.add(key)) {
                totalQuantity += request.data['quantity'] as num;
              }
              if (loseOnce) {
                loseOnce = false;
                handler.reject(
                  DioException(
                    requestOptions: request,
                    type: DioExceptionType.receiveTimeout,
                  ),
                );
                return;
              }
            }
            handler.resolve(
              Response(
                requestOptions: request,
                data: const Cart(id: 'cart', currency: 'IQD').toJson(),
              ),
            );
          },
        ),
      );
      final store = PendingRequestStore.memory();
      Future<ProviderContainer> host() async {
        final c = ProviderContainer(
          retry: (_, _) => null,
          overrides: [
            dataSourceProvider.overrideWithValue(DataSource.mock),
            sessionControllerProvider.overrideWith(TestSession.new),
            pendingRequestStoreProvider.overrideWithValue(store),
            cartRepositoryProvider.overrideWithValue(
              CartRepositoryRemote(ApiClient(dio)),
            ),
          ],
        );
        await c.read(sessionControllerProvider.future);
        await c.read(cartControllerProvider.future);
        return c;
      }

      var c = await host();
      expect(
        (await c
                .read(cartControllerProvider.notifier)
                .add(productId: 'p', variantId: 'v', quantity: 1.25))
            .status,
        CartMutationStatus.failed,
      );
      c.dispose();
      c = await host();
      addTearDown(c.dispose);
      final controller = c.read(cartControllerProvider.notifier);
      final changed = await controller.add(
        productId: 'p',
        variantId: 'v',
        quantity: 2,
      );
      expect((changed.error as AppFailure).code, 'PENDING_REQUEST');
      expect(writes, hasLength(1));
      expect(
        (await controller.add(
          productId: 'p',
          variantId: 'v',
          quantity: 1.25,
        )).status,
        CartMutationStatus.succeeded,
      );
      expect(writes[1].data, writes[0].data);
      expect(
        writes[1].headers['Idempotency-Key'],
        writes[0].headers['Idempotency-Key'],
      );
      expect(totalQuantity, 1.25);
      await controller.add(productId: 'p', variantId: 'v', quantity: 1.25);
      expect(
        writes[2].headers['Idempotency-Key'],
        isNot(writes[0].headers['Idempotency-Key']),
      );
      expect(totalQuantity, 2.5);
    },
  );
}

import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';

import '../../helpers/test_session.dart';

class _PendingCart extends CartRepositoryMock {
  final result = Completer<Cart>();

  @override
  Future<Cart> addItem({
    required String productId,
    String? variantId,
    num quantity = 1,
  }) => result.future;
}

void main() {
  for (final fails in [false, true]) {
    test(
      'cart ${fails ? 'error' : 'result'} after disposal is ignored',
      () async {
        final repository = _PendingCart();
        final container = ProviderContainer(
          retry: (retryCount, error) => null,
          overrides: [
            notificationSyncProvider.overrideWith((ref) {}),
            unreadCountProvider.overrideWith((ref) async => 0),
            dataSourceProvider.overrideWithValue(DataSource.mock),
            sessionControllerProvider.overrideWith(TestSession.new),
            cartRepositoryProvider.overrideWithValue(repository),
          ],
        );
        await container.read(sessionControllerProvider.future);
        await container.read(cartControllerProvider.future);
        final pending = container
            .read(cartControllerProvider.notifier)
            .add(productId: 'p1');
        await Future<void>.delayed(Duration.zero);
        container.dispose();
        if (fails) {
          repository.result.completeError(const AppFailure.network());
        } else {
          repository.result.complete(const Cart());
        }
        await expectLater(pending, completes);
      },
    );
  }
}

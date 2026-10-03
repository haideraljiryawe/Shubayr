import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import '../../helpers/test_session.dart';

void main() {
  test(
    'serialized controller mutations retain fractions and reject invalid quantities',
    () async {
      final container = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(TestSession.new),
          cartRepositoryProvider.overrideWithValue(
            CartRepositoryMock(delay: Duration.zero),
          ),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      await container.read(cartControllerProvider.future);
      final controller = container.read(cartControllerProvider.notifier);
      final results = await Future.wait([
        controller.add(productId: 'p1', quantity: 0.1),
        controller.add(productId: 'p1', quantity: 0.2),
      ]);
      expect(
        results.map((r) => r.status),
        everyElement(CartMutationStatus.succeeded),
      );
      var cart = container.read(cartControllerProvider).requireValue;
      expect(cart.items.single.quantity, 0.3);
      expect(cart.count, 0.3);
      await controller.setQuantity(cart.items.single.id, 0.125);
      cart = container.read(cartControllerProvider).requireValue;
      expect(cart.items.single.quantity, 0.125);
      for (final q in [0, 0.0001, 100]) {
        expect(
          (await controller.setQuantity(cart.items.single.id, q)).status,
          CartMutationStatus.failed,
        );
        expect(
          (await controller.add(productId: 'p2', quantity: q)).status,
          CartMutationStatus.failed,
        );
      }
      expect(
        container
            .read(cartControllerProvider)
            .requireValue
            .items
            .single
            .quantity,
        0.125,
      );
    },
  );
}

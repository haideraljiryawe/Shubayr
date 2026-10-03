import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/domain/cart_repository.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';

import '../../helpers/test_session.dart';

const _a = Session.signedIn(User(id: 'A', role: 'customer'));
const _b = Session.signedIn(User(id: 'B', role: 'customer'));
const _failure = AppFailure.network();

Cart _cart(String id) => Cart(
  id: id,
  items: const [CartItem(id: 'line', productId: 'product', quantity: 1)],
);

class _Request {
  _Request(this.operation, this.owner);
  final String operation;
  final String? owner;
  final result = Completer<Cart>();
}

class _CartRepository implements CartRepository {
  _CartRepository(this.owner);
  final String? Function() owner;
  final requests = <_Request>[];
  final reads = <String?>[];
  Future<Cart> Function()? onRead;

  @override
  Future<Cart> fetchCart() {
    reads.add(owner());
    return onRead?.call() ?? Future.value(_cart('${owner()}-loaded'));
  }

  Future<Cart> _request(String operation) {
    final request = _Request(operation, owner());
    requests.add(request);
    return request.result.future;
  }

  @override
  Future<Cart> addItem({
    required String productId,
    String? variantId,
    int quantity = 1,
  }) => _request('add:$productId:$variantId:$quantity');
  @override
  Future<Cart> updateItem(String itemId, int quantity) =>
      _request('set:$itemId:$quantity');
  @override
  Future<Cart> removeItem(String itemId) => _request('remove:$itemId');
}

void main() {
  late ProviderContainer container;
  late _CartRepository repository;
  late CartController controller;
  late TestSession session;

  Future<void> flush() async {
    await Future<void>.delayed(Duration.zero);
    await container.pump();
  }

  setUp(() async {
    repository = _CartRepository(
      () => container.read(sessionControllerProvider).value?.user?.id,
    );
    container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        dataSourceProvider.overrideWithValue(DataSource.mock),
        sessionControllerProvider.overrideWith(() => TestSession(initial: _a)),
        cartRepositoryProvider.overrideWithValue(repository),
      ],
    );
    addTearDown(container.dispose);
    await container.read(sessionControllerProvider.future);
    session = container.read(sessionControllerProvider.notifier) as TestSession;
    container.listen(cartControllerProvider, (_, _) {});
    await container.read(cartControllerProvider.future);
    controller = container.read(cartControllerProvider.notifier);
  });

  for (final differentLines in [false, true]) {
    test(
      'serializes writes on ${differentLines ? 'different lines' : 'one line'}',
      () async {
        final first = controller.setQuantity('line', 2);
        final second = controller.setQuantity(
          differentLines ? 'other' : 'line',
          3,
        );
        await flush();
        // A faster second response cannot overtake the first: it is not sent yet.
        expect(repository.requests.map((r) => r.operation), ['set:line:2']);
        repository.requests[0].result.complete(_cart('first'));
        await first;
        await flush();
        expect(
          repository.requests.last.operation,
          differentLines ? 'set:other:3' : 'set:line:3',
        );
        repository.requests[1].result.complete(_cart('second'));
        await second;
        expect(
          container.read(cartControllerProvider).requireValue.id,
          'second',
        );
      },
    );
  }

  test('success then failure preserves the last valid snapshot', () async {
    final first = controller.add(productId: 'one');
    await flush();
    repository.requests.single.result.complete(_cart('saved'));
    await first;
    final second = controller.remove('line');
    await flush();
    repository.requests.last.result.completeError(_failure);
    final failed = await second;
    expect(failed.status, CartMutationStatus.failed);
    expect(failed.error, same(_failure));
    expect(container.read(cartControllerProvider).hasError, isFalse);
    expect(container.read(cartControllerProvider).requireValue.id, 'saved');
  });

  test(
    'a failed write releases the queue for the next successful write',
    () async {
      final first = controller.setQuantity('line', 2);
      final second = controller.remove('other');
      await flush();
      expect(repository.requests, hasLength(1));
      repository.requests.first.result.completeError(_failure);
      await first;
      await flush();
      expect(
        container.read(cartControllerProvider).requireValue.id,
        'A-loaded',
      );
      repository.requests.last.result.complete(_cart('newer'));
      await second;
      expect(container.read(cartControllerProvider).requireValue.id, 'newer');
    },
  );

  for (final fails in [false, true]) {
    for (final next in [_a, _b]) {
      test(
        'late ${fails ? 'failure' : 'success'} cannot affect ${next.user!.id} after reauthentication',
        () async {
          final first = controller.add(productId: 'one');
          final queued = controller.remove('old-line');
          await flush();
          final old = repository.requests.first;
          // No pump between logout/login: even the same ID owns a new session.
          session.setSession(const Session.signedOut());
          session.setSession(next);
          await flush();
          await container.read(cartControllerProvider.future);
          final newer = container
              .read(cartControllerProvider.notifier)
              .add(productId: 'new');
          await flush();
          expect(
            repository.requests.where((r) => r.operation == 'remove:old-line'),
            isEmpty,
          );
          expect(repository.requests.last.operation, 'add:new:null:1');
          repository.requests.last.result.complete(_cart('new-session'));
          await newer;
          if (fails) {
            old.result.completeError(_failure);
          } else {
            old.result.complete(_cart('old-session'));
          }
          expect((await first).status, CartMutationStatus.superseded);
          expect((await queued).status, CartMutationStatus.superseded);
          expect(
            container.read(cartControllerProvider).requireValue.id,
            'new-session',
          );
        },
      );
    }
  }

  test('direct account switch reloads the cart', () async {
    session.setSession(_b);
    await flush();
    expect(
      (await container.read(cartControllerProvider.future)).id,
      'B-loaded',
    );
    expect(repository.reads, ['A', 'B']);
  });

  test('duplicates of a pending add and remove are not sent twice', () async {
    final add = controller.add(productId: 'one');
    final duplicate = controller.add(productId: 'one');
    await flush();
    expect(repository.requests, hasLength(1));
    repository.requests.first.result.complete(_cart('added'));
    await add;
    expect((await duplicate).status, CartMutationStatus.duplicate);
    final remove = controller.remove('line');
    final duplicateRemove = controller.remove('line');
    await flush();
    expect(repository.requests, hasLength(2));
    repository.requests.last.result.complete(_cart('removed'));
    await remove;
    expect((await duplicateRemove).status, CartMutationStatus.duplicate);
  });

  test(
    'sequential repeat additions and distinct quantity intentions still execute',
    () async {
      for (var i = 0; i < 2; i++) {
        final add = controller.add(productId: 'one');
        await flush();
        repository.requests.last.result.complete(_cart('add-$i'));
        await add;
      }
      final changes = [
        controller.setQuantity('line', 2),
        controller.setQuantity('line', 3),
        controller.setQuantity('line', 2),
      ];
      for (var i = 0; i < changes.length; i++) {
        await flush();
        repository.requests[2 + i].result.complete(_cart('quantity-$i'));
        await changes[i];
      }
      expect(repository.requests.map((r) => r.operation), [
        'add:one:null:1',
        'add:one:null:1',
        'set:line:2',
        'set:line:3',
        'set:line:2',
      ]);
      expect(
        container.read(cartControllerProvider).requireValue.id,
        'quantity-2',
      );
    },
  );

  test(
    'refresh waits behind writes and cannot restore an older snapshot',
    () async {
      final write = controller.setQuantity('line', 2);
      await flush();
      final read = Completer<Cart>();
      repository.onRead = () => read.future;
      container.invalidate(cartControllerProvider);
      await flush();
      expect(repository.reads, ['A']);
      repository.requests.single.result.complete(_cart('written'));
      await write;
      await flush();
      expect(repository.reads, ['A', 'A']);
      read.complete(_cart('refreshed'));
      expect(
        (await container.read(cartControllerProvider.future)).id,
        'refreshed',
      );
    },
  );

  test('writes wait for an outstanding load', () async {
    final read = Completer<Cart>();
    repository.onRead = () => read.future;
    container.invalidate(cartControllerProvider);
    await flush();
    final write = container
        .read(cartControllerProvider.notifier)
        .add(productId: 'one');
    await flush();
    expect(repository.requests, isEmpty);
    read.complete(_cart('loaded'));
    await flush();
    repository.requests.single.result.complete(_cart('written'));
    await write;
    expect(container.read(cartControllerProvider).requireValue.id, 'written');
  });

  test('signed out callers cannot send a cart mutation', () async {
    session.setSession(const Session.signedOut());
    await flush();
    await container.read(cartControllerProvider.future);
    final result = controller.add(productId: 'one');
    await flush();
    expect(repository.requests, isEmpty);
    await result;
    expect(container.read(cartControllerProvider).requireValue.isEmpty, isTrue);
  });

  test(
    'new session exposes no previous cart during its load or error',
    () async {
      final read = Completer<Cart>();
      repository.onRead = () => read.future;
      session.setSession(_b);
      await flush();
      expect(container.read(cartControllerProvider).value?.isEmpty, isTrue);
      read.completeError(_failure);
      await flush();
      expect(container.read(cartControllerProvider).hasError, isTrue);
      expect(container.read(cartControllerProvider).value?.isEmpty, isTrue);
    },
  );

  for (final fails in [false, true]) {
    test(
      'old completion before dependency rebuild is ignored ($fails)',
      () async {
        final old = controller.add(productId: 'old');
        await flush();
        session.setSession(_b);
        if (fails) {
          repository.requests.single.result.completeError(_failure);
        } else {
          repository.requests.single.result.complete(_cart('old'));
        }
        expect((await old).status, CartMutationStatus.superseded);
        await flush();
        expect(
          (await container.read(cartControllerProvider.future)).id,
          'B-loaded',
        );
      },
    );
  }

  test(
    'load error remains retryable and does not poison later writes',
    () async {
      repository.onRead = () => Future.error(_failure);
      container.invalidate(cartControllerProvider);
      await flush();
      expect(container.read(cartControllerProvider).hasError, isTrue);
      repository.onRead = null;
      container.invalidate(cartControllerProvider);
      await flush();
      expect(
        (await container.read(cartControllerProvider.future)).id,
        'A-loaded',
      );
      final write = controller.add(productId: 'one');
      await flush();
      repository.requests.single.result.complete(_cart('recovered'));
      expect((await write).status, CartMutationStatus.succeeded);
      expect(
        container.read(cartControllerProvider).requireValue.id,
        'recovered',
      );
    },
  );

  test(
    'queued writes after a refresh run after its read and own the final state',
    () async {
      final read = Completer<Cart>();
      repository.onRead = () => read.future;
      container.invalidate(cartControllerProvider);
      await flush();
      final writes = [
        controller.add(productId: 'one'),
        controller.remove('line'),
      ];
      read.complete(_cart('read'));
      await flush();
      repository.requests[0].result.complete(_cart('added'));
      await writes[0];
      await flush();
      repository.requests[1].result.complete(_cart('removed'));
      await writes[1];
      expect(container.read(cartControllerProvider).requireValue.id, 'removed');
    },
  );

  test(
    'distinct add payloads are preserved and failed additions can be retried',
    () async {
      final first = controller.add(productId: 'one', variantId: 'small');
      final second = controller.add(productId: 'one', variantId: 'large');
      await flush();
      repository.requests[0].result.completeError(_failure);
      expect((await first).status, CartMutationStatus.failed);
      await flush();
      repository.requests[1].result.complete(_cart('large'));
      expect((await second).status, CartMutationStatus.succeeded);
      final retry = controller.add(productId: 'one', variantId: 'small');
      await flush();
      expect(repository.requests.last.operation, 'add:one:small:1');
      repository.requests.last.result.complete(_cart('both'));
      expect((await retry).status, CartMutationStatus.succeeded);
    },
  );

  test('profile edits preserve the current cart and do not reload', () async {
    session.setSession(
      const Session.signedIn(User(id: 'A', name: 'Updated', role: 'customer')),
    );
    await flush();
    expect(repository.reads, ['A']);
    expect(container.read(cartControllerProvider).requireValue.id, 'A-loaded');
  });
}

import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/wishlist/data/wishlist_item.dart';
import 'package:shubayr/features/wishlist/presentation/providers/wishlist_providers.dart';

import 'support/wishlist_fakes.dart';

void main() {
  late RecordingWishlist repository;
  late ProviderContainer container;
  late TestSession session;

  setUp(() async {
    repository = RecordingWishlist();
    session = TestSession();
    container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [
        notificationSyncProvider.overrideWith((ref) {}),
        unreadCountProvider.overrideWith((ref) async => 0),
        dataSourceProvider.overrideWithValue(DataSource.mock),
        sessionControllerProvider.overrideWith(() => session),
        wishlistRepositoryProvider.overrideWithValue(repository),
      ],
    );
    await container.read(sessionControllerProvider.future);
  });
  tearDown(() => container.dispose());

  test(
    'duplicate toggle coalesces but add/remove/add intentions remain ordered',
    () async {
      await container.read(wishlistControllerProvider.future);
      final controller = container.read(wishlistControllerProvider.notifier);
      final gate = Completer<WishlistItem>();
      repository.onAdd = (_) => gate.future;
      final first = controller.toggle('p1');
      final duplicate = controller.toggle('p1');
      await Future<void>.delayed(Duration.zero);
      expect(repository.added, ['p1']);
      gate.complete(const WishlistItem(id: 'new', productId: 'p1'));
      await Future.wait([first, duplicate]);
      expect(repository.removed, isEmpty);
      repository.onAdd = null;
      await Future.wait([
        controller.add('p1'),
        controller.remove('p1'),
        controller.add('p1'),
      ]);
      expect(repository.added, ['p1', 'p1', 'p1']);
      expect(repository.removed, ['p1']);
      expect(container.read(isWishlistedProvider('p1')), isTrue);
    },
  );

  test('refresh retains data, reports failure and can recover', () async {
    final previous = await container.read(wishlistControllerProvider.future);
    final pending = Completer<WishlistPage>();
    repository.onFetch = (_) => pending.future;
    final notifier = container.read(wishlistControllerProvider.notifier);
    final refresh = notifier.refresh();
    await Future<void>.delayed(Duration.zero);
    expect(notifier.isRefreshing, isTrue);
    expect(container.read(wishlistControllerProvider).isLoading, isTrue);
    expect(container.read(wishlistControllerProvider).value, same(previous));
    pending.completeError(const AppFailure.network());
    await refresh;
    final failed = container.read(wishlistControllerProvider);
    expect(notifier.isRefreshing, isFalse);
    expect(failed.isLoading, isFalse);
    expect(failed.error, isA<AppFailure>());
    expect(failed.value, same(previous));
    repository.onFetch = (_) async => const WishlistPage(
      page: 1,
      perPage: 100,
      total: 1,
      data: [WishlistItem(id: 'new', productId: 'new')],
    );
    await notifier.refresh();
    expect(container.read(wishlistControllerProvider).hasError, isFalse);
    expect(notifier.isRefreshing, isFalse);
  });

  test('session reload cancels an old refresh and queued work', () async {
    await container.read(wishlistControllerProvider.future);
    final oldPage = Completer<WishlistPage>();
    repository.onFetch = (_) => oldPage.future;
    final notifier = container.read(wishlistControllerProvider.notifier);
    final oldRefresh = notifier.refresh();
    final queuedRefresh = notifier.refresh();
    await Future<void>.delayed(Duration.zero);
    expect(notifier.isRefreshing, isTrue);
    final newPage = Completer<WishlistPage>();
    repository.onFetch = (_) => newPage.future;
    session.setSession(
      const Session.signedIn(User(id: 'next', role: 'customer')),
    );
    final next = container.read(wishlistControllerProvider.future);
    expect(notifier.isRefreshing, isFalse);
    expect(container.read(wishlistControllerProvider).isLoading, isTrue);
    final requests = repository.requests.length;
    oldPage.completeError(const AppFailure.network());
    await oldRefresh;
    await queuedRefresh;
    expect(repository.requests, hasLength(requests));
    expect(container.read(wishlistControllerProvider).hasError, isFalse);
    newPage.complete(
      const WishlistPage(
        page: 1,
        perPage: 100,
        total: 1,
        data: [WishlistItem(id: 'new', productId: 'new')],
      ),
    );
    await next;
    expect(container.read(wishlistControllerProvider).hasError, isFalse);
    expect(notifier.isRefreshing, isFalse);
  });

  test('loads all pages and marks later-page products as saved', () async {
    final items = await container.read(wishlistControllerProvider.future);
    expect(repository.requests, [(page: 1, perPage: 100)]);
    expect(items, hasLength(10));
    expect(items.first.productId, 'p2');
    expect(items.last.productId, 'p11');
    expect(container.read(isWishlistedProvider('p11')), isTrue);
    expect(container.read(isWishlistedProvider('p1')), isFalse);
  });

  test(
    'later-page failure never publishes an incomplete list and retry starts over',
    () async {
      repository.onFetch = (request) async {
        if (request.page == 2) throw const AppFailure.network();
        return WishlistPage(
          page: 1,
          perPage: 100,
          total: 101,
          data: [
            for (var i = 0; i < 100; i++)
              WishlistItem(id: 'w$i', productId: 'p$i'),
          ],
        );
      };
      await expectLater(
        container.read(wishlistControllerProvider.future),
        throwsA(isA<AppFailure>()),
      );
      expect(container.read(wishlistControllerProvider).hasValue, isFalse);
      repository.onFetch = null;
      await container.read(wishlistControllerProvider.notifier).refresh();
      expect(
        container.read(wishlistControllerProvider).requireValue,
        hasLength(10),
      );
      expect(repository.requests.map((r) => r.page), [1, 2, 1]);
    },
  );

  test('toggling during loading waits for membership on later pages', () async {
    final page = Completer<WishlistPage>();
    repository.onFetch = (r) async => r.page == 1
        ? WishlistPage(
            page: 1,
            perPage: 100,
            total: 101,
            data: [
              for (var i = 0; i < 100; i++)
                WishlistItem(id: 'w$i', productId: 'p$i'),
            ],
          )
        : page.future;
    container.read(wishlistControllerProvider);
    final toggle = container
        .read(wishlistControllerProvider.notifier)
        .toggle('later');
    await Future<void>.delayed(Duration.zero);
    expect(repository.added, isEmpty);
    expect(repository.removed, isEmpty);
    page.complete(
      const WishlistPage(
        page: 2,
        perPage: 100,
        total: 101,
        data: [WishlistItem(id: 'later', productId: 'later')],
      ),
    );
    await toggle;
    expect(repository.removed, ['later']);
    expect(repository.added, isEmpty);
    expect(
      container.read(wishlistControllerProvider).requireValue,
      hasLength(100),
    );
  });

  test('add and remove preserve all previously loaded pages', () async {
    await container.read(wishlistControllerProvider.future);
    final controller = container.read(wishlistControllerProvider.notifier);
    await controller.add('p1');
    var items = container.read(wishlistControllerProvider).requireValue;
    expect(items, hasLength(11));
    expect(items.first.productId, 'p1');
    expect(container.read(isWishlistedProvider('p11')), isTrue);
    await controller.add('p2');
    expect(
      container.read(wishlistControllerProvider).requireValue.first.productId,
      'p1',
    );
    await controller.remove('p11');
    expect(container.read(isWishlistedProvider('p11')), isFalse);
    await controller.refresh();
    expect(
      container
          .read(wishlistControllerProvider)
          .requireValue
          .map((w) => w.productId),
      ['p1', 'p2', 'p5', 'p3', 'p4', 'p6', 'p7', 'p8', 'p9', 'p10'],
    );
  });

  test(
    'mutation failure preserves saved items and does not block the next operation',
    () async {
      final before = await container.read(wishlistControllerProvider.future);
      repository.onRemove = (_) async => throw const AppFailure.network();
      final controller = container.read(wishlistControllerProvider.notifier);
      await expectLater(controller.remove('p11'), throwsA(isA<AppFailure>()));
      expect(container.read(wishlistControllerProvider).requireValue, before);
      repository.onRemove = null;
      await controller.remove('p11');
      expect(container.read(isWishlistedProvider('p11')), isFalse);
    },
  );

  test(
    'refresh waits for the final page and queued mutations run afterward',
    () async {
      await container.read(wishlistControllerProvider.future);
      final lastPage = Completer<WishlistPage>();
      repository.onFetch = (r) async => r.page == 1
          ? WishlistPage(
              page: 1,
              perPage: 100,
              total: 101,
              data: [
                for (var i = 0; i < 100; i++)
                  WishlistItem(id: 'w$i', productId: 'p$i'),
              ],
            )
          : lastPage.future;
      final controller = container.read(wishlistControllerProvider.notifier);
      var refreshed = false;
      final refresh = controller.refresh().then((_) => refreshed = true);
      final add = controller.add('new');
      await Future<void>.delayed(Duration.zero);
      expect(refreshed, isFalse);
      expect(repository.added, isEmpty);
      lastPage.complete(
        const WishlistPage(
          page: 2,
          perPage: 100,
          total: 101,
          data: [WishlistItem(id: 'last', productId: 'last')],
        ),
      );
      await refresh;
      await add;
      expect(
        container.read(wishlistControllerProvider).requireValue,
        hasLength(102),
      );
      expect(container.read(isWishlistedProvider('new')), isTrue);
      expect(container.read(isWishlistedProvider('last')), isTrue);
    },
  );

  test('overlapping pages deduplicate products', () async {
    repository.onFetch = (r) async => WishlistPage(
      page: r.page,
      perPage: 100,
      total: 101,
      data: r.page == 1
          ? [
              for (var i = 0; i < 100; i++)
                WishlistItem(id: 'w$i', productId: 'p$i'),
            ]
          : [
              const WishlistItem(id: 'duplicate', productId: 'p7'),
              const WishlistItem(id: 'w8', productId: 'p100'),
            ],
    );
    final items = await container.read(wishlistControllerProvider.future);
    expect(items, hasLength(101));
    expect(items.map((w) => w.productId).toSet(), hasLength(101));
  });

  test(
    'inconsistent page metadata fails instead of looping or marking unseen products unsaved',
    () async {
      repository.onFetch = (r) async => WishlistPage(
        page: r.page,
        perPage: 100,
        total: 101,
        data: r.page == 1
            ? [
                for (var i = 0; i < 100; i++)
                  WishlistItem(id: 'w$i', productId: 'p$i'),
              ]
            : [],
      );
      await expectLater(
        container.read(wishlistControllerProvider.future),
        throwsA(isA<AppFailure>()),
      );
      expect(repository.requests, hasLength(2));
    },
  );

  test(
    'sign out stops later requests and prevents a queued mutation',
    () async {
      final firstPage = Completer<WishlistPage>();
      repository.onFetch = (_) => firstPage.future;
      container.read(wishlistControllerProvider);
      final add = container
          .read(wishlistControllerProvider.notifier)
          .add('new');
      session.setSession(const Session.signedOut());
      expect(await container.read(wishlistControllerProvider.future), isEmpty);
      firstPage.complete(
        const WishlistPage(
          page: 1,
          perPage: 100,
          total: 101,
          data: [WishlistItem(id: 'old', productId: 'old')],
        ),
      );
      await add;
      expect(repository.added, isEmpty);
      expect(repository.requests, hasLength(1));
      expect(container.read(wishlistControllerProvider).requireValue, isEmpty);
    },
  );

  test('late mutation result cannot overwrite a different customer', () async {
    await container.read(wishlistControllerProvider.future);
    final response = Completer<WishlistItem>();
    repository.onAdd = (_) => response.future;
    final add = container
        .read(wishlistControllerProvider.notifier)
        .add('old-add');
    await Future<void>.delayed(Duration.zero);
    repository.onFetch = (r) async => WishlistPage(
      page: r.page,
      perPage: r.perPage,
      total: 1,
      data: const [WishlistItem(id: 'other', productId: 'other')],
    );
    session.setSession(
      const Session.signedIn(User(id: 'other', role: 'customer')),
    );
    await container.read(wishlistControllerProvider.future);
    response.complete(const WishlistItem(id: 'old-add', productId: 'old-add'));
    await add;
    expect(
      container.read(wishlistControllerProvider).requireValue.single.productId,
      'other',
    );
  });

  test('guest never reads or mutates the wishlist', () async {
    session.setSession(const Session.signedOut());
    expect(await container.read(wishlistControllerProvider.future), isEmpty);
    final controller = container.read(wishlistControllerProvider.notifier);
    await controller.add('p1');
    await controller.remove('p2');
    await controller.refresh();
    expect(repository.requests, isEmpty);
    expect(repository.added, isEmpty);
    expect(repository.removed, isEmpty);
  });

  test('a new customer can mutate before an old request finishes', () async {
    await container.read(wishlistControllerProvider.future);
    final oldResponse = Completer<WishlistItem>();
    repository.onAdd = (id) async =>
        id == 'old' ? oldResponse.future : WishlistItem(id: id, productId: id);
    final oldAdd = container
        .read(wishlistControllerProvider.notifier)
        .add('old');
    await Future<void>.delayed(Duration.zero);
    session.setSession(
      const Session.signedIn(User(id: 'new-customer', role: 'customer')),
    );
    await container.read(wishlistControllerProvider.future);
    await container.read(wishlistControllerProvider.notifier).add('new');
    expect(container.read(isWishlistedProvider('new')), isTrue);
    oldResponse.completeError(const AppFailure.network());
    await oldAdd;
    expect(container.read(isWishlistedProvider('old')), isFalse);
  });

  test(
    'refresh after deleting the final item returns a complete empty list',
    () async {
      await container.read(wishlistControllerProvider.future);
      final controller = container.read(wishlistControllerProvider.notifier);
      for (final item in [
        ...container.read(wishlistControllerProvider).requireValue,
      ]) {
        await controller.remove(item.productId);
      }
      await controller.refresh();
      expect(container.read(wishlistControllerProvider).requireValue, isEmpty);
      expect(repository.requests.last.page, 1);
    },
  );
}

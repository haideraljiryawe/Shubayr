import 'dart:async';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/wishlist/data/wishlist_item.dart';
import 'package:shubayr/features/wishlist/presentation/providers/wishlist_providers.dart';
import '../address/support/address_fakes.dart';
import '../wishlist/support/wishlist_fakes.dart';

void main() {
  test('105 addresses take two requests and retain the last default', () async {
    final repo = RecordingAddresses()
      ..onFetch = (r) async => addressPage(r, total: 105, defaultIndex: 104);
    final c = ProviderContainer(
      overrides: [
        sessionControllerProvider.overrideWith(AddressTestSession.new),
        addressRepositoryProvider.overrideWithValue(repo),
      ],
    );
    addTearDown(c.dispose);
    await c.read(sessionControllerProvider.future);
    final addresses = await c.read(addressesControllerProvider.future);
    expect(addresses.singleWhere((a) => a.isDefault).id, 'addr-104');
    expect(repo.requests, [(page: 1, perPage: 100), (page: 2, perPage: 100)]);
  });
  test(
    '105 wishlist entries take two requests without losing membership after page one',
    () async {
      final repo = RecordingWishlist(
        entries: [
          for (var i = 0; i < 105; i++)
            WishlistItem(id: 'w$i', productId: 'p$i'),
        ],
      );
      final c = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(TestSession.new),
          wishlistRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(c.dispose);
      await c.read(sessionControllerProvider.future);
      expect(await c.read(wishlistControllerProvider.future), hasLength(105));
      expect(c.read(isWishlistedProvider('p104')), isTrue);
      expect(repo.requests, [(page: 1, perPage: 100), (page: 2, perPage: 100)]);
    },
  );
  test(
    'retained wishlist survives navigation but A logout B ignores old pages',
    () async {
      final session = TestSession();
      final repo = RecordingWishlist(
        entries: [const WishlistItem(id: 'A', productId: 'A')],
      );
      final c = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          wishlistRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(c.dispose);
      await c.read(sessionControllerProvider.future);
      final sub = c.listen(wishlistControllerProvider, (_, _) {});
      await c.read(wishlistControllerProvider.future);
      sub.close();
      await c.pump();
      expect(c.exists(wishlistControllerProvider), isTrue);
      expect(repo.requests, hasLength(1));
      final pending = Completer<WishlistPage>();
      repo.onFetch = (_) => pending.future;
      final refresh = c.read(wishlistControllerProvider.notifier).refresh();
      await c.pump();
      session.setSession(const Session.signedOut());
      expect(await c.read(wishlistControllerProvider.future), isEmpty);
      repo.onFetch = (r) async => WishlistPage(
        page: r.page,
        perPage: r.perPage,
        total: 1,
        data: const [WishlistItem(id: 'B', productId: 'B')],
      );
      session.setSession(
        const Session.signedIn(User(id: 'B', role: 'customer')),
      );
      await c.read(wishlistControllerProvider.future);
      pending.complete(
        const WishlistPage(
          page: 1,
          perPage: 100,
          total: 101,
          data: [WishlistItem(id: 'A', productId: 'A')],
        ),
      );
      final before = repo.requests.length;
      await refresh;
      await c.pump();
      expect(repo.requests, hasLength(before));
      expect(c.read(isWishlistedProvider('A')), isFalse);
      expect(c.read(isWishlistedProvider('B')), isTrue);
    },
  );
  test(
    'retained addresses survive navigation but A logout B ignores old pages',
    () async {
      final session = AddressTestSession();
      final repo = RecordingAddresses();
      final c = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          addressRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(c.dispose);
      await c.read(sessionControllerProvider.future);
      final sub = c.listen(addressesControllerProvider, (_, _) {});
      await c.read(addressesControllerProvider.future);
      sub.close();
      await c.pump();
      expect(c.exists(addressesControllerProvider), isTrue);
      expect(repo.requests, hasLength(1));
      final pending = Completer<AddressPage>();
      repo.onFetch = (_) => pending.future;
      final refresh = c.read(addressesControllerProvider.notifier).refresh();
      await c.pump();
      session.setSession(const Session.signedOut());
      expect(await c.read(addressesControllerProvider.future), isEmpty);
      repo.onFetch = (r) async => AddressPage(
        page: r.page,
        perPage: r.perPage,
        total: 1,
        data: const [Address(id: 'B', city: 'Basra')],
      );
      session.setSession(
        const Session.signedIn(User(id: 'B', role: 'customer')),
      );
      await c.read(addressesControllerProvider.future);
      pending.complete(addressPage((page: 1, perPage: 100), total: 105));
      final before = repo.requests.length;
      await refresh;
      await c.pump();
      expect(repo.requests, hasLength(before));
      expect(c.read(addressesControllerProvider).requireValue.single.id, 'B');
    },
  );
}

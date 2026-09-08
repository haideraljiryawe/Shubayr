import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/wishlist/data/wishlist_repository_remote.dart';
import 'package:shubayr/features/wishlist/data/wishlist_repository_mock.dart';

void main() {
  test('seeds, adds (idempotently), removes and lists newest first', () async {
    final repo = WishlistRepositoryMock(delay: Duration.zero);

    final seeded = (await repo.fetchWishlist()).data;
    expect(seeded.map((e) => e.productId), containsAll(['p2', 'p5']));

    await repo.add('p1');
    var items = (await repo.fetchWishlist()).data;
    expect(items.map((e) => e.productId), contains('p1'));
    expect(items.first.productId, 'p1'); // newest first
    final count = items.length;

    // Adding the same product again is a no-op.
    await repo.add('p1');
    expect((await repo.fetchWishlist()).data.length, count);

    await repo.remove('p2');
    items = (await repo.fetchWishlist()).data;
    expect(items.map((e) => e.productId), isNot(contains('p2')));
  });

  test('mock slices pages with stable ordering and correct metadata', () async {
    final repo = WishlistRepositoryMock(delay: Duration.zero);
    final first = await repo.fetchWishlist(perPage: 8);
    final second = await repo.fetchWishlist(page: 2, perPage: 8);
    final beyond = await repo.fetchWishlist(page: 3, perPage: 8);
    expect(first.data, hasLength(8));
    expect(second.data, hasLength(2));
    expect(second.page, 2);
    expect(second.perPage, 8);
    expect(first.total, 10);
    expect(second.total, 10);
    expect(beyond.data, isEmpty);
    final all = [...first.data, ...second.data];
    expect(all.map((item) => item.productId).toSet(), hasLength(10));
    for (var i = 1; i < all.length; i++) {
      expect(all[i - 1].addedAt!.isAfter(all[i].addedAt!), isTrue);
    }
  });

  test(
    'remote forwards paging parameters and parses the returned page',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              requests.add(options);
              handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {
                    'page': 3,
                    'per_page': 8,
                    'total': 17,
                    'data': [
                      {'id': 'w17', 'product_id': 'p17'},
                    ],
                  },
                ),
              );
            },
          ),
        );
      final repo = WishlistRepositoryRemote(ApiClient(dio));
      final page = await repo.fetchWishlist(page: 3, perPage: 8);
      expect(requests.single.path, '/wishlist');
      expect(requests.single.queryParameters, {'page': '3', 'per_page': '8'});
      expect(page.page, 3);
      expect(page.perPage, 8);
      expect(page.total, 17);
      expect(page.data.single.productId, 'p17');
      dio.close();
    },
  );
}

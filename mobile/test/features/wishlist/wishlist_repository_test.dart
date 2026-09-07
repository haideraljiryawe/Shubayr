import 'package:flutter_test/flutter_test.dart';
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
}

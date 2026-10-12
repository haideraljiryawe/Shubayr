import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';

class FreshCatalog extends CatalogRepositoryMock {
  FreshCatalog() : super(delay: Duration.zero);
  int products = 0, availability = 0;
  @override
  Future<Product> fetchProduct(String id) async => Product(
    id: id,
    categoryId: 'c',
    nameEn: 'Product',
    nameAr: 'منتج',
    effectivePrice: ++products,
  );
  @override
  Future<ProductAvailability> fetchAvailability(String id) async =>
      ProductAvailability(
        productId: id,
        inStock: true,
        availableQty: ++availability,
      );
}

void main() {
  test(
    'catalog families release visited IDs and revisit fetches fresh price/stock',
    () async {
      final repo = FreshCatalog();
      final c = ProviderContainer(
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      addTearDown(c.dispose);
      final product = productProvider('p1');
      final stock = availabilityProvider('p1');
      final reviews = productReviewsProvider('p1');
      final feed = categoryFeedProvider('cat-audio');
      final subscriptions = [
        c.listen(product, (_, _) {}),
        c.listen(stock, (_, _) {}),
        c.listen(reviews, (_, _) {}),
        c.listen(feed, (_, _) {}),
      ];
      await Future.wait([
        c.read(product.future),
        c.read(stock.future),
        c.read(reviews.future),
        c.read(feed.future),
      ]);
      // Concurrent consumers (e.g. two cart SKUs) already coalesce by product ID.
      final second = c.listen(product, (_, _) {});
      expect(repo.products, 1);
      for (final sub in subscriptions) {
        sub.close();
      }
      await c.pump();
      expect(c.exists(product), isTrue);
      second.close();
      await c.pump();
      expect(c.exists(product), isFalse);
      expect(c.exists(stock), isFalse);
      expect(c.exists(reviews), isFalse);
      expect(c.exists(feed), isFalse);
      final nextProduct = c.listen(product, (_, _) {});
      final nextStock = c.listen(stock, (_, _) {});
      expect((await c.read(product.future)).salePrice, 2);
      expect((await c.read(stock.future)).availableQty, 2);
      nextProduct.close();
      nextStock.close();
    },
  );

  test(
    'category tree intentionally survives navigation until explicit refresh',
    () async {
      final c = ProviderContainer(
        overrides: [
          catalogRepositoryProvider.overrideWithValue(FreshCatalog()),
        ],
      );
      addTearDown(c.dispose);
      final sub = c.listen(categoriesProvider, (_, _) {});
      final first = await c.read(categoriesProvider.future);
      sub.close();
      await c.pump();
      expect(c.exists(categoriesProvider), isTrue);
      expect(await c.read(categoriesProvider.future), same(first));
      c.invalidate(categoriesProvider);
      expect(await c.read(categoriesProvider.future), isNot(same(first)));
    },
  );
}

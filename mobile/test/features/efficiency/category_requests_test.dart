import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';

class CategoryCatalog extends CatalogRepositoryMock {
  final categories = Completer<List<Category>>();
  final reads = <({String? category, int size, bool sale})>[];
  @override
  Future<List<Category>> fetchCategories() => categories.future;
  @override
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    bool onSale = false,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) async {
    reads.add((category: categoryId, size: perPage, sale: onSale));
    return ProductPage(total: categoryId == 'offers' ? 2 : 0);
  }
}

const categories = [
  Category(id: 'offers', nameEn: 'Offers', nameAr: 'عروض'),
  Category(id: 'empty', nameEn: 'Empty', nameAr: 'فارغ'),
];
void main() {
  test(
    'concurrent offer category consumers share one existence read per category',
    () async {
      final repo = CategoryCatalog();
      final c = ProviderContainer(
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      addTearDown(c.dispose);
      c.listen(offerCategoriesProvider, (_, _) {});
      c.listen(offerCategoriesProvider, (_, _) {});
      repo.categories.complete(categories);
      expect((await c.read(offerCategoriesProvider.future)).map((c) => c.id), [
        'offers',
      ]);
      expect(repo.reads, [
        (category: 'empty', size: 1, sale: true),
        (category: 'offers', size: 1, sale: true),
      ]);
    },
  );
  test(
    'leaving before category tree arrives does not start obsolete existence reads',
    () async {
      final repo = CategoryCatalog();
      final c = ProviderContainer(
        overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
      );
      addTearDown(c.dispose);
      final sub = c.listen(offerCategoriesProvider, (_, _) {});
      sub.close();
      await c.pump();
      repo.categories.complete(categories);
      await c.pump();
      expect(repo.reads, isEmpty);
    },
  );
}

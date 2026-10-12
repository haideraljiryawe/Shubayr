import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/providers/product_list_controller.dart';

void main() {
  test(
    'visible category filtering preserves API metadata and nested ordering',
    () async {
      final category = Category.fromJson({
        'id': 'root',
        'name_en': 'Root',
        'name_ar': 'قسم',
        'slug': 'root-slug',
        'image_url': 'https://example.com/root.jpg',
        'icon_key': 'consumer_electronics',
        'description_en': 'Description',
        'description_ar': 'وصف',
        'sort_order': 7,
        'children': [
          {
            'id': 'hidden',
            'name_en': 'Hidden',
            'name_ar': '',
            'is_visible': false,
          },
          {
            'id': 'b',
            'name_en': 'B',
            'name_ar': '',
            'sort_order': 2,
            'slug': 'b-slug',
          },
          {'id': 'a', 'name_en': 'A', 'name_ar': '', 'sort_order': 1},
        ],
      });
      final c = ProviderContainer(
        overrides: [
          catalogRepositoryProvider.overrideWithValue(
            _CategorySnapshot(category),
          ),
        ],
      );
      addTearDown(c.dispose);
      final visible = (await c.read(categoriesProvider.future)).single;
      expect(visible.toJson(), {
        ...category.toJson(),
        'children': [
          category.children[2].toJson(),
          category.children[1].toJson(),
        ],
      });
    },
  );

  test(
    'mock scopes search, price, sale, sorting and pagination to the subtree',
    () async {
      final repo = CatalogRepositoryMock(delay: Duration.zero);
      final parent = await repo.fetchProducts(categoryId: 'cat-electronics');
      expect(parent.data.map((p) => p.id), ['p1', 'p2', 'p3', 'p12']);
      final leaf = await repo.fetchProducts(
        categoryId: 'cat-audio',
        query: 'speaker',
      );
      expect(leaf.data.map((p) => p.id), ['p12']);
      for (final id in ['cat-electronics', 'cat-audio']) {
        expect(
          (await repo.fetchProducts(categoryId: id, query: 'Coffee')).data,
          isEmpty,
        );
      }
      final result = await repo.fetchProducts(
        categoryId: 'cat-electronics',
        minPrice: 30000,
        maxPrice: 60000,
        sort: ProductSort.priceDesc,
        perPage: 2,
      );
      expect(result.total, 3);
      expect(result.data.map((p) => p.id), ['p12', 'p1']);
      expect(
        (await repo.fetchProducts(
          categoryId: 'cat-electronics',
          minPrice: 30000,
          maxPrice: 60000,
          sort: ProductSort.priceDesc,
          perPage: 2,
          page: 2,
        )).data.map((p) => p.id),
        ['p3'],
      );
      expect(
        (await repo.fetchProducts(
          categoryId: 'cat-audio',
          onSale: true,
          sort: ProductSort.rating,
        )).data.map((p) => p.id),
        ['p1'],
      );
    },
  );

  test(
    'controller keeps search and filters when moving between parent and child',
    () async {
      const initial = ProductQuery(categoryId: 'cat-electronics');
      final provider = productListControllerProvider(initial);
      final container = ProviderContainer(
        overrides: [
          notificationSyncProvider.overrideWith((ref) {}),
          unreadCountProvider.overrideWith((ref) async => 0),
          dataSourceProvider.overrideWithValue(DataSource.mock),
          catalogRepositoryProvider.overrideWithValue(
            CatalogRepositoryMock(delay: Duration.zero),
          ),
        ],
      );
      addTearDown(container.dispose);
      final subscription = container.listen(provider, (_, _) {});
      addTearDown(subscription.close);
      final controller = container.read(provider.notifier);
      Future<ProductListState> settled() async {
        while (container.read(provider).loadingInitial) {
          await Future<void>.delayed(const Duration(milliseconds: 1));
        }
        return container.read(provider);
      }

      await settled();
      controller.updateQuery(
        initial.copyWith(
          text: 's',
          minPrice: 40000,
          maxPrice: 130000,
          onSale: true,
          sort: ProductSort.priceDesc,
        ),
      );
      var state = await settled();
      expect(state.items.map((p) => p.id), ['p2', 'p1']);
      final parentQuery = state.query;
      controller.updateQuery(parentQuery.copyWith(categoryId: 'cat-audio'));
      state = await settled();
      expect(state.items.map((p) => p.id), ['p1']);
      expect(state.query.copyWith(categoryId: 'cat-electronics'), parentQuery);
      controller.updateQuery(state.query.copyWith(categoryId: 'cat-phones'));
      state = await settled();
      expect(state.isEmpty, isTrue);
      expect(state.error, isNull);
      controller.updateQuery(
        state.query.copyWith(categoryId: 'cat-electronics'),
      );
      state = await settled();
      expect(state.query, parentQuery);
      expect(state.items.map((p) => p.id), ['p2', 'p1']);
    },
  );

  test(
    'subtree includes direct parent products and recursively nested descendants',
    () async {
      // Isolated test records exercise shapes absent from the bundled mock feed.
      // Use the fixture replacement seam and restore the original catalog afterward.
      final repo = CatalogRepositoryMock(delay: Duration.zero);
      final originalProducts = await repo.fetchProducts(perPage: 1000);
      final originalCategories = await repo.fetchCategories();
      final flat = <Map<String, dynamic>>[];
      void flatten(Category category) {
        flat.add(category.toJson());
        for (final child in category.children) {
          flatten(child);
        }
      }

      for (final category in originalCategories) {
        flatten(category);
      }
      addTearDown(
        () => repo.replaceFixtures(
          products: originalProducts.data.map((p) => p.toJson()).toList(),
          categories: flat,
        ),
      );
      repo.replaceFixtures(
        categories: [
          for (final (id, parentId) in [
            ('parent', null),
            ('child', 'parent'),
            ('grandchild', 'child'),
            ('outside', null),
          ])
            {'id': id, 'parent_id': parentId, 'name_en': id, 'name_ar': id},
        ],
        products: [
          for (final id in ['parent', 'child', 'grandchild', 'outside'])
            {
              'id': 'p-$id',
              'category_id': id,
              'name_en': 'Shared $id',
              'name_ar': id,
              'sale_price': 100,
            },
        ],
      );
      final result = await repo.fetchProducts(
        categoryId: 'parent',
        query: 'Shared',
        minPrice: 50,
        maxPrice: 150,
        sort: ProductSort.priceAsc,
      );
      expect(result.data.map((p) => p.id).toSet(), {
        'p-parent',
        'p-child',
        'p-grandchild',
      });
      expect(
        (await repo.fetchProducts(
          categoryId: 'child',
          query: 'Shared',
        )).data.map((p) => p.id).toSet(),
        {'p-child', 'p-grandchild'},
      );
    },
  );
}

class _CategorySnapshot extends CatalogRepositoryMock {
  _CategorySnapshot(this.category);
  final Category category;
  @override
  Future<List<Category>> fetchCategories() async => [category];
}

import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_providers.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'support/admin_fakes.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/admin/data/admin_repository_mock.dart';
import 'package:shubayr/features/admin/data/admin_repository_remote.dart';
import 'package:shubayr/features/admin/domain/admin_category_tree.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/media/catalog_image.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'category_media_repository_test.dart' show category;

void main() {
  test(
    'product scope and search stay attached to pagination and refresh',
    () async {
      final repo = RecordingAdmin()
        ..onFetch = (q) async => AdminPage(
          items: [
            AdminRecord({'id': 'product-${q.page}'}),
          ],
          page: q.page,
          perPage: 1,
          total: 2,
        );
      final container = ProviderContainer(
        overrides: [
          adminRepositoryProvider.overrideWithValue(repo),
          sessionControllerProvider.overrideWith(AdminTestSession.new),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      const query = AdminQuery(
        AdminResource.products,
        categoryId: 'child',
        text: 'Needle',
      );
      container.listen(adminListProvider(query), (_, _) {});
      await container.read(adminListProvider(query).future);
      final controller = container.read(adminListProvider(query).notifier);
      await controller.loadMore();
      expect(
        container
            .read(adminListProvider(query))
            .requireValue
            .items
            .map((r) => r.id),
        ['product-1', 'product-2'],
      );
      await controller.refresh();
      expect(repo.requests.map((r) => r.page), [1, 2, 1]);
      expect(
        repo.requests.every(
          (r) => r.categoryId == 'child' && r.query == 'Needle',
        ),
        isTrue,
      );
    },
  );

  test(
    'category controller loads the complete tree, including later-page children, on refresh',
    () async {
      final repo = RecordingAdmin()
        ..onFetch = (q) async => AdminPage(
          items: [
            AdminRecord(
              q.page == 1
                  ? {'id': 'parent'}
                  : {'id': 'child', 'parent_id': 'parent'},
            ),
          ],
          page: q.page,
          perPage: 1,
          total: 2,
        );
      final container = ProviderContainer(
        overrides: [
          adminRepositoryProvider.overrideWithValue(repo),
          sessionControllerProvider.overrideWith(AdminTestSession.new),
        ],
      );
      addTearDown(container.dispose);
      await container.read(sessionControllerProvider.future);
      const query = AdminQuery(AdminResource.categories);
      container.listen(adminListProvider(query), (_, _) {});
      final result = await container.read(adminListProvider(query).future);
      expect(result.page.hasMore, isFalse);
      expect(
        AdminCategoryTree(result.items).children('parent').single.id,
        'child',
      );
      await container.read(adminListProvider(query).notifier).refresh();
      expect(repo.requests.map((r) => r.page), [1, 2, 1, 2]);
    },
  );

  test(
    'first display image is the only primary; URLs remain contract data',
    () {
      const old = 'https://example.com/old.png';
      const next = UrlCatalogImage('https://example.com/next.png');
      final local = LocalCatalogImage(
        Uint8List.fromList([1]),
        name: 'picked.png',
      );
      const product = Product(
        id: 'p',
        categoryId: 'c',
        nameEn: 'Product',
        nameAr: 'منتج',
        salePrice: 1,
        images: [old],
      );
      expect((product.primaryDisplayImage as UrlCatalogImage).url, old);
      final selected = product.copyWith(mockImages: [local, next]);
      expect(selected.primaryDisplayImage, same(local));
      expect(selected.displayImages, [local, next]);
      expect(
        (selected.toJson()['images'] as List).map((image) => image['url']),
        [old],
      );
      expect(selected.toJson().containsKey('mock_images'), isFalse);
      final promoted = selected.copyWith(mockImages: [next]);
      expect(promoted.primaryDisplayImage, same(next));
      expect(promoted.primaryImage, next.url);
      expect(selected.copyWith(mockImages: []).primaryDisplayImage, isNull);
      expect(
        const Product(
          id: 'empty',
          categoryId: 'c',
          nameEn: '',
          nameAr: '',
          salePrice: 1,
        ).primaryDisplayImage,
        isNull,
      );
    },
  );

  test(
    'saved ordered selection keeps the primary and every remaining gallery image',
    () async {
      final catalog = CatalogRepositoryMock(delay: Duration.zero);
      final repo = AdminRepositoryMock(catalog: catalog, delay: Duration.zero);
      const first = UrlCatalogImage('https://example.com/one.png');
      const second = UrlCatalogImage('https://example.com/two.png');
      final local = LocalCatalogImage(
        Uint8List.fromList([1]),
        name: 'picked.png',
      );
      final initial = (await repo.fetch(AdminResource.products)).items.first;
      await repo.save(AdminResource.products, {
        ...initial.json,
        'mock_images': [second, first, local],
      }, id: initial.id);
      final saved = await catalog.fetchProduct(initial.id);
      expect(saved.primaryDisplayImage, same(second));
      expect(saved.displayImages, [second, first, local]);
      final reopened = (await repo.fetch(
        AdminResource.products,
      )).items.firstWhere((p) => p.id == initial.id);
      expect(reopened.json['mock_images'], [second, first, local]);
      await repo.save(AdminResource.products, {
        ...reopened.json,
        'mock_images': [first, local],
      }, id: initial.id);
      expect(
        (await catalog.fetchProduct(initial.id)).primaryDisplayImage,
        same(first),
      );
    },
  );

  test(
    'scope includes descendants, combines search and excludes archived before pagination',
    () async {
      final repo = AdminRepositoryMock(delay: Duration.zero);
      final root = await repo.save(AdminResource.categories, category('Root'));
      final child = await repo.save(AdminResource.categories, {
        ...category('Child', parent: root.id),
        'is_active': false,
      });
      final leaf = await repo.save(
        AdminResource.categories,
        category('Leaf', parent: child.id),
      );
      final other = await repo.save(
        AdminResource.categories,
        category('Other'),
      );
      final records = <AdminRecord>[];
      for (var i = 0; i < 25; i++) {
        records.add(
          await repo.save(AdminResource.products, {
            'category_id': i == 0
                ? root.id
                : i.isEven
                ? child.id
                : leaf.id,
            'name_en': 'Scoped $i',
            'name_ar': 'مادة $i',
            'sale_price': 1,
            'status': i == 1 ? 'hidden' : 'active',
          }),
        );
      }
      final outside = await repo.save(AdminResource.products, {
        'category_id': other.id,
        'name_en': 'Scoped outside',
        'name_ar': 'مادة خارجية',
        'sale_price': 1,
      });
      await repo.delete(AdminResource.products, records[2].id);
      final first = await repo.fetch(
        AdminResource.products,
        categoryId: root.id,
        query: 'Scoped',
        perPage: 20,
      );
      final last = await repo.fetch(
        AdminResource.products,
        categoryId: root.id,
        query: 'Scoped',
        page: 2,
        perPage: 20,
      );
      expect(first.total, 24);
      expect(first.items, hasLength(20));
      expect(last.items, hasLength(4));
      expect(
        [...first.items, ...last.items].map((r) => r.id),
        isNot(contains(records[2].id)),
      );
      expect(
        [...first.items, ...last.items].map((r) => r.id),
        contains(records[1].id),
      ); // hidden stays manageable
      expect(first.items.map((r) => r.id), isNot(contains(outside.id)));
      final branch = await repo.fetch(
        AdminResource.products,
        categoryId: child.id,
        query: 'مادة',
      );
      expect(branch.total, 23);
      expect(branch.items.map((r) => r.id), isNot(contains(records[0].id)));
      expect(
        (await repo.fetch(
          AdminResource.products,
          categoryId: root.id,
          query: 'outside',
        )).total,
        0,
      );
      expect(
        (await repo.fetch(
          AdminResource.products,
          query: 'outside',
        )).items.single.id,
        outside.id,
      );
    },
  );

  test(
    'category index groups hidden children, sorts siblings and preserves paths',
    () {
      final tree = AdminCategoryTree([
        AdminRecord({
          'id': 'late',
          'parent_id': 'main',
          'sort_order': 10,
          'name_en': 'Later',
        }),
        AdminRecord({'id': 'other', 'sort_order': 5, 'name_en': 'Other'}),
        AdminRecord({'id': 'main', 'sort_order': 1, 'name_en': 'Main'}),
        AdminRecord({
          'id': 'early',
          'parent_id': 'main',
          'sort_order': -2,
          'is_active': false,
          'name_en': 'Earlier',
        }),
      ]);
      expect(tree.roots.map((c) => c.id), ['main', 'other']);
      expect(tree.children('main').map((c) => c.id), ['early', 'late']);
      expect(tree.label('early', 'en'), 'Main / Earlier');
    },
  );

  test(
    'remote filtering uses existing category_id with q and pagination only',
    () async {
      late RequestOptions request;
      final dio = Dio(BaseOptions(baseUrl: 'https://example.com'))
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (value, handler) {
              request = value;
              handler.resolve(
                Response(
                  requestOptions: value,
                  data: {'data': [], 'page': 3, 'per_page': 20, 'total': 0},
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      await AdminRepositoryRemote(ApiClient(dio)).fetch(
        AdminResource.products,
        categoryId: 'category-id',
        query: 'Needle',
        page: 3,
      );
      expect(request.path, '/admin/products');
      expect(request.queryParameters, {
        'page': 3,
        'per_page': 20,
        'q': 'Needle',
        'category_id': 'category-id',
      });
    },
  );
}

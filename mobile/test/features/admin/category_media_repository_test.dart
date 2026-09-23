import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/admin/data/admin_repository_mock.dart';
import 'package:shubayr/features/admin/data/admin_repository_remote.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/category_description_limits.dart';
import 'package:shubayr/features/catalog/data/media/catalog_image.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';

Map<String, dynamic> category(String name, {String? parent, int order = 0}) => {
  'name_en': name,
  'name_ar': 'قسم',
  'parent_id': parent,
  'mock_description_en': 'Everyday essentials',
  'mock_description_ar': 'احتياجات يومية',
  'mock_icon_key': 'audio_headphones',
  'sort_order': order,
};
void main() {
  test(
    'opening management preserves existing detail gallery on an ordinary edit',
    () async {
      final catalog = CatalogRepositoryMock(delay: Duration.zero);
      final original = await catalog.fetchProduct('p1');
      final repo = AdminRepositoryMock(catalog: catalog, delay: Duration.zero);
      final record = (await repo.fetch(
        AdminResource.products,
        query: 'Wireless',
      )).items.first;
      expect(record.json['images'], original.images);
      await repo.save(AdminResource.products, {
        ...record.json,
        'name_en': 'Updated name',
      }, id: record.id);
      expect((await catalog.fetchProduct(record.id)).images, original.images);
    },
  );

  test(
    'description rejects blanks and independently enforces both limits',
    () async {
      final repo = AdminRepositoryMock(delay: Duration.zero);
      for (final value in ['', '  \n ', 'a b c d e f g', 'x' * 37]) {
        await expectLater(
          repo.save(AdminResource.categories, {
            ...category('Invalid'),
            'mock_description_en': value,
          }),
          throwsA(isA<AppFailure>()),
        );
      }
      for (final value in [
        'one two three four five six',
        'x' * 36,
        'عناية بالبشرة والشعر',
      ]) {
        expect(CategoryDescriptionLimits.isValid(value), isTrue);
      }
      expect(CategoryDescriptionLimits.wordCount('  one\n two\tthree  '), 3);
      await expectLater(
        repo.save(AdminResource.categories, {
          ...category('Invalid Arabic'),
          'mock_description_ar': ' ',
        }),
        throwsA(isA<AppFailure>()),
      );
    },
  );

  test(
    'category CRUD, media, visibility and ordering sync while admin retains hidden nodes',
    () async {
      final catalog = CatalogRepositoryMock(delay: Duration.zero);
      final repo = AdminRepositoryMock(catalog: catalog, delay: Duration.zero);
      final root = await repo.save(
        AdminResource.categories,
        category('Media parent', order: -200),
      );
      final child = await repo.save(AdminResource.categories, {
        ...category('Child', parent: root.id, order: 10),
        'mock_description_ar': null,
        'mock_description_en': null,
      });
      final firstChild = await repo.save(
        AdminResource.categories,
        category('First child', parent: root.id, order: -10),
      );
      final photo = LocalCatalogImage(
        Uint8List.fromList([1, 2]),
        name: 'photo',
      );
      final replacement = LocalCatalogImage(
        Uint8List.fromList([3, 4]),
        name: 'replacement',
      );
      for (final record in [root, child]) {
        for (final image in <CatalogImage?>[photo, replacement, null]) {
          final saved = await repo.save(AdminResource.categories, {
            ...record.json,
            'mock_image': image,
            'mock_image_managed': true,
          }, id: record.id);
          expect(saved.json['mock_image'], same(image));
          final roots = await catalog.fetchCategories();
          final node = record.id == root.id
              ? roots.first
              : roots.first.children.last;
          expect(node.image, same(image));
          expect(node.imageManaged, isTrue);
          expect(node.iconKey, 'audio_headphones');
          expect(
            node.toJson().keys.where((k) => k.startsWith('mock_')),
            isEmpty,
          );
        }
      }
      var parents = await catalog.fetchCategories();
      expect(parents.first.id, root.id);
      expect(parents.first.children.map((c) => c.id), [
        firstChild.id,
        child.id,
      ]);
      expect(parents.first.localizedDescription('en'), 'Everyday essentials');
      await repo.save(AdminResource.categories, {
        ...root.json,
        'is_active': false,
      }, id: root.id);
      expect(
        (await catalog.fetchCategories()).any((c) => c.id == root.id),
        isFalse,
      );
      // A newly created management repository must also retain hidden data.
      final management = await AdminRepositoryMock(
        catalog: catalog,
        delay: Duration.zero,
      ).fetch(AdminResource.categories);
      expect(
        management.items.where((c) => c.id == root.id).single.flag('is_active'),
        isFalse,
      );
      expect(
        management.items
            .where((c) => c.id == child.id)
            .single
            .flag('is_active'),
        isTrue,
      );
      await repo.save(AdminResource.categories, {
        ...root.json,
        'is_active': true,
      }, id: root.id);
      await repo.save(AdminResource.categories, {
        ...child.json,
        'is_active': false,
      }, id: child.id);
      expect(
        (await catalog.fetchCategories()).first.children.map((c) => c.id),
        [firstChild.id],
      );
      await repo.save(AdminResource.categories, {
        ...root.json,
        'sort_order': 999,
      }, id: root.id);
      expect((await catalog.fetchCategories()).last.id, root.id);
      final container = ProviderContainer(
        overrides: [catalogRepositoryProvider.overrideWithValue(catalog)],
      );
      addTearDown(container.dispose);
      expect(
        (await container.read(categoriesProvider.future)).last.id,
        root.id,
      );
    },
  );

  test(
    'product mixed gallery additions, replacement, ordering and removals survive mock reads',
    () async {
      final catalog = CatalogRepositoryMock(delay: Duration.zero);
      final repo = AdminRepositoryMock(catalog: catalog, delay: Duration.zero);
      final root = (await repo.fetch(AdminResource.categories)).items.first;
      final a = LocalCatalogImage(Uint8List.fromList([1]), name: 'a');
      final b = LocalCatalogImage(Uint8List.fromList([2]), name: 'b');
      const url = UrlCatalogImage('https://example.com/old.png');
      var record = await repo.save(AdminResource.products, {
        'name_en': 'Local media product',
        'name_ar': 'منتج',
        'category_id': root.id,
        'sale_price': 10,
        'images': [url.url],
        'mock_images': [url, a, b],
      });
      for (final images in <List<CatalogImage>>[
        [b, url, a],
        [b, a],
        [a],
        [],
      ]) {
        record = await repo.save(AdminResource.products, {
          ...record.json,
          'mock_images': images,
        }, id: record.id);
        final detail = await catalog.fetchProduct(record.id);
        expect(detail.displayImages, images);
        expect(
          (await catalog.fetchProducts(
            query: 'Local media product',
          )).data.single.displayImages,
          images,
        );
        expect(
          (detail.toJson()['images'] as List).map((image) => image['url']),
          [url.url],
        );
        expect(detail.toJson().containsKey('mock_images'), isFalse);
      }
      expect(
        Product.fromJson(
          (await catalog.fetchProduct(record.id)).toJson(),
        ).mockImages,
        isNull,
      );
    },
  );

  test(
    'remote rejects mock media and metadata before any HTTP request',
    () async {
      var calls = 0;
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              calls++;
              h.reject(DioException(requestOptions: r));
            },
          ),
        );
      addTearDown(dio.close);
      final repo = AdminRepositoryRemote(ApiClient(dio));
      await expectLater(
        repo.save(AdminResource.categories, category('Mock only')),
        throwsA(isA<AppFailure>()),
      );
      await expectLater(
        repo.save(AdminResource.products, {'mock_images': []}),
        throwsA(isA<AppFailure>()),
      );
      expect(calls, 0);
      final parsed = Category.fromJson({...category('Remote'), 'id': 'remote'});
      expect(parsed.iconKey, isNull);
      expect(parsed.image, isNull);
    },
  );
}

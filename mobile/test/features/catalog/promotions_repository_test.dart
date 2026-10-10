import 'package:shubayr/features/catalog/data/catalog_fixtures.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_remote.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';

const base = Product(
  id: 'p1',
  categoryId: 'c',
  nameEn: 'Product',
  nameAr: 'مادة',
  effectivePrice: 80,
);

void main() {
  test('scheduled discount responses expose the effective customer price', () {
    final startsAt = DateTime.utc(2026, 9, 1);
    final endsAt = DateTime.utc(2026, 9, 30);
    final product = Product.fromJson({
      ...base.toJson(),
      'price': 100,
      'discount_type': 'percentage',
      'discount_value': 20,
      'discount_starts_at': startsAt.toIso8601String(),
      'discount_ends_at': endsAt.toIso8601String(),
      'on_sale': true,
      'discounted_price': 80,
      'effective_price': 80,
      'discount_percent': 20,
    });

    expect(product.price, 100);
    expect(product.salePrice, 80);
    expect(product.compareAtPrice, 100);
    expect(product.isOnSale, isTrue);
    expect(product.discountType, 'percentage');
    expect(product.discountValue, 20);
    expect(product.discountStartsAt, startsAt);
    expect(product.discountEndsAt, endsAt);
    expect(product.toJson(), isNot(contains('sale_price')));
    expect(product.toJson(), isNot(contains('compare_at_price')));
    final gallery = Product.fromJson({
      ...product.toJson(),
      'images': [
        {
          'id': 'server-second',
          'url': 'https://example.com/second.jpg',
          'sort_order': 2,
          'is_primary': false,
        },
        {
          'id': 'server-first',
          'url': 'https://example.com/first.jpg',
          'sort_order': 1,
          'is_primary': true,
        },
      ],
    });
    expect(gallery.images, [
      'https://example.com/first.jpg',
      'https://example.com/second.jpg',
    ]);
    final roundTrip = Product.fromJson(gallery.toJson());
    expect(roundTrip.media.map((image) => image.id), [
      'server-second',
      'server-first',
    ]);
    expect(roundTrip.effectivePrice, 80);
    expect(roundTrip.discountPercent, 20);
    expect(roundTrip.discountStartsAt, startsAt);
  });

  test('updating media preserves scheduled discount fields', () {
    final startsAt = DateTime.utc(2026, 9, 1);
    final product = Product.fromJson({
      ...base.toJson(),
      'price': 100,
      'discount_type': 'percentage',
      'discount_value': 20,
      'discount_starts_at': startsAt.toIso8601String(),
      'discount_ends_at': null,
      'on_sale': true,
      'discounted_price': 80,
      'effective_price': 80,
      'discount_percent': 20,
    });
    const image = ProductImage(
      id: 'primary',
      url: 'https://example.com/primary.jpg',
      sortOrder: 0,
      isPrimary: true,
    );

    final updated = product.copyWith(media: [image]);

    expect(updated.media, [image]);
    expect(updated.primaryImage, image.url);
    expect(updated.price, 100);
    expect(updated.discountType, 'percentage');
    expect(updated.discountValue, 20);
    expect(updated.discountStartsAt, startsAt);
    expect(updated.effectivePrice, 80);
    expect(updated.salePrice, 80);
    expect(updated.toJson(), isNot(contains('mock_images')));
  });

  test(
    'older catalog responses without either promotion field remain supported',
    () {
      final json = base.toJson()
        ..remove('compare_at_price')
        ..remove('discount_percent');
      final product = Product.fromJson(json);
      expect(product.isOnSale, isFalse);
      expect(product.compareAtPrice, isNull);
      expect(product.discountPercent, isNull);
      expect(product.salePrice, 80);
    },
  );

  for (final original in <num?>[null, 0, 60, 80, 100]) {
    test(
      'promotion eligibility in legacy Mock fixtures: original=$original',
      () {
        final product = productFromFixture({
          ...base.toFixture(),
          'sale_price': 80,
          'compare_at_price': original,
          'discount_percent': original == 100 ? 20 : null,
        });
        final read = Product.fromJson(
          product.copyWith(media: fixtureProductImages(['image'])).toJson(),
        );
        expect(read.isOnSale, original == 100);
        expect(read.compareAtPrice, original == 100 ? original : null);
        expect(
          fixtureDiscountPercent(80, original),
          original == 100 ? 20 : null,
        );
        expect(read.discountPercent, original == 100 ? 20 : null);
      },
    );
  }
  test(
    'mock rounding follows contract; remote percentage is not overwritten',
    () {
      expect(fixtureDiscountPercent(100, 150), 33);
      final read = Product.fromJson({
        ...base.toJson(),
        'compare_at_price': 100,
        'discount_percent': 19,
      });
      expect(read.discountPercent, 19);
    },
  );

  test(
    'remote filters before pagination and preserves scheduled admin fields',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) {
            requests.add(r);
            h.resolve(
              Response<Map<String, dynamic>>(
                requestOptions: r,
                statusCode: 200,
                data: r.method == 'GET'
                    ? {
                        'page': 2,
                        'per_page': 20,
                        'total': 45,
                        'data': [
                          {
                            ...base.toJson(),
                            'price': 100,
                            'discount_type': 'percentage',
                            'discount_value': 20,
                            'on_sale': true,
                            'discount_percent': 20,
                          },
                        ],
                      }
                    : {
                        ...base.toJson(),
                        ...Map<String, dynamic>.from(r.data as Map),
                      },
              ),
            );
          },
        ),
      );
      final catalog = CatalogRepositoryRemote(ApiClient(dio));
      final page = await catalog.fetchProducts(
        onSale: true,
        page: 2,
        perPage: 20,
        categoryId: 'c',
        query: 'Product',
        minPrice: 10,
        maxPrice: 90,
        sort: 'price_asc',
      );
      expect(page.total, 45);
      expect(page.data.single.discountPercent, 20);
      expect(requests.last.queryParameters, {
        'on_sale': true,
        'page': 2,
        'per_page': 20,
        'category_id': 'c',
        'q': 'Product',
        'min_price': 10,
        'max_price': 90,
        'sort': 'price_asc',
      });
      await catalog.fetchProducts();
      expect(requests.last.queryParameters.containsKey('on_sale'), isFalse);
    },
  );

  late CatalogRepositoryMock catalog;
  late List<Map<String, dynamic>> products;
  late List<Map<String, dynamic>> categories;
  setUp(() async {
    catalog = CatalogRepositoryMock(delay: Duration.zero);
    products = (await catalog.fetchProducts(
      perPage: 100,
    )).data.map((p) => p.toFixture()).toList();
    categories = [];
    void flatten(Category c) {
      categories.add(c.toJson());
      c.children.forEach(flatten);
    }

    (await catalog.fetchCategories()).forEach(flatten);
  });
  tearDown(
    () => catalog.replaceFixtures(products: products, categories: categories),
  );

  test(
    '45 offers span 20/20/5; combined filters and totals precede slicing',
    () async {
      final template = products.first;
      catalog.replaceFixtures(
        categories: categories,
        products: [
          for (var i = 1; i <= 45; i++) ...[
            {
              ...template,
              'id': 'regular-$i',
              'name_en': 'Regular $i',
              'compare_at_price': null,
            },
            {
              ...template,
              'id': 'offer-$i',
              'name_en': 'Offer $i',
              'sale_price': i * 100,
              'compare_at_price': i * 200,
            },
          ],
          {
            ...template,
            'id': 'hidden-offer',
            'status': 'hidden',
            'compare_at_price': 999999,
          },
        ],
      );
      final ids = <String>[];
      for (var n = 1; n <= 3; n++) {
        final p = await catalog.fetchProducts(onSale: true, page: n);
        expect(p.total, 45);
        expect(p.data.length, n == 3 ? 5 : 20);
        expect(
          p.data.every((p) => p.isOnSale && p.discountPercent == 50),
          isTrue,
        );
        ids.addAll(p.data.map((p) => p.id));
      }
      expect(ids.toSet(), hasLength(45));
      expect(
        (await catalog.fetchProducts(onSale: true, page: 4)).data,
        isEmpty,
      );
      final filtered = await catalog.fetchProducts(
        onSale: true,
        query: 'Offer',
        categoryId: template['category_id'] as String,
        minPrice: 1000,
        maxPrice: 2000,
        sort: 'price_desc',
        perPage: 3,
      );
      expect(filtered.total, 11);
      expect(filtered.data.map((p) => p.salePrice), [2000, 1900, 1800]);
      expect(
        (await catalog.fetchProducts(onSale: true, query: 'Regular')).total,
        0,
      );
      expect((await catalog.fetchProducts()).total, 90);
    },
  );
}

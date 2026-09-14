import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/admin/data/admin_repository_mock.dart';
import 'package:shubayr/features/admin/data/admin_repository_remote.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_remote.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';

const base = Product(
  id: 'p1',
  categoryId: 'c',
  nameEn: 'Product',
  nameAr: 'مادة',
  salePrice: 80,
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
    test('promotion eligibility and legacy JSON: original=$original', () {
      final product = Product.fromJson({
        ...base.toJson(),
        'compare_at_price': ?original,
        'discount_percent': original == 100 ? 20 : null,
      });
      final read = Product.fromJson(
        product.copyWith(images: ['image']).toJson(),
      );
      expect(read.isOnSale, original == 100);
      expect(read.compareAtPrice, original);
      expect(
        Product.discountPercentFor(80, original),
        original == 100 ? 20 : null,
      );
      expect(read.discountPercent, original == 100 ? 20 : null);
    });
  }
  test(
    'mock rounding follows contract; remote percentage is not overwritten',
    () {
      expect(Product.discountPercentFor(100, 150), 33);
      final read = Product.fromJson({
        ...base.toJson(),
        'compare_at_price': 100,
        'discount_percent': 19,
      });
      expect(read.discountPercent, 19);
    },
  );

  test(
    'remote filters before pagination and only writes original price',
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
                            'compare_at_price': 100,
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
      final admin = AdminRepositoryRemote(ApiClient(dio));
      for (final original in <num?>[100, null]) {
        await admin.save(AdminResource.products, {
          ...base.toJson(),
          'compare_at_price': original,
          'discount_percent': 99,
        }, id: original == null ? 'p1' : null);
        expect(requests.last.data['compare_at_price'], original);
        expect(
          (requests.last.data as Map).containsKey('discount_percent'),
          isFalse,
        );
        expect(requests.last.method, original == null ? 'PATCH' : 'POST');
      }
    },
  );

  late CatalogRepositoryMock catalog;
  late List<Map<String, dynamic>> products;
  late List<Map<String, dynamic>> categories;
  setUp(() async {
    catalog = CatalogRepositoryMock(delay: Duration.zero);
    products = (await catalog.fetchProducts(
      perPage: 100,
    )).data.map((p) => p.toJson()).toList();
    categories = [];
    void flatten(Category c) {
      categories.add(c.toJson());
      c.children.forEach(flatten);
    }

    (await catalog.fetchCategories()).forEach(flatten);
  });
  tearDown(
    () => catalog.applyAdminCatalog(products: products, categories: categories),
  );

  test(
    '45 offers span 20/20/5; combined filters and totals precede slicing',
    () async {
      final template = products.first;
      catalog.applyAdminCatalog(
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

  test(
    'admin edits/removes offers; catalog and cart retain sale price',
    () async {
      final admin = AdminRepositoryMock(catalog: catalog, delay: Duration.zero);
      final original = (await admin.fetch(AdminResource.products)).items.first;
      final sale = original.json['sale_price'] as num;
      var saved = await admin.save(AdminResource.products, {
        ...original.json,
        'compare_at_price': sale * 2,
        'discount_percent': 99,
      }, id: original.id);
      expect(saved.json['discount_percent'], 50);
      expect((await catalog.fetchProduct(original.id)).discountPercent, 50);
      final cart = CartRepositoryMock(delay: Duration.zero);
      await cart.addItem(productId: original.id, quantity: 2);
      expect((await cart.fetchCart()).subtotal, sale * 2);
      // Changing the selling price must recalculate, even when original is omitted.
      final input = {...saved.json, 'sale_price': sale * 1.5}
        ..remove('compare_at_price');
      saved = await admin.save(AdminResource.products, input, id: original.id);
      expect(saved.json['discount_percent'], 25);
      for (final value in <num?>[null, sale, sale / 2]) {
        await admin.save(AdminResource.products, {
          ...saved.json,
          'compare_at_price': value,
        }, id: original.id);
        final p = await catalog.fetchProduct(original.id);
        expect(p.discountPercent, isNull);
        expect(p.isOnSale, isFalse);
        expect(
          (await catalog.fetchProducts(
            onSale: true,
          )).data.any((p) => p.id == original.id),
          isFalse,
        );
      }
      final created = await admin.save(AdminResource.products, {
        ...original.json,
        'compare_at_price': sale * 2,
      });
      expect(created.json['discount_percent'], 50);
      expect((await catalog.fetchProduct(created.id)).isOnSale, isTrue);
    },
  );
}

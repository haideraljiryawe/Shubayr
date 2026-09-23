import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/error_mapper.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/data/address_repository_remote.dart';
import 'package:shubayr/features/admin/data/admin_repository_remote.dart';
import 'package:shubayr/features/admin/data/catalog_media_remote.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/media/catalog_image.dart';
import 'package:shubayr/features/catalog/data/product.dart';

const scheduled = <String, dynamic>{
  'id': 'p',
  'category_id': 'child',
  'name_en': 'Product',
  'name_ar': 'منتج',
  'price': 100,
  'discount_type': 'percentage',
  'discount_value': 20,
  'discount_starts_at': '2027-01-01T09:00:00.000Z',
  'discount_ends_at': '2027-02-01T09:00:00.000Z',
  'effective_price': 100,
  'on_sale': false,
  'discounted_price': null,
  'discount_percent': null,
  'description': '',
  'status': 'active',
  'is_negotiable': false,
  'tracks_expiry': false,
  'variants': <dynamic>[],
  'images': <dynamic>[],
};

void main() {
  for (final (active, effective, percent) in [
    (false, 100, null),
    (true, 80, 20),
    (true, 0, 100),
  ]) {
    test(
      'server pricing remains authoritative: active=$active effective=$effective',
      () {
        final product = Product.fromJson({
          ...scheduled, 'on_sale': active, 'effective_price': effective,
          'discount_percent': percent,
          'discounted_price': active ? effective : null,
          // Old aliases in mixed data cannot rewrite the discount definition.
          'sale_price': 1, 'compare_at_price': 999,
          'images': [
            {
              'id': 'second',
              'url': 'https://example.com/b',
              'sort_order': 1,
              'is_primary': false,
            },
            {
              'id': 'first',
              'url': 'https://example.com/a',
              'sort_order': 0,
              'is_primary': true,
            },
          ],
        });
        expect(product.salePrice, effective);
        expect(product.isOnSale, active);
        expect(product.compareAtPrice, active ? 100 : null);
        expect(product.discountPercent, percent);
        expect(product.primaryImage, 'https://example.com/a');
        final saved = product.copyWith(mockImages: []).toJson();
        expect(saved['discount_type'], 'percentage');
        final fixtureRoundTrip = Product.fromMock(product.toMock());
        expect(fixtureRoundTrip.discountType, 'percentage');
        expect(fixtureRoundTrip.discountValue, 20);
        expect(fixtureRoundTrip.discountStartsAt, product.discountStartsAt);
        expect(fixtureRoundTrip.discountEndsAt, product.discountEndsAt);
        expect(saved['discount_starts_at'], scheduled['discount_starts_at']);
        expect(saved['discount_ends_at'], scheduled['discount_ends_at']);
        expect(saved.containsKey('sale_price'), isFalse);
        expect(saved.containsKey('salePrice'), isFalse);
        expect(Product.fromJson(saved).orderedMedia.map((image) => image.id), [
          'first',
          'second',
        ]);
      },
    );
  }

  test(
    'category wire fields keep hierarchy, content, image and visibility',
    () {
      final category = Category.fromJson({
        'id': 'child',
        'parent_id': 'root',
        'name_en': 'Child',
        'name_ar': 'فرعي',
        'slug': 'child',
        'description_en': 'English',
        'description_ar': 'عربي',
        'icon_key': 'electronics',
        'image_url': 'https://example.com/media/1',
        'sort_order': 7,
        'is_visible': false,
        'children': [],
      });
      expect(category.parentId, 'root');
      expect(category.iconKey, 'electronics');
      expect(category.localizedDescription('ar'), 'عربي');
      expect(
        (category.image as UrlCatalogImage).url,
        'https://example.com/media/1',
      );
      expect(category.isActive, isFalse);
      expect(category.sortOrder, 7);
      expect(category.toJson()['is_visible'], false);
      expect(category.toJson().containsKey('is_active'), isFalse);
    },
  );

  test(
    'remote PATCH preserves omission, partial discounts and variant identity',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              requests.add(r);
              h.resolve(
                Response(
                  requestOptions: r,
                  statusCode: 200,
                  data: {
                    'id': 'p',
                    ...Map<String, dynamic>.from(r.data as Map),
                  },
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final repo = AdminRepositoryRemote(ApiClient(dio));
      await repo.save(AdminResource.products, {'discount_value': 15}, id: 'p');
      expect(requests.last.data, {'discount_value': 15});
      await repo.save(AdminResource.products, {
        ...scheduled,
        'effective_price': 55,
        'on_sale': true,
        'variants': [
          {
            'id': 'existing',
            'sku': 'renamed',
            'attributes': {},
            'price_delta': 0,
          },
        ],
      }, id: 'p');
      final body = requests.last.data as Map;
      expect(body['price'], 100);
      expect(body['discount_starts_at'], scheduled['discount_starts_at']);
      expect(body['discount_ends_at'], scheduled['discount_ends_at']);
      expect(body.containsKey('effective_price'), false);
      expect(body.containsKey('images'), false);
      expect((body['variants'] as List).single['id'], 'existing');
      await repo.save(AdminResource.products, {'discount_type': null}, id: 'p');
      expect(requests.last.data, {'discount_type': null});
      await repo.save(AdminResource.categories, {
        'is_visible': false,
        'image_url': null,
      }, id: 'child');
      expect(requests.last.data, {'image_url': null, 'is_visible': false});
      final count = requests.length;
      await expectLater(
        repo.save(AdminResource.products, {}, id: 'p'),
        throwsA(isA<AppFailure>()),
      );
      expect(requests, hasLength(count));
    },
  );

  test(
    'admin reads use privileged endpoints including hidden categories',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              requests.add(r);
              h.resolve(
                Response(
                  requestOptions: r,
                  statusCode: 200,
                  data: r.path.endsWith('categories')
                      ? [
                          {
                            'id': 'hidden',
                            'is_visible': false,
                            'children': [
                              {'id': 'child', 'parent_id': 'hidden'},
                            ],
                          },
                        ]
                      : {
                          'page': 1,
                          'per_page': 20,
                          'total': 1,
                          'data': [scheduled],
                        },
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final repo = AdminRepositoryRemote(ApiClient(dio));
      final cats = await repo.fetch(AdminResource.categories);
      expect(requests.last.path, '/admin/categories');
      expect(cats.items.map((c) => c.id), ['hidden', 'child']);
      expect(cats.items.first.flag('is_visible'), false);
      await repo.fetch(AdminResource.products);
      expect(requests.last.path, '/admin/products');
    },
  );

  test(
    'media operations preserve IDs and desired primary/order atomically',
    () {
      final original = [
        for (var i = 0; i < 3; i++)
          ProductImage(
            id: '$i',
            url: 'url-$i',
            sortOrder: i,
            isPrimary: i == 0,
          ),
      ];
      final operations = CatalogMediaRemote.operations(original, [
        const UrlCatalogImage('replacement', productImageId: '2'),
        const UrlCatalogImage('new'),
        const UrlCatalogImage('url-0', productImageId: '0'),
      ]);
      expect(operations, [
        {'op': 'remove', 'image_id': '1'},
        {'op': 'replace', 'image_id': '2', 'url': 'replacement'},
        {'op': 'move', 'image_id': '2', 'position': 0},
        {'op': 'add', 'url': 'new', 'position': 1},
      ]);
      expect(
        CatalogMediaRemote.operations(original, [
          for (final i in original)
            UrlCatalogImage(i.url, productImageId: i.id),
        ]),
        isEmpty,
      );
    },
  );

  test(
    'upload sends multipart bytes and retains identity for replacement',
    () async {
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              expect(r.path, '/media/images');
              final file = (r.data as FormData).files.single;
              expect(file.key, 'file');
              expect(file.value.filename, 'photo.png');
              expect(file.value.contentType.toString(), 'image/png');
              h.resolve(
                Response(
                  requestOptions: r,
                  statusCode: 201,
                  data: {'public_url': 'https://example.com/media/new'},
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final image = await CatalogMediaRemote(ApiClient(dio)).upload(
        LocalCatalogImage(
          Uint8List.fromList([1, 2]),
          name: 'photo.png',
          productImageId: 'existing',
        ),
      );
      expect(image.url, 'https://example.com/media/new');
      expect(image.productImageId, 'existing');
    },
  );

  test(
    'address contact is normalized and round-trips on create and update',
    () async {
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (r, h) {
              expect((r.data as Map)['contact_phone'], '+9647812345678');
              h.resolve(
                Response(
                  requestOptions: r,
                  statusCode: 200,
                  data: {
                    'id': 'a',
                    ...Map<String, dynamic>.from(r.data as Map),
                  },
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final repo = AddressRepositoryRemote(ApiClient(dio));
      const input = AddressInput(
        city: 'Baghdad',
        contactPhone: '(+٩٦٤) ٧٨١ ٢٣٤-٥٦٧٨',
      );
      final created = await repo.createAddress(input);
      final updated = await repo.updateAddress(
        'a',
        created.toInput(isDefault: true),
      );
      expect(updated.contactPhone, '+9647812345678');
      expect(updated.isDefault, true);
    },
  );

  test(
    'errors retain stable code and field details; forbidden is not sign-in expiry',
    () {
      final r = RequestOptions(path: '/admin/products/p');
      final failure = mapDioException(
        DioException(
          requestOptions: r,
          type: DioExceptionType.badResponse,
          response: Response(
            requestOptions: r,
            statusCode: 422,
            data: {
              'status': 422,
              'code': 'VALIDATION_ERROR',
              'message': 'Invalid input',
              'errors': [
                {
                  'field': 'discount_value',
                  'code': 'INVALID',
                  'message': 'Out of range',
                },
              ],
            },
          ),
        ),
      );
      expect(failure.kind, FailureKind.validation);
      expect(failure.code, 'VALIDATION_ERROR');
      expect(failure.errors.single.field, 'discount_value');
      final forbidden = mapDioException(
        DioException(
          requestOptions: r,
          type: DioExceptionType.badResponse,
          response: Response(requestOptions: r, statusCode: 403),
        ),
      );
      expect(forbidden.kind, FailureKind.forbidden);
    },
  );
}

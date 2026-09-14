import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/admin/data/admin_repository_mock.dart';
import 'package:shubayr/features/admin/data/admin_repository_remote.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';

void main() {
  test(
    'mock catalog CRUD preserves write fields and rejects category cycles/references',
    () async {
      final repo = AdminRepositoryMock(delay: Duration.zero);
      final root = await repo.save(AdminResource.categories, {
        'name_ar': 'قسم',
        'name_en': 'Department',
        'mock_description_en': 'Daily essentials',
        'mock_description_ar': 'احتياجات يومية',
        'parent_id': null,
      });
      final child = await repo.save(AdminResource.categories, {
        'name_ar': 'فرعي',
        'name_en': 'Child',
        'parent_id': root.id,
      });
      await expectLater(
        repo.save(AdminResource.categories, {
          'name_ar': 'قسم',
          'name_en': 'Department',
          'parent_id': child.id,
        }, id: root.id),
        throwsA(isA<AppFailure>()),
      );
      final product = await repo.save(AdminResource.products, {
        'category_id': child.id,
        'name_ar': 'منتج',
        'name_en': 'Product',
        'sale_price': 1234,
        'images': ['https://example.com/a.png'],
        'tracks_expiry': true,
        'variants': [
          {
            'sku': 'sku-1',
            'attributes': {'color': 'red'},
            'price_delta': 500,
          },
        ],
      });
      expect(product.flag('in_stock'), isFalse);
      expect(product.json['available_qty'], 0);
      expect((product.json['variants'] as List).single['sku'], 'sku-1');
      await expectLater(
        repo.delete(AdminResource.categories, child.id),
        throwsA(isA<AppFailure>()),
      );
      final edited = await repo.save(AdminResource.products, {
        'category_id': root.id,
        'name_ar': 'معدل',
        'name_en': 'Edited',
        'sale_price': 1500,
      }, id: product.id);
      expect(edited.flag('tracks_expiry'), isTrue);
      expect(edited.json['images'], ['https://example.com/a.png']);
      await repo.delete(AdminResource.categories, child.id);
      await repo.delete(AdminResource.products, product.id);
      expect(
        (await repo.fetch(AdminResource.products, query: 'Edited')).items,
        isEmpty,
      );
    },
  );

  test(
    'users and roles support assignment, permission changes, search and protected deletions',
    () async {
      final repo = AdminRepositoryMock(delay: Duration.zero);
      final role = await repo.save(AdminResource.roles, {
        'name': 'assistant',
        'description': 'Helper',
        'permissions': ['catalog.view'],
      });
      final user = await repo.save(AdminResource.users, {
        'name': 'Ali',
        'phone': '07712345678',
        'email': 'ali@example.com',
        'role': 'assistant',
        'is_active': true,
        'password': 'temporary-test-password',
      });
      expect(user.json.containsKey('password'), isFalse);
      expect(user.json['permissions'], ['catalog.view']);
      await repo.save(AdminResource.roles, {
        'name': 'assistant2',
        'permissions': ['inventory.view'],
      }, id: role.id);
      final result = await repo.fetch(
        AdminResource.users,
        query: 'ali@',
        role: 'assistant2',
      );
      expect(result.total, 1);
      expect(result.items.single.json['permissions'], ['inventory.view']);
      await expectLater(
        repo.delete(AdminResource.roles, role.id),
        throwsA(isA<AppFailure>()),
      );
      await repo.save(AdminResource.users, {
        'phone': '07712345678',
        'is_active': false,
      }, id: user.id);
      expect(
        (await repo.fetch(
          AdminResource.users,
          query: '07712345678',
        )).items.single.flag('is_active'),
        isFalse,
      );
      await repo.delete(AdminResource.users, user.id);
      await repo.delete(AdminResource.roles, role.id);
      await expectLater(
        repo.delete(AdminResource.roles, 'role-admin'),
        throwsA(isA<AppFailure>()),
      );
    },
  );

  test(
    'supplier pages, create-only contract and warehouse-scoped location pages',
    () async {
      final repo = AdminRepositoryMock(delay: Duration.zero);
      expect((await repo.fetch(AdminResource.suppliers)).items, hasLength(20));
      expect(
        (await repo.fetch(AdminResource.suppliers, page: 2)).items,
        hasLength(3),
      );
      final supplier = await repo.save(AdminResource.suppliers, {
        'name': 'New supplier',
        'phone': '123',
        'is_active': true,
      });
      expect(
        (await repo.fetch(AdminResource.suppliers)).items.first.id,
        supplier.id,
      );
      await expectLater(
        repo.save(AdminResource.suppliers, {
          'name': 'Changed',
        }, id: supplier.id),
        throwsA(isA<AppFailure>()),
      );
      await expectLater(
        repo.delete(AdminResource.suppliers, supplier.id),
        throwsA(isA<AppFailure>()),
      );
      final locations = await repo.fetch(
        AdminResource.locations,
        warehouseId: 'warehouse-2',
        page: 2,
      );
      expect(locations.items, hasLength(5));
      expect(
        locations.items.every((l) => l.text('warehouse_id') == 'warehouse-2'),
        isTrue,
      );
    },
  );

  test(
    'remote read/write payloads match the contract and omit computed fields',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (request, handler) {
              requests.add(request);
              final Object? data = request.method == 'DELETE'
                  ? null
                  : request.method == 'GET'
                  ? {
                      'page': 2,
                      'per_page': 20,
                      'total': 21,
                      'data': [
                        {'id': 'x', 'name': 'Example'},
                      ],
                    }
                  : {
                      'id': 'x',
                      ...Map<String, dynamic>.from(request.data as Map),
                    };
              handler.resolve(
                Response(
                  requestOptions: request,
                  statusCode: request.method == 'DELETE' ? 204 : 200,
                  data: data,
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final repo = AdminRepositoryRemote(ApiClient(dio));
      await repo.fetch(
        AdminResource.users,
        page: 2,
        query: 'Ali',
        role: 'warehouse',
      );
      expect(requests.last.queryParameters, {
        'page': 2,
        'per_page': 20,
        'q': 'Ali',
        'role': 'warehouse',
      });
      await repo.fetch(AdminResource.locations, page: 2, warehouseId: 'wh');
      expect(requests.last.path, '/warehouses/wh/locations');
      await repo.save(AdminResource.products, {
        'id': 'x',
        'category_id': 'c',
        'name_ar': 'س',
        'name_en': 'P',
        'sale_price': 10,
        'available_qty': 999,
        'in_stock': true,
        'variants': [
          {
            'id': 'v',
            'sku': 'sku',
            'attributes': {'size': 'L'},
            'price_delta': 2,
          },
        ],
      }, id: 'x');
      expect(requests.last.path, '/admin/products/x');
      final payload = requests.last.data as Map;
      expect(payload.containsKey('available_qty'), isFalse);
      expect(payload.containsKey('id'), isFalse);
      expect((payload['variants'] as List).single, {
        'sku': 'sku',
        'attributes': {'size': 'L'},
        'price_delta': 2,
      });
      await repo.save(AdminResource.users, {
        'phone': '123',
        'role': 'warehouse',
        'permissions': ['users.manage'],
      });
      expect((requests.last.data as Map).containsKey('permissions'), isFalse);
      await repo.delete(AdminResource.categories, 'c');
      expect(requests.last.path, '/admin/categories/c');
    },
  );

  test('remote category tree is flattened for parent selection', () async {
    final dio = Dio()
      ..interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) => handler.resolve(
            Response(
              requestOptions: request,
              statusCode: 200,
              data: [
                {
                  'id': 'root',
                  'name_en': 'Root',
                  'name_ar': 'جذر',
                  'children': [
                    {
                      'id': 'child',
                      'parent_id': 'root',
                      'name_en': 'Child',
                      'name_ar': 'فرعي',
                    },
                  ],
                },
              ],
            ),
          ),
        ),
      );
    addTearDown(dio.close);
    final page = await AdminRepositoryRemote(
      ApiClient(dio),
    ).fetch(AdminResource.categories);
    expect(page.items.map((r) => r.id), ['root', 'child']);
    expect(page.hasMore, isFalse);
  });

  test(
    'admin catalog changes reach customer mock, without manually setting stock',
    () async {
      final catalog = CatalogRepositoryMock(delay: Duration.zero);
      final repo = AdminRepositoryMock(catalog: catalog, delay: Duration.zero);
      final category = await repo.save(AdminResource.categories, {
        'name_en': 'Admin demo',
        'mock_description_en': 'Daily essentials',
        'mock_description_ar': 'احتياجات يومية',
        'name_ar': 'اختبار الإدارة',
        'sort_order': -1,
        'is_active': true,
      });
      expect((await catalog.fetchCategories()).first.id, category.id);
      final product = await repo.save(AdminResource.products, {
        'category_id': category.id,
        'name_en': 'Admin demo item',
        'name_ar': 'مادة تجريبية للإدارة',
        'sale_price': 500,
        'status': 'active',
        'images': [],
      });
      expect(
        (await catalog.fetchProducts(query: 'Admin demo')).data.single.id,
        product.id,
      );
      expect((await catalog.fetchProduct(product.id)).inStock, isFalse);
      await repo.delete(AdminResource.products, product.id);
      expect((await catalog.fetchProducts(query: 'Admin demo')).data, isEmpty);
    },
  );
}

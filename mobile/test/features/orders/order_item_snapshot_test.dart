import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/admin/data/admin_order_repository_mock.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/order_repository_mock.dart';
import 'package:shubayr/features/orders/data/order_repository_remote.dart';
import 'package:shubayr/features/orders/presentation/widgets/order_item_display.dart';

const _current = Product(
  id: 'p1',
  categoryId: 'c1',
  nameAr: 'الاسم الجديد',
  nameEn: 'New name',
  images: ['https://example.com/new.jpg'],
  variants: [
    ProductVariant(id: 'v1', attributes: {'size': 'XL'}),
  ],
);

void main() {
  test('saved names and image survive order/page JSON round trips', () {
    final page = OrderPage.fromJson({
      'data': [
        {
          'id': 'o1',
          'order_number': 'SH-1',
          'items': [
            {
              'id': 'i1',
              'product_id': 'p1',
              'product_name_ar': 'اسم الشراء',
              'product_name_en': 'Purchase name',
              'image_url': 'https://example.com/old.jpg',
              'quantity': 2,
              'unit_price': 100,
              'line_total': 200,
            },
          ],
        },
      ],
    });
    final item = OrderPage.fromJson(page.toJson()).data.single.items.single;
    expect(item.displayName('ar', _current), 'اسم الشراء');
    expect(item.displayName('en', _current), 'Purchase name');
    expect(item.displayImage(_current), 'https://example.com/old.jpg');
    expect(item.quantity, 2);
    expect(item.lineTotal, 200);
    expect(item.toJson().containsKey('imageSnapshotProvided'), isFalse);
  });

  for (final explicitNull in [false, true]) {
    test('legacy vs explicit null image preserved: null=$explicitNull', () {
      final json = <String, dynamic>{
        'id': 'i1',
        'product_id': 'p1',
        if (explicitNull) 'image_url': null,
      };
      final item = OrderItem.fromJson(OrderItem.fromJson(json).toJson());
      expect(item.displayName('en', _current), 'New name');
      expect(item.displayName('en', null), 'p1');
      expect(item.imageSnapshotProvided, explicitNull);
      expect(
        item.displayImage(_current),
        explicitNull ? null : 'https://example.com/new.jpg',
      );
      expect(item.toJson().containsKey('image_url'), explicitNull);
    });
  }

  test('other saved language wins over a newer localized catalog name', () {
    const item = OrderItem(
      id: 'i1',
      productId: 'p1',
      productNameAr: '  اسم الشراء  ',
      productNameEn: '  ',
      imageSnapshotProvided: true,
    );
    expect(item.displayName('en', _current), 'اسم الشراء');
    expect(item.needsCatalogDetails, isFalse);
  });

  test('variant enrichment cannot replace the saved product name', () {
    const item = OrderItem(
      id: 'i1',
      productId: 'p1',
      variantId: 'v1',
      productNameEn: 'Purchase name',
    );
    expect(item.variantLabel(_current), 'XL');
    expect(item.variantLabel(null), 'v1');
    expect(item.displayName('en', _current), 'Purchase name');
  });

  test(
    'remote reads snapshots without adding them to checkout payloads',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio();
      addTearDown(dio.close);
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            requests.add(request);
            final order = {
              'id': 'o1',
              'order_number': 'SH-1',
              'items': [
                {
                  'id': 'i1',
                  'product_id': 'p1',
                  'product_name_ar': 'اسم الشراء',
                  'product_name_en': 'Purchase name',
                  'image_url': null,
                },
              ],
            };
            handler.resolve(
              Response(
                requestOptions: request,
                statusCode: 200,
                data: request.method == 'GET' && request.path == '/orders'
                    ? {
                        'data': [order],
                      }
                    : order,
              ),
            );
          },
        ),
      );
      final repo = OrderRepositoryRemote(ApiClient(dio));
      final orders = [
        await repo.placeOrder(addressId: 'a1', couponCode: 'SAVE10'),
        await repo.fetchOrder('o1'),
        (await repo.fetchOrders()).data.single,
        await repo.cancelOrder('o1'),
      ];
      for (final order in orders) {
        expect(order.items.single.displayName('ar', _current), 'اسم الشراء');
        expect(order.items.single.displayImage(_current), isNull);
      }
      expect(requests.first.data, {
        'address_id': 'a1',
        'coupon_code': 'SAVE10',
        'payment_method': 'cod',
      });
    },
  );

  test(
    'mock captures at checkout and survives catalog edits/deletion',
    () async {
      final catalog = CatalogRepositoryMock(delay: Duration.zero);
      final original = (await catalog.fetchProducts(perPage: 100)).data;
      final categories = <Map<String, dynamic>>[];
      void flatten(Category category) {
        categories.add(category.toJson());
        category.children.forEach(flatten);
      }

      (await catalog.fetchCategories()).forEach(flatten);
      void replace(List<Product> products) => catalog.applyAdminCatalog(
        products: products.map((p) => p.toJson()).toList(),
        categories: categories,
      );
      addTearDown(() => replace(original));

      final cart = CartRepositoryMock(delay: Duration.zero);
      final repo = OrderRepositoryMock(cart, delay: Duration.zero);
      final admin = AdminOrderRepositoryMock(delay: Duration.zero);
      final seed = (await repo.fetchOrders()).data.first;
      final adminSeed = (await admin.fetchOrders()).data.first;

      final atPurchase = Product.fromMock({
        ...original.firstWhere((p) => p.id == 'p1').toMock(),
        'name_ar': 'اسم وقت الشراء',
        'name_en': 'At purchase',
        'images': ['https://example.com/purchase.jpg'],
      });
      replace([
        for (final p in original)
          if (p.id == 'p1') atPurchase else p,
      ]);
      await cart.addItem(productId: 'p1', quantity: 2);
      final placed = await repo.placeOrder(addressId: 'a1');
      expect(placed.items.single.productNameEn, 'At purchase');
      expect(placed.items.single.imageUrl, 'https://example.com/purchase.jpg');

      final renamed = Product.fromMock({
        ...atPurchase.toMock(),
        'name_en': 'Renamed after purchase',
        'images': <String>[],
      });
      replace([
        for (final p in original)
          if (p.id == 'p1') renamed else p,
      ]);
      await cart.addItem(productId: 'p1', quantity: 1);
      final next = await repo.placeOrder(addressId: 'a1');
      expect(next.items.single.productNameEn, 'Renamed after purchase');
      expect(next.items.single.imageSnapshotProvided, isTrue);
      expect(next.items.single.imageUrl, isNull);
      expect(
        (await repo.fetchOrder(placed.id)).items.single.toJson(),
        placed.items.single.toJson(),
      );

      replace([
        for (final p in original)
          if (p.id != 'p1') p,
      ]);
      final read = await repo.fetchOrder(placed.id);
      expect(read.items.single.toJson(), placed.items.single.toJson());
      expect(
        (await repo.cancelOrder(placed.id)).items.single.toJson(),
        placed.items.single.toJson(),
      );
      expect(
        (await repo.fetchOrder(seed.id)).items.first.toJson(),
        seed.items.first.toJson(),
      );
      expect(
        (await admin.updateStatus(
          adminSeed.id,
          'confirmed',
        )).items.single.toJson(),
        adminSeed.items.single.toJson(),
      );
      expect(adminSeed.items.single.productNameEn, isNotEmpty);
    },
  );
}

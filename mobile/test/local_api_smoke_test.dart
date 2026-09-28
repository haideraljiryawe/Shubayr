import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/data/address_repository_remote.dart';
import 'package:shubayr/features/admin/data/admin_order_repository_remote.dart';
import 'package:shubayr/features/admin/data/admin_repository_remote.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/auth/data/auth_repository_remote.dart';
import 'package:shubayr/features/banners/data/banner_repository_remote.dart';
import 'package:shubayr/features/cart/data/cart_repository_remote.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_remote.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_remote.dart';
import 'package:shubayr/features/orders/data/order_repository_remote.dart';
import 'package:shubayr/features/settings/data/settings_repository_remote.dart';

// Explicit opt-in: never contact a server in the ordinary unit/widget suite.
// Only the seeded local development API is used, never a configurable remote.
const _enabled = bool.fromEnvironment('RUN_LOCAL_API_SMOKE');

void main() {
  group('Local database-backed repositories', () {
    late Dio dio;
    late ApiClient api;

    setUp(() {
      dio = Dio(
        BaseOptions(
          baseUrl: 'http://localhost:8000/api/v1',
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
      api = ApiClient(dio);
    });
    tearDown(() => dio.close(force: true));

    Future<void> signIn(String phone, String role) async {
      final auth = AuthRepositoryRemote(api);
      await auth.requestOtp(phone);
      final session = await auth.verifyOtp(phone: phone, code: '000000');
      expect(session.accessToken, isNotEmpty);
      dio.options.headers['Authorization'] = 'Bearer ${session.accessToken}';
      expect((await auth.currentUser()).role, role);
    }

    test(
      'public catalog, computed prices, media and content deserialize',
      () async {
        final catalog = CatalogRepositoryRemote(api);
        expect(await catalog.fetchCategories(), isNotEmpty);
        final page = await catalog.fetchProducts(perPage: 100);
        expect(page.data, isNotEmpty);
        for (final product in page.data) {
          expect(product.effectivePrice, greaterThanOrEqualTo(0));
          expect(product.media, isNotEmpty);
          final detail = await catalog.fetchProduct(product.id);
          expect(detail.effectivePrice, product.effectivePrice);
          expect(detail.discountStartsAt, product.discountStartsAt);
          expect(detail.discountEndsAt, product.discountEndsAt);
        }
        final product = page.data.first;
        expect(
          (await catalog.fetchAvailability(product.id)).productId,
          product.id,
        );
        await catalog.fetchReviews(product.id);
        expect(await BannerRepositoryRemote(api).fetchBanners(), isNotEmpty);
        await SettingsRepositoryRemote(api).fetch();
      },
    );

    test(
      'development OTP, customer cart/orders, address write and reread',
      () async {
        await signIn('+9647700000006', 'customer');
        await CartRepositoryRemote(api).fetchCart();
        final orders = OrderRepositoryRemote(api);
        final page = await orders.fetchOrders();
        expect(page.data, isNotEmpty);
        await orders.fetchOrder(page.data.first.id);
        await orders.fetchTracking(page.data.first.id);
        final addresses = AddressRepositoryRemote(api);
        final created = await addresses.createAddress(
          const AddressInput(
            label: 'Local API smoke test',
            city: 'Baghdad',
            area: 'Test',
            street: 'Test',
            contactPhone: '+9647700000006',
          ),
        );
        try {
          final saved = (await addresses.fetchAddresses(
            perPage: 100,
          )).data.singleWhere((address) => address.id == created.id);
          expect(saved.contactPhone, '+9647700000006');
          expect(saved.city, 'Baghdad');
        } finally {
          await addresses.deleteAddress(created.id);
        }
      },
    );

    test('administrator reads real catalog and orders', () async {
      await signIn('+9647700000001', 'admin');
      final admin = AdminRepositoryRemote(api);
      expect((await admin.fetch(AdminResource.products)).items, isNotEmpty);
      expect((await admin.fetch(AdminResource.categories)).items, isNotEmpty);
      expect(
        (await AdminOrderRepositoryRemote(api).fetchOrders()).data,
        isNotEmpty,
      );
    });

    test('delivery agent reads assigned deliveries', () async {
      await signIn('+9647700000005', 'delivery');
      final page = await DeliveryRepositoryRemote(api).fetchAssigned();
      expect(page.data, isNotEmpty);
    });
  }, skip: !_enabled ? 'Requires explicitly enabled, seeded local API' : false);
}

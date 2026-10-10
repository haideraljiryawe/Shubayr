import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';

class _EditableCatalog extends CatalogRepositoryMock {
  int revision = 0;
  int categoryRequests = 0;
  int productRequests = 0;
  Completer<List<Category>>? pendingCategories;

  @override
  Future<List<Category>> fetchCategories() async {
    categoryRequests++;
    if (pendingCategories case final pending?) return pending.future;
    return [Category(id: 'c', nameEn: 'Category $revision', nameAr: 'قسم')];
  }

  Product get product => Product(
    id: 'p',
    categoryId: 'c',
    nameEn: 'Product $revision',
    nameAr: 'منتج',
    price: 100,
    effectivePrice: revision == 0 ? 90 : 80,
    onSale: true,
  );

  @override
  Future<Product> fetchProduct(String id) async => Product(
    id: id,
    categoryId: 'c',
    nameEn: product.nameEn,
    nameAr: 'منتج',
    price: product.price,
    effectivePrice: product.effectivePrice,
    media: [
      ProductImage(
        id: 'image-$revision',
        url: 'https://example.test/image-$revision.jpg',
        sortOrder: 0,
        isPrimary: true,
      ),
    ],
  );

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
    productRequests++;
    return ProductPage(data: [product], page: 1, perPage: perPage, total: 1);
  }
}

Future<ProviderContainer> _mount(
  WidgetTester tester,
  _EditableCatalog catalog,
) async {
  // Taller than the content: pulling must work even without scroll overflow.
  tester.view.physicalSize = const Size(390, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      notificationSyncProvider.overrideWith((ref) {}),
      unreadCountProvider.overrideWith((ref) async => 0),
      dataSourceProvider.overrideWithValue(DataSource.mock),
      prefsStoreProvider.overrideWithValue(PrefsStore(prefs)),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      catalogRepositoryProvider.overrideWithValue(catalog),
      homeBannersProvider.overrideWith((ref) async => []),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(
        locale: Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: HomeScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  testWidgets(
    'Home pull fetches external catalog changes and expires cached details without polling',
    (tester) async {
      final catalog = _EditableCatalog();
      final container = await _mount(tester, catalog);
      final oldDetail = await container.read(productProvider('p').future);
      await container.read(categoryFeedProvider('c').future);
      expect(oldDetail.images, ['https://example.test/image-0.jpg']);
      expect(find.text('Category 0'), findsOneWidget);
      final requests = catalog.productRequests;
      catalog.revision = 1; // Represents an admin save in another client.
      await tester.pump(const Duration(seconds: 20));
      expect(catalog.productRequests, requests);
      expect(catalog.categoryRequests, 1);
      expect(find.text('Category 1'), findsNothing);

      await tester.drag(find.byType(ListView).first, const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Category 0'), findsNothing);
      expect(find.text('Category 1'), findsOneWidget);
      expect(
        container
            .read(homeOffersProvider)
            .requireValue
            .data
            .single
            .effectivePrice,
        80,
      );
      final detail = await container.read(productProvider('p').future);
      expect(detail.effectivePrice, 80);
      expect(detail.images, ['https://example.test/image-1.jpg']);
      expect(
        (await container.read(
          categoryFeedProvider('c').future,
        )).data.single.nameEn,
        'Product 1',
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Home refresh waits for categories and recovers after a failed request',
    (tester) async {
      final catalog = _EditableCatalog();
      await _mount(tester, catalog);
      catalog.pendingCategories = Completer<List<Category>>();
      var finished = false;
      final refresh = tester.widget<RefreshIndicator>(
        find.byType(RefreshIndicator),
      );
      final work = refresh.onRefresh().then((_) => finished = true);
      await tester.pump();
      expect(finished, isFalse);
      catalog.pendingCategories!.completeError(StateError('offline'));
      await work;
      await tester.pumpAndSettle();
      expect(finished, isTrue);
      expect(tester.takeException(), isNull);
      catalog.pendingCategories = null;
      catalog.revision = 1;
      await tester
          .widget<RefreshIndicator>(find.byType(RefreshIndicator))
          .onRefresh();
      await tester.pumpAndSettle();
      expect(find.text('Category 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

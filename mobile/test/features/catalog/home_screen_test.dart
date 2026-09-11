import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/data/review.dart';
import 'package:shubayr/features/catalog/domain/catalog_repository.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_detail_screen.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_card.dart';

/// A deterministic catalog with no image URLs, so the test never touches the
/// network (real product images are exercised on device, not in unit tests).
class _FakeCatalog implements CatalogRepository {
  static const _p1 = Product(
    id: 'p1',
    categoryId: 'c1',
    nameEn: 'Test Product One',
    nameAr: 'منتج أول',
    salePrice: 10000,
    ratingAvg: 4.5,
    availableQty: 5,
  );
  static const _p2 = Product(
    id: 'p2',
    categoryId: 'c2',
    nameEn: 'Test Product Two',
    nameAr: 'منتج ثانٍ',
    salePrice: 20000,
    availableQty: 0,
    inStock: false,
  );

  @override
  Future<List<Category>> fetchCategories() async => const [
    Category(id: 'c1', nameEn: 'Cat One', nameAr: 'قسم أول'),
    Category(id: 'c2', nameEn: 'Cat Two', nameAr: 'قسم ثانٍ'),
  ];

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
    final all = [_p1, _p2];
    final data = categoryId == null
        ? all
        : all.where((p) => p.categoryId == categoryId).toList();
    return ProductPage(
      page: 1,
      perPage: perPage,
      total: data.length,
      data: data,
    );
  }

  @override
  Future<Product> fetchProduct(String id) async => id == 'p2' ? _p2 : _p1;

  @override
  Future<ProductAvailability> fetchAvailability(String id) async =>
      ProductAvailability(
        productId: id,
        inStock: id != 'p2',
        availableQty: id == 'p2' ? 0 : 5,
      );

  @override
  Future<ReviewPage> fetchReviews(
    String id, {
    int page = 1,
    int perPage = 20,
  }) async => const ReviewPage();
}

Future<ProviderContainer> _container() async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  return ProviderContainer(
    overrides: [
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      catalogRepositoryProvider.overrideWithValue(_FakeCatalog()),
    ],
  );
}

void main() {
  testWidgets(
    'home lists products and opens product detail',
    (tester) async {
      final container = await _container();
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const ShubayrApp(),
        ),
      );
      await tester.pumpAndSettle();

      // A signed-out guest lands on Home (catalog is public) and sees products.
      expect(find.byType(ProductCard), findsNWidgets(2));
      expect(find.text('منتج أول'), findsOneWidget); // Arabic-first name

      await tester.tap(find.byType(ProductCard).first);
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(ProductDetailScreen), findsOneWidget);
    },
    timeout: const Timeout(Duration(seconds: 30)),
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/data/review.dart';
import 'package:shubayr/features/catalog/domain/catalog_repository.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_detail_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

/// A product with three variants (S=low stock, M=in stock, L=sold out) and no
/// images, so the detail screen never touches the network.
class _FakeCatalog implements CatalogRepository {
  _FakeCatalog({this.promotion = false});
  final bool promotion;
  static const _product = Product(
    id: 'v1',
    categoryId: 'c',
    nameEn: 'Tee',
    nameAr: 'قميص',
    salePrice: 10000,
    availableQty: 13,
    variants: [
      ProductVariant(id: 'v1-s', sku: 'S', attributes: {'size': 'S'}),
      ProductVariant(
        id: 'v1-m',
        sku: 'M',
        attributes: {'size': 'M'},
        priceDelta: 5000,
      ),
      ProductVariant(
        id: 'v1-l',
        sku: 'L',
        attributes: {'size': 'L'},
        priceDelta: 2000,
      ),
    ],
  );

  @override
  Future<Product> fetchProduct(String id) async => promotion
      ? Product.fromJson({
          ..._product.toJson(),
          'price': 20000,
          'discount_type': 'percentage',
          'discount_value': 50,
          'on_sale': true,
          'discounted_price': 10000,
          'effective_price': 10000,
          'discount_percent': 50,
        })
      : _product;

  @override
  Future<ProductAvailability> fetchAvailability(
    String id,
  ) async => const ProductAvailability(
    productId: 'v1',
    inStock: true,
    availableQty: 13,
    variants: [
      VariantAvailability(variantId: 'v1-s', availableQty: 3, inStock: true),
      VariantAvailability(variantId: 'v1-m', availableQty: 10, inStock: true),
      VariantAvailability(variantId: 'v1-l', availableQty: 0, inStock: false),
    ],
  );

  @override
  Future<List<Category>> fetchCategories() async => const [];

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
  }) async => throw UnimplementedError();

  @override
  Future<ReviewPage> fetchReviews(
    String id, {
    int page = 1,
    int perPage = 20,
  }) async => const ReviewPage();
}

Widget _host({bool promotion = false}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    catalogRepositoryProvider.overrideWithValue(
      _FakeCatalog(promotion: promotion),
    ),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: ProductDetailScreen(productId: 'v1'),
  ),
);

void main() {
  // A phone-sized portrait surface so the square gallery doesn't push the rest
  // of the (lazily built) list out of the viewport.
  void sizePhone(WidgetTester tester) {
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
  }

  testWidgets(
    'variant price keeps product offer explicitly tied to base price',
    (tester) async {
      sizePhone(tester);
      await tester.pumpWidget(_host(promotion: true));
      await tester.pumpAndSettle();
      expect(find.text('50% off'), findsOneWidget);
      expect(find.textContaining('20,000'), findsOneWidget);
      expect(find.text('Base product offer'), findsNothing);
      await tester.ensureVisible(find.text('M'));
      await tester.tap(find.text('M'));
      await tester.pumpAndSettle();
      expect(find.text('Base product offer'), findsOneWidget);
      expect(find.textContaining('15,000'), findsOneWidget);
      expect(find.textContaining('10,000'), findsOneWidget);
      expect(find.textContaining('25,000'), findsNothing);
      expect(find.text('50% off'), findsOneWidget);
    },
  );

  testWidgets('selecting a variant updates the price and availability', (
    tester,
  ) async {
    sizePhone(tester);
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();

    // Defaults to the first variant (S): base price and its low-stock hint.
    expect(find.textContaining('10,000'), findsOneWidget);
    expect(find.text('Only 3 left'), findsOneWidget);

    // Selecting M (price_delta 5000) lifts the price and refreshes the badge.
    await tester.tap(find.text('M'));
    await tester.pumpAndSettle();
    expect(find.textContaining('15,000'), findsOneWidget);
    expect(find.text('In stock'), findsOneWidget);
  });

  testWidgets('the detail quantity stepper adjusts the amount', (tester) async {
    sizePhone(tester);
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();

    expect(find.text('Quantity'), findsOneWidget);
    final add = find.byIcon(Icons.add);
    await tester.ensureVisible(add);
    await tester.tap(add);
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('a sold-out variant cannot be selected', (tester) async {
    sizePhone(tester);
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();

    await tester.tap(find.text('M'));
    await tester.pumpAndSettle();
    expect(find.textContaining('15,000'), findsOneWidget);

    // L is out of stock → disabled; tapping it must not change the price to
    // its own total (12,000).
    await tester.tap(find.text('L'));
    await tester.pumpAndSettle();
    expect(find.textContaining('12,000'), findsNothing);
    expect(find.textContaining('15,000'), findsOneWidget);
  });
}

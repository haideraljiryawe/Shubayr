import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/data/review.dart';
import 'package:shubayr/features/catalog/domain/catalog_repository.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/categories_screen.dart';

/// A small two-level department tree; products aren't used here.
class _FakeCatalog implements CatalogRepository {
  @override
  Future<List<Category>> fetchCategories() async => const [
    Category(
      id: 'c1',
      nameEn: 'Electronics',
      nameAr: 'إلكترونيات',
      children: [
        Category(id: 'c1a', parentId: 'c1', nameEn: 'Phones', nameAr: 'هواتف'),
        Category(id: 'c1b', parentId: 'c1', nameEn: 'Audio', nameAr: 'صوتيات'),
      ],
    ),
    Category(
      id: 'c2',
      nameEn: 'Grocery',
      nameAr: 'بقالة',
      children: [
        Category(id: 'c2a', parentId: 'c2', nameEn: 'Pantry', nameAr: 'مؤن'),
      ],
    ),
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
  }) async => throw UnimplementedError();

  @override
  Future<Product> fetchProduct(String id) async => throw UnimplementedError();

  @override
  Future<ProductAvailability> fetchAvailability(String id) async =>
      throw UnimplementedError();

  @override
  Future<ReviewPage> fetchReviews(
    String id, {
    int page = 1,
    int perPage = 20,
  }) async => const ReviewPage();
}

Widget _host({String locale = 'en'}) => ProviderScope(
  overrides: [catalogRepositoryProvider.overrideWithValue(_FakeCatalog())],
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: const CategoriesScreen(),
  ),
);

void main() {
  for (final locale in ['ar', 'en']) {
    testWidgets('browse-all chevron follows $locale navigation direction', (
      tester,
    ) async {
      await tester.pumpWidget(_host(locale: locale));
      await tester.pumpAndSettle();

      // Check the rendered mirror, not just the selected IconData name.
      final chevron = find.byIcon(Icons.chevron_right);
      expect(chevron, findsOneWidget);
      expect(find.byIcon(Icons.chevron_left), findsNothing);
      final mirror = find.descendant(
        of: chevron,
        matching: find.byType(Transform),
      );
      if (locale == 'ar') {
        expect(tester.widget<Transform>(mirror).transform.entry(0, 0), -1);
      } else {
        expect(mirror, findsNothing);
      }
      // The non-directional category icon is never mirrored.
      expect(
        find.descendant(
          of: find.byIcon(Icons.grid_view_rounded),
          matching: find.byType(Transform),
        ),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('lists departments and shows the first one\'s subcategories', (
    tester,
  ) async {
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();

    // Both departments appear in the rail.
    expect(find.byKey(const ValueKey('cat-rail-c1')), findsOneWidget);
    expect(find.byKey(const ValueKey('cat-rail-c2')), findsOneWidget);

    // The first department is selected by default: its subcategories show.
    expect(find.text('Phones'), findsOneWidget);
    expect(find.text('Audio'), findsOneWidget);
    expect(find.text('Browse all'), findsOneWidget);
    // The other department's subcategory is not on screen yet.
    expect(find.text('Pantry'), findsNothing);
  });

  testWidgets('selecting a department swaps the detail pane', (tester) async {
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('cat-rail-c2')));
    await tester.pumpAndSettle();

    expect(find.text('Pantry'), findsOneWidget);
    expect(find.text('Phones'), findsNothing);
    expect(find.text('Audio'), findsNothing);
  });
}

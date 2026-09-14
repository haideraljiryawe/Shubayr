import '../../helpers/product_filters.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/providers/product_list_controller.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

class _Catalog extends CatalogRepositoryMock {
  _Catalog() : super(delay: Duration.zero);
  bool failAppend = false;
  final calls =
      <
        ({bool offer, int page, String? category, String? query, String? sort})
      >[];
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
    calls.add((
      offer: onSale,
      page: page,
      category: categoryId,
      query: query,
      sort: sort,
    ));
    if (failAppend && onSale && page == 2) throw const AppFailure.network();
    final items = [
      for (var i = 0; i < 17; i++)
        Product(
          id: 'p$i',
          categoryId: 'c',
          nameEn: 'Product $i',
          nameAr: 'مادة $i',
          salePrice: 40000,
          compareAtPrice: i.isEven ? 50000 : null,
          discountPercent: i.isEven ? 20 : null,
        ),
    ];
    final matches = items
        .where(
          (p) =>
              (!onSale || p.isOnSale) &&
              (query == null || p.nameEn.contains(query)),
        )
        .toList();
    return ProductPage(
      page: page,
      perPage: perPage,
      total: matches.length,
      data: matches.skip((page - 1) * perPage).take(perPage).toList(),
    );
  }
}

Widget _host(_Catalog repo, {bool offers = false}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    catalogRepositoryProvider.overrideWithValue(repo),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: MaterialApp(
    locale: const Locale('en'),
    theme: AppTheme.dark(const Brand.bundled()),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: ProductListScreen(
      initialQuery: ProductQuery(categoryId: 'c', onSale: offers),
    ),
  ),
);
Finder get scrollable => find
    .descendant(
      of: find.byType(CustomScrollView),
      matching: find.byType(Scrollable),
    )
    .first;
void main() {
  void size(WidgetTester tester, double width) {
    tester.view.physicalSize = Size(width, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  testWidgets('offers chip filters every page and keeps category/search/sort', (
    tester,
  ) async {
    size(tester, 390);
    final repo = _Catalog();
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    await toggleProductOffers(tester);
    expect(repo.calls.last.offer, isTrue);
    expect(repo.calls.last.page, 1);
    expect(repo.calls.last.category, 'c');
    await tester.scrollUntilVisible(
      find.text('Product 16'),
      400,
      scrollable: scrollable,
      maxScrolls: 25,
    );
    await tester.pumpAndSettle();
    expect(repo.calls.where((r) => r.offer).map((r) => r.page), [1, 2]);
    await tester.enterText(find.byType(TextField), 'Product 0');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(repo.calls.last.query, 'Product 0');
    expect(repo.calls.last.offer, isTrue);
    await chooseProductSort(tester, ProductSort.priceAsc);
    expect(repo.calls.last.sort, 'price_asc');
    expect(repo.calls.last.query, 'Product 0');
    expect(repo.calls.last.offer, isTrue);
    await tester.enterText(find.byType(TextField), 'missing');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    await toggleProductOffers(tester);
    expect(repo.calls.last.offer, isFalse);
    expect(repo.calls.last.query, 'missing');
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'wide offers list loads the next page without requiring a scroll',
    (tester) async {
      size(tester, 1920);
      final repo = _Catalog();
      await tester.pumpWidget(_host(repo, offers: true));
      await tester.pumpAndSettle();
      expect(repo.calls.map((r) => r.page), [1, 2]);
      expect(find.text('Product 16'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('offers append error exposes retry for the same page', (
    tester,
  ) async {
    size(tester, 390);
    final repo = _Catalog()..failAppend = true;
    await tester.pumpWidget(_host(repo, offers: true));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Retry'),
      400,
      scrollable: scrollable,
      maxScrolls: 25,
    );
    await tester.pumpAndSettle();
    expect(repo.calls.map((r) => r.page), [1, 2]);
    repo.failAppend = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(repo.calls.map((r) => r.page), [1, 2, 2]);
    expect(repo.calls.every((r) => r.offer), isTrue);
    await tester.scrollUntilVisible(
      find.text('Product 16'),
      300,
      scrollable: scrollable,
      maxScrolls: 20,
    );
    expect(tester.takeException(), isNull);
  });
}

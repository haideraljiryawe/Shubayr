import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

class _Catalog extends CatalogRepositoryMock {
  final pages = <int>[];

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
    pages.add(page);
    final products = [
      for (var i = 0; i < 17; i++)
        Product(
          id: 'p$i',
          categoryId: 'c',
          nameEn: 'Product $i with a long name',
          nameAr: 'منتج $i',
          salePrice: 50000,
          ratingAvg: 4.5,
        ),
    ];
    return ProductPage(
      page: page,
      perPage: perPage,
      total: products.length,
      data: products.skip((page - 1) * perPage).take(perPage).toList(),
    );
  }
}

void main() {
  testWidgets(
    'adaptive search rows keep paging, the odd final card and navigation',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 700));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final repository = _Catalog();
      final router = GoRouter(
        routes: [
          GoRoute(path: '/', builder: (_, _) => const ProductListScreen()),
          GoRoute(
            path: '/products/:id',
            name: AppRoutes.productName,
            builder: (_, state) =>
                Scaffold(body: Text('Opened ${state.pathParameters['id']}')),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          retry: (retryCount, error) => null,
          overrides: [
            catalogRepositoryProvider.overrideWithValue(repository),
            brandProvider.overrideWithValue(const Brand.bundled()),
          ],
          child: MaterialApp.router(
            routerConfig: router,
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: AppTheme.light(const Brand.bundled()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(repository.pages, [1]);
      final vertical = find
          .descendant(
            of: find.byType(CustomScrollView),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.text('Product 16 with a long name'),
        400,
        scrollable: vertical,
        maxScrolls: 30,
      );
      await tester.pumpAndSettle();
      expect(repository.pages, [1, 2, 3]);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Product 16 with a long name'));
      await tester.pumpAndSettle();
      expect(find.text('Opened p16'), findsOneWidget);
    },
  );
}

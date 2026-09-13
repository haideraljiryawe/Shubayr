import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/tokens/app_radii.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/providers/product_list_controller.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_filters.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import '../../helpers/product_filters.dart';

class _Catalog extends CatalogRepositoryMock {
  _Catalog() : super(delay: Duration.zero);
  final requests = <ProductQuery>[];
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
  }) {
    requests.add(
      ProductQuery(
        text: query ?? '',
        categoryId: categoryId,
        minPrice: minPrice,
        maxPrice: maxPrice,
        onSale: onSale,
        sort: sort ?? ProductSort.newest,
      ),
    );
    return super.fetchProducts(
      query: query,
      categoryId: categoryId,
      minPrice: minPrice,
      maxPrice: maxPrice,
      onSale: onSale,
      sort: sort,
      page: page,
      perPage: perPage,
    );
  }
}

Widget _host(
  ProviderContainer container, {
  String locale = 'en',
  bool dark = false,
  double scale = 1,
  ProductQuery query = const ProductQuery(),
  String? parent,
  bool offersOnly = false,
}) => UncontrolledProviderScope(
  container: container,
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: ProductListScreen(
      initialQuery: query,
      parentCategoryId: parent,
      offersOnly: offersOnly,
    ),
  ),
);

ProviderContainer _container(_Catalog catalog) {
  final container = ProviderContainer(
    overrides: [
      catalogRepositoryProvider.overrideWithValue(catalog),
      brandProvider.overrideWithValue(const Brand.bundled()),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test(
    'filter count excludes scopes/default sort and counts a price range once',
    () {
      const query = ProductQuery(
        text: 'search',
        categoryId: 'parent',
        onSale: true,
        minPrice: 10,
        maxPrice: 20,
        sort: ProductSort.priceAsc,
      );
      expect(query.appliedFilterCount(offersOnly: false), 3);
      expect(query.appliedFilterCount(offersOnly: true), 2);
      final cleared = query.clearFilters(offersOnly: true);
      expect(
        cleared,
        const ProductQuery(text: 'search', categoryId: 'parent', onSale: true),
      );
      expect(cleared.appliedFilterCount(offersOnly: true), 0);
      expect(
        const ProductQuery(minPrice: 1).appliedFilterCount(offersOnly: false),
        1,
      );
      expect(
        const ProductQuery(maxPrice: 1).appliedFilterCount(offersOnly: false),
        1,
      );
    },
  );

  for (final direction in TextDirection.values) {
    for (final dark in [false, true]) {
      testWidgets(
        'filter badge stays inside button without covering icon $direction $dark',
        (tester) async {
          final controller = TextEditingController();
          addTearDown(controller.dispose);
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(320, 700);
          addTearDown(tester.view.reset);
          for (final scale in [1.0, 1.3, 2.0]) {
            for (final count in [0, 3, 12, 99]) {
              await tester.pumpWidget(
                MaterialApp(
                  localizationsDelegates:
                      AppLocalizations.localizationsDelegates,
                  supportedLocales: AppLocalizations.supportedLocales,
                  locale: Locale(direction == TextDirection.rtl ? 'ar' : 'en'),
                  theme: dark
                      ? AppTheme.dark(const Brand.bundled())
                      : AppTheme.light(const Brand.bundled()),
                  home: Builder(
                    builder: (context) => MediaQuery(
                      data: MediaQuery.of(
                        context,
                      ).copyWith(textScaler: TextScaler.linear(scale)),
                      child: Scaffold(
                        body: Align(
                          alignment: Alignment.topCenter,
                          child: ProductSearchBar(
                            controller: controller,
                            onChanged: (_) {},
                            onFilters: () {},
                            filterCount: count,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              final button = tester.getRect(
                find.byKey(const ValueKey('product-filter-button')),
              );
              final field = tester.getRect(
                find.byKey(const ValueKey('product-search-field')),
              );
              final icon = tester.getRect(
                find.byIcon(Icons.filter_alt_outlined),
              );
              expect(button.size, Size(kMinInteractiveDimension, field.height));
              expect(icon.center, button.center);
              expect(icon.width, greaterThan(18));
              final badgeFinder = find.byKey(
                const ValueKey('product-filter-badge'),
              );
              expect(
                tester.widget<Badge>(badgeFinder).isLabelVisible,
                count > 0,
              );
              if (count > 0) {
                final badge = tester.getRect(
                  find.byKey(const ValueKey('product-filter-badge-bounds')),
                );
                expect(
                  button.contains(badge.topLeft),
                  isTrue,
                  reason:
                      "scale=$scale count=$count button=$button badge=$badge icon=$icon",
                );
                expect(button.contains(badge.bottomRight), isTrue);
                expect(badge.overlaps(icon), isFalse);
                expect(
                  direction == TextDirection.rtl
                      ? badge.center.dx <= button.center.dx
                      : badge.center.dx >= button.center.dx,
                  isTrue,
                );
                expect(
                  find.descendant(
                    of: badgeFinder,
                    matching: find.text('$count'),
                  ),
                  findsOneWidget,
                );
              }
              expect(tester.takeException(), isNull);
            }
          }
        },
      );
    }
  }

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets(
        'mobile filter drafts apply atomically and overview removes each filter $locale $dark',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 1000);
          addTearDown(tester.view.reset);
          final repo = _Catalog();
          final container = _container(repo);
          const seed = ProductQuery(categoryId: 'cat-electronics');
          final provider = productListControllerProvider(seed);
          await tester.pumpWidget(
            _host(
              container,
              locale: locale,
              dark: dark,
              query: seed,
              parent: 'cat-electronics',
            ),
          );
          await tester.pumpAndSettle();
          final filters = find.byKey(
            const ValueKey('product-subcategory-filters'),
          );
          final field = find.byKey(const ValueKey('product-search-field'));
          final button = find.byKey(const ValueKey('product-filter-button'));
          expect(
            tester.getRect(field).bottom,
            lessThanOrEqualTo(tester.getRect(filters).top),
          );
          expect(tester.getSize(button).height, tester.getSize(field).height);
          expect(
            tester.getSize(button).width,
            greaterThanOrEqualTo(kMinInteractiveDimension),
          );
          final style = tester.widget<OutlinedButton>(button).style!;
          expect(
            (style.shape!.resolve({})! as RoundedRectangleBorder).borderRadius,
            AppRadii.controlAll,
          );
          expect(style.side!.resolve({})!.style, BorderStyle.solid);
          expect(
            find.byKey(const ValueKey('filter-sort-newest')),
            findsNothing,
          );
          expect(find.byType(FilterChip), findsNothing);
          expect(
            find.byKey(const ValueKey('product-applied-filters')),
            findsNothing,
          );
          expect(
            tester
                .widget<Badge>(
                  find.byKey(const ValueKey('product-filter-badge')),
                )
                .isLabelVisible,
            isFalse,
          );
          final calls = repo.requests.length;
          await openProductFilters(tester);
          expect(find.byType(BottomSheet), findsOneWidget);
          expect(
            find.descendant(
              of: find.byType(ProductFilterEditor),
              matching: find.byType(Divider),
            ),
            findsNWidgets(2),
          );
          final l10n = AppLocalizations.of(
            tester.element(find.byType(ProductFilterEditor)),
          );
          expect(find.text(l10n.productFiltersSort), findsOneWidget);
          expect(find.text(l10n.filterPrice), findsOneWidget);
          expect(
            find.byKey(const ValueKey('filter-offers-only')),
            findsOneWidget,
          );
          await tester.tap(
            find.byKey(const ValueKey('filter-sort-price_desc')),
          );
          await tester.enterText(
            find.byKey(const ValueKey('filter-min-price')),
            '٣٠٠٠٠',
          );
          await tester.enterText(
            find.byKey(const ValueKey('filter-max-price')),
            '۱۳۰,۰۰۰',
          );
          for (final (key, expected) in [
            ('filter-min-price', '30,000'),
            ('filter-max-price', '130,000'),
          ]) {
            expect(
              tester
                  .widget<TextField>(find.byKey(ValueKey(key)))
                  .controller!
                  .text,
              expected,
            );
          }
          final offers = find.byKey(const ValueKey('filter-offers-only'));
          await tester.ensureVisible(offers);
          await tester.pumpAndSettle();
          await tester.tap(offers);
          await tester.pumpAndSettle();
          expect(container.read(provider).query, seed);
          expect(repo.requests.length, calls);
          expect(find.byType(ProductFilterEditor), findsOneWidget);
          await applyProductFilters(tester);
          expect(repo.requests.length, calls + 1);
          expect(repo.requests.last.minPrice, 30000);
          expect(repo.requests.last.maxPrice, 130000);
          expect(
            container.read(provider).query,
            seed.copyWith(
              minPrice: 30000,
              maxPrice: 130000,
              sort: ProductSort.priceDesc,
              onSale: true,
            ),
          );
          expect(find.byType(ProductFilterEditor), findsNothing);
          expect(
            find.byKey(const ValueKey('product-applied-filters')),
            findsOneWidget,
          );
          expect(
            tester
                .getRect(find.byKey(const ValueKey('product-applied-filters')))
                .top,
            greaterThanOrEqualTo(tester.getRect(filters).bottom),
          );
          final badge = tester.widget<Badge>(
            find.byKey(const ValueKey('product-filter-badge')),
          );
          expect(badge.isLabelVisible, isTrue);
          expect((badge.label! as Text).data, '3');
          for (final (key, count) in [
            ('price', '2'),
            ('sort', '1'),
            ('offers', '0'),
          ]) {
            final chip = find.byKey(ValueKey('applied-filter-$key'));
            await tester.ensureVisible(chip);
            await tester.pumpAndSettle();
            await tester.tap(
              find.descendant(of: chip, matching: find.byIcon(Icons.clear)),
            );
            await tester.pumpAndSettle();
            expect(find.byKey(ValueKey('applied-filter-$key')), findsNothing);
            final nextBadge = tester.widget<Badge>(
              find.byKey(const ValueKey('product-filter-badge')),
            );
            expect(nextBadge.isLabelVisible, count != '0');
            if (count != '0') expect((nextBadge.label! as Text).data, count);
            expect(container.read(provider).query.categoryId, seed.categoryId);
          }
          expect(container.read(provider).query, seed);
          expect(
            find.byKey(const ValueKey('product-applied-filters')),
            findsNothing,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets('clear and dismiss preserve scopes and fixed offers $locale', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 1000);
      addTearDown(tester.view.reset);
      final repo = _Catalog();
      final container = _container(repo);
      const seed = ProductQuery(
        text: 'Yoga',
        categoryId: 'cat-sports',
        onSale: true,
        minPrice: 10000,
        sort: ProductSort.priceAsc,
      );
      final provider = productListControllerProvider(seed);
      await tester.pumpWidget(
        _host(container, locale: locale, query: seed, offersOnly: true),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('applied-filter-offers')), findsNothing);
      await openProductFilters(tester);
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('filter-min-price')))
            .controller!
            .text,
        '10,000',
      );
      expect(find.byKey(const ValueKey('filter-offers-only')), findsNothing);
      expect(
        find.descendant(
          of: find.byType(ProductFilterEditor),
          matching: find.byType(Divider),
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const ValueKey('product-filters-clear')));
      await tester.pumpAndSettle();
      expect(container.read(provider).query, seed);
      expect(
        tester
            .widget<ChoiceChip>(
              find.byKey(const ValueKey('filter-sort-newest')),
            )
            .selected,
        isTrue,
      );
      await tester.tap(find.byKey(const ValueKey('product-filters-close')));
      await tester.pumpAndSettle();
      expect(container.read(provider).query, seed);
      await openProductFilters(tester);
      await tester.tap(find.byKey(const ValueKey('product-filters-clear')));
      await applyProductFilters(tester);
      const cleared = ProductQuery(
        text: 'Yoga',
        categoryId: 'cat-sports',
        onSale: true,
      );
      expect(container.read(provider).query, cleared);
      expect(container.read(provider).items.single.id, 'p17');
      expect(
        find.byKey(const ValueKey('product-applied-filters')),
        findsNothing,
      );
      // Overview Clear all is one operation and keeps the same scopes.
      await openProductFilters(tester);
      await tester.tap(find.byKey(const ValueKey('filter-sort-rating')));
      await tester.enterText(
        find.byKey(const ValueKey('filter-max-price')),
        '30000',
      );
      await applyProductFilters(tester);
      final clear = find.byKey(const ValueKey('applied-filters-clear'));
      await tester.ensureVisible(clear);
      await tester.pumpAndSettle();
      await tester.tap(clear);
      await tester.pumpAndSettle();
      expect(container.read(provider).query, cleared);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'applied filters and empty results fit with keyboard open $locale',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(320, 700);
        tester.view.viewInsets = const FakeViewPadding(bottom: 300);
        addTearDown(tester.view.reset);
        final container = _container(_Catalog());
        const query = ProductQuery(
          text: 'missing',
          categoryId: 'cat-electronics',
          minPrice: 10000,
          sort: ProductSort.priceAsc,
        );
        await tester.pumpWidget(
          _host(
            container,
            locale: locale,
            query: query,
            parent: 'cat-electronics',
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('product-applied-filters')),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await openProductFilters(tester);
        await tester.ensureVisible(
          find.byKey(const ValueKey('filter-max-price')),
        );
        await tester.pumpAndSettle();
        await applyProductFilters(tester);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'responsive editor uses dialog on desktop and fits large text $locale',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final container = _container(_Catalog());
        for (final width in [
          320.0,
          599.0,
          600.0,
          899.0,
          900.0,
          1199.0,
          1200.0,
          1535.0,
          1536.0,
          1920.0,
        ]) {
          tester.view.physicalSize = Size(width, 900);
          await tester.pumpWidget(_host(container, locale: locale, scale: 2));
          await tester.pumpAndSettle();
          await openProductFilters(tester);
          expect(
            find.byType(Dialog),
            width >= 900 ? findsOneWidget : findsNothing,
          );
          expect(
            find.byType(BottomSheet),
            width < 900 ? findsOneWidget : findsNothing,
          );
          expect(
            find.descendant(
              of: find.byType(ProductFilterEditor),
              matching: find.byType(Divider),
            ),
            findsNWidgets(2),
          );
          final target = find.byKey(const ValueKey('filter-max-price'));
          await tester.ensureVisible(target);
          await tester.pumpAndSettle();
          await tester.enterText(target, '50000');
          await applyProductFilters(tester);
          expect(
            find.byKey(const ValueKey('applied-filter-price')),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull, reason: '$width');
        }
      },
    );
  }
}

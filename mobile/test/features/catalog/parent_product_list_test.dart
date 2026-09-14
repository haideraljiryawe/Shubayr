import '../../helpers/product_filters.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_colors.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:shubayr/core/widgets/state_views.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/providers/product_list_controller.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';

const _initial = ProductQuery(categoryId: 'cat-electronics');
final _provider = productListControllerProvider(_initial);

Widget _host(
  ProviderContainer container, {
  String locale = 'en',
  Brightness brightness = Brightness.light,
  double scale = 1,
  Widget? home,
}) => UncontrolledProviderScope(
  container: container,
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: AppTheme.fromColors(AppColors.bundled(brightness)),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home:
        home ??
        const ProductListScreen(
          initialQuery: _initial,
          parentCategoryId: 'cat-electronics',
        ),
  ),
);

ProviderContainer _container() {
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      brandProvider.overrideWithValue(const Brand.bundled()),
      catalogRepositoryProvider.overrideWithValue(
        CatalogRepositoryMock(delay: Duration.zero),
      ),
      homeBannersProvider.overrideWith((ref) async => []),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  for (final locale in ['ar', 'en']) {
    for (final brightness in Brightness.values) {
      testWidgets(
        'parent filters combine search, price, sort and sale $locale $brightness',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 1100);
          addTearDown(tester.view.reset);
          final container = _container();
          await tester.pumpWidget(
            _host(container, locale: locale, brightness: brightness),
          );
          await tester.pumpAndSettle();
          final l10n = AppLocalizations.of(
            tester.element(find.byType(ProductListScreen)),
          );
          ProductListState state() => container.read(_provider);
          List<String> ids() => state().items.map((p) => p.id).toList();
          Finder category(String id) =>
              find.byKey(ValueKey('product-category-$id'));
          Future<void> select(String id) async {
            await tester.ensureVisible(category(id));
            await tester.pumpAndSettle();
            await tester.tap(category(id));
            await tester.pumpAndSettle();
          }

          Future<void> search(String text) async {
            await tester.enterText(find.byType(TextField), text);
            await tester.pump(const Duration(milliseconds: 400));
            await tester.pumpAndSettle();
          }

          expect(ids(), ['p1', 'p2', 'p3', 'p12']);
          expect(
            tester.widget<ChoiceChip>(category('cat-electronics')).selected,
            isTrue,
          );
          final title = find.text(
            locale == 'ar' ? 'إلكترونيات' : 'Electronics',
          );
          final filters = find.byKey(
            const ValueKey('product-subcategory-filters'),
          );
          expect(
            tester.getRect(title).bottom,
            lessThan(tester.getRect(filters).top),
          );
          expect(
            tester.getRect(find.byType(TextField)).bottom,
            lessThanOrEqualTo(tester.getRect(filters).top),
          );
          final allRect = tester.getRect(category('cat-electronics'));
          final phonesRect = tester.getRect(category('cat-phones'));
          expect(
            locale == 'ar'
                ? allRect.left > phonesRect.left
                : allRect.left < phonesRect.left,
            isTrue,
          );
          await search('Coffee');
          expect(ids(), isEmpty);
          expect(find.byType(AppEmptyView), findsOneWidget);
          expect(state().error, isNull);
          await search('s');
          expect(ids(), ['p1', 'p2', 'p12']);
          await select('cat-audio');
          expect(ids(), ['p1', 'p12']);
          expect(state().query.text, 's');
          expect(find.byType(ProductListScreen), findsOneWidget);
          expect(title, findsOneWidget); // Parent title stays fixed.
          await search('Coffee');
          expect(ids(), isEmpty);
          await search('s');
          await tester.tap(find.byTooltip(l10n.filtersTitle));
          await tester.pumpAndSettle();
          Finder price(String label) => find.byWidgetPredicate(
            (w) => w is TextField && w.decoration?.labelText == label,
          );
          await tester.enterText(price(l10n.filterMin), '40000');
          await tester.enterText(price(l10n.filterMax), '130000');
          await applyProductFilters(tester);
          await chooseProductSort(tester, ProductSort.priceDesc);
          expect(ids(), ['p12', 'p1']);
          await toggleProductOffers(tester);
          expect(ids(), ['p1']);
          await select('cat-electronics');
          expect(ids(), ['p2', 'p1']);
          expect(
            state().query,
            const ProductQuery(
              categoryId: 'cat-electronics',
              text: 's',
              minPrice: 40000,
              maxPrice: 130000,
              onSale: true,
              sort: ProductSort.priceDesc,
            ),
          );
          // Switching before debounce expires must use the latest visible text.
          await tester.enterText(find.byType(TextField), 'Watch');
          await tester.ensureVisible(category('cat-audio'));
          await tester.tap(category('cat-audio'));
          await tester.pump(const Duration(milliseconds: 400));
          await tester.pumpAndSettle();
          expect(state().query.text, 'Watch');
          expect(state().query.categoryId, 'cat-audio');
          expect(ids(), isEmpty);
          expect(find.byType(AppEmptyView), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      'Home shortcuts and scoped list resize with large text $locale',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final container = _container();
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
          tester.view.physicalSize = Size(width, 1000);
          await tester.pumpWidget(
            _host(
              container,
              locale: locale,
              scale: 2,
              home: const HomeScreen(),
            ),
          );
          await tester.pumpAndSettle();
          final shortcut = find.byKey(const ValueKey('home-category-cat-home'));
          await tester.ensureVisible(shortcut);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: 'Home $width');
          await tester.pumpWidget(_host(container, locale: locale, scale: 2));
          await tester.pumpAndSettle();
          final filters = find.byKey(
            const ValueKey('product-subcategory-filters'),
          );
          expect(filters, findsOneWidget);
          await tester.ensureVisible(
            find.byKey(const ValueKey('product-category-cat-accessories')),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: 'Product List $width');
          await tester.pumpWidget(
            _host(
              container,
              locale: locale,
              scale: 2,
              home: const ProductListScreen(offersOnly: true),
            ),
          );
          await tester.pumpAndSettle();
          await tester.ensureVisible(
            find.byKey(const ValueKey('product-category-cat-sports')),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: 'Offers $width');
        }
      },
    );
  }

  testWidgets(
    'empty scoped search remains usable with the phone keyboard open',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 700);
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      addTearDown(tester.view.reset);
      final container = _container();
      await tester.pumpWidget(_host(container));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Coffee');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.byType(AppEmptyView), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('category-tab leaf listing shares the titled search header', (
    tester,
  ) async {
    final container = _container();
    await tester.pumpWidget(
      _host(
        container,
        home: const ProductListScreen(
          initialQuery: ProductQuery(categoryId: 'cat-audio'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('product-subcategory-filters')),
      findsNothing,
    );
    expect(
      find.descendant(
        of: find.byType(AppBar),
        matching: find.byType(TextField),
      ),
      findsNothing,
    );
    expect(find.byKey(const ValueKey('product-search-field')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

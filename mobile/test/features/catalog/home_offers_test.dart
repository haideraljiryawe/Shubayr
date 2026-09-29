import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import '../../helpers/product_filters.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/theme_context.dart';
import 'package:shubayr/core/theme/theme_mode_controller.dart';
import 'package:shubayr/core/widgets/state_views.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/providers/product_list_controller.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/features/catalog/presentation/widgets/home_offers_list.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_card.dart';

Future<ProviderContainer> _container({
  String locale = 'en',
  ThemeMode mode = ThemeMode.light,
  Future<ProductPage> Function()? loadOffers,
  Future<List<Category>> Function()? loadCategories,
}) async {
  SharedPreferences.setMockInitialValues({});
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      notificationSyncProvider.overrideWith((ref) {}),
      unreadCountProvider.overrideWith((ref) async => 0),
      dataSourceProvider.overrideWithValue(DataSource.mock),
      if (loadCategories != null)
        categoriesProvider.overrideWith((ref) => loadCategories()),
      if (loadOffers != null)
        homeOffersProvider.overrideWith((ref) => loadOffers()),
      prefsStoreProvider.overrideWithValue(
        PrefsStore(await SharedPreferences.getInstance()),
      ),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      homeBannersProvider.overrideWith((ref) async => []),
      catalogRepositoryProvider.overrideWithValue(
        CatalogRepositoryMock(delay: Duration.zero),
      ),
    ],
  );
  addTearDown(container.dispose);
  await container
      .read(localeControllerProvider.notifier)
      .setLocale(Locale(locale));
  await container.read(themeModeControllerProvider.notifier).setMode(mode);
  return container;
}

Finder _horizontalIn(Finder root) =>
    find.descendant(of: root, matching: find.byType(Scrollable)).first;
const _offers = ProductQuery(onSale: true);

void main() {
  test(
    'mock adds two complete departments with mixed prices and offer category discovery',
    () async {
      final repository = CatalogRepositoryMock(delay: Duration.zero);
      final tree = await repository.fetchCategories();
      expect(tree.length, 6);
      for (final id in ['cat-beauty', 'cat-sports']) {
        final parent = tree.singleWhere((c) => c.id == id);
        expect(parent.children.length, 3);
        expect(parent.children.every((c) => c.parentId == id), isTrue);
        final page = await repository.fetchProducts(categoryId: id);
        expect(page.total, 4);
        expect(page.data.any((p) => p.isOnSale), isTrue);
        expect(page.data.any((p) => !p.isOnSale), isTrue);
        expect(
          page.data.every(
            (p) =>
                p.salePrice > 0 &&
                parent.children.any((c) => c.id == p.categoryId),
          ),
          isTrue,
        );
      }
      final container = ProviderContainer(
        overrides: [
          notificationSyncProvider.overrideWith((ref) {}),
          unreadCountProvider.overrideWith((ref) async => 0),
          dataSourceProvider.overrideWithValue(DataSource.mock),
          catalogRepositoryProvider.overrideWithValue(repository),
          categoriesProvider.overrideWith(
            (ref) async => [
              ...tree,
              const Category(
                id: 'no-offers',
                nameEn: 'No offers',
                nameAr: 'بلا عروض',
              ),
            ],
          ),
        ],
      );
      addTearDown(container.dispose);
      final offered = await container.read(offerCategoriesProvider.future);
      expect(offered.map((c) => c.id), tree.map((c) => c.id));
      final preview = await container.read(homeOffersProvider.future);
      expect(preview.data.length, 8);
      expect(preview.total, 14);
      expect(preview.data.every((p) => p.isOnSale), isTrue);
    },
  );

  for (final locale in ['ar', 'en']) {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      testWidgets(
        'Home manual offers and filled shortcuts navigate to all offers $locale $mode',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 1100);
          addTearDown(tester.view.reset);
          final container = await _container(locale: locale, mode: mode);
          await tester.pumpWidget(
            UncontrolledProviderScope(
              container: container,
              child: const ShubayrApp(),
            ),
          );
          await tester.pumpAndSettle();
          final l10n = AppLocalizations.of(
            tester.element(find.byType(HomeScreen)),
          );
          expect(find.text(l10n.homeSectionProducts), findsNothing);
          expect(find.text(l10n.homeOffersTitle), findsOneWidget);
          final shortcuts = find.byKey(
            const ValueKey('home-category-shortcuts'),
          );
          final shortcutScroll = tester.state<ScrollableState>(
            _horizontalIn(shortcuts),
          );
          expect(shortcutScroll.position.maxScrollExtent, greaterThan(0));
          for (final (id, glyph) in [
            ('cat-electronics', Icons.devices),
            ('cat-grocery', Icons.shopping_basket),
            ('cat-clothing', Icons.checkroom),
            // The fixture now uses the explicit home_furniture semantic key.
            ('cat-home', Icons.weekend),
            ('cat-beauty', Icons.spa),
            ('cat-sports', Icons.fitness_center),
          ]) {
            final shortcut = find.byKey(ValueKey('home-category-$id'));
            final icon = tester.widget<Icon>(
              find.descendant(of: shortcut, matching: find.byType(Icon)),
            );
            expect(icon.icon, glyph);
            final circle = tester.widget<Container>(
              find.descendant(of: shortcut, matching: find.byType(Container)),
            );
            final colors = tester.element(shortcut).colors;
            final decoration = circle.decoration! as BoxDecoration;
            expect(decoration.color, colors.categoryShortcutBackground);
            expect(decoration.color, isNot(colors.primarySoft));
            expect(decoration.border, isNull);
            expect(decoration.shape, BoxShape.circle);
            expect(circle.constraints!.maxWidth, 56);
            if (mode == ThemeMode.light) {
              expect(
                colors.categoryShortcutBackground.computeLuminance(),
                lessThan(colors.primarySoft.computeLuminance()),
              );
            }
          }
          await tester.drag(shortcuts, Offset(locale == 'ar' ? 260 : -260, 0));
          await tester.pumpAndSettle();
          expect(shortcutScroll.position.pixels, greaterThan(0));
          final last = find.byKey(const ValueKey('home-category-cat-sports'));
          await tester.ensureVisible(last);
          await tester.pumpAndSettle();
          final list = find.byType(HomeOffersList);
          final cards = find.descendant(
            of: list,
            matching: find.byType(ProductCard),
          );
          expect(
            tester
                .widgetList<ProductCard>(cards)
                .every((c) => c.product.isOnSale),
            isTrue,
          );
          expect(
            find.descendant(of: list, matching: find.byType(PageView)),
            findsNothing,
          );
          final firstRect = tester.getRect(cards.first);
          final nextRect = tester.getRect(cards.at(1));
          expect(firstRect.top, nextRect.top);
          expect(
            locale == 'ar'
                ? firstRect.left > nextRect.left
                : firstRect.left < nextRect.left,
            isTrue,
          );
          final scroll = tester.state<ScrollableState>(_horizontalIn(list));
          expect(scroll.position.axis, Axis.horizontal);
          expect(scroll.position.maxScrollExtent, greaterThan(0));
          final initialOffset = scroll.position.pixels;
          await tester.pump(const Duration(seconds: 10));
          expect(scroll.position.pixels, initialOffset);
          await tester.drag(list, Offset(locale == 'ar' ? 240 : -240, 0));
          await tester.pumpAndSettle();
          expect(scroll.position.pixels, greaterThan(initialOffset));
          final title = tester.getRect(find.text(l10n.homeOffersTitle));
          final action = tester.getRect(
            find.byKey(const ValueKey('home-offers-view-all')),
          );
          expect(
            locale == 'ar'
                ? title.left > action.right
                : title.right < action.left,
            isTrue,
          );
          await tester.tap(find.byKey(const ValueKey('home-offers-view-all')));
          await tester.pumpAndSettle();
          final screen = tester.widget<ProductListScreen>(
            find.byType(ProductListScreen),
          );
          expect(screen.offersOnly, isTrue);
          expect(screen.initialQuery.onSale, isTrue);
          expect(find.text(l10n.homeOffersTitle), findsOneWidget);
          expect(
            find.widgetWithText(FilterChip, l10n.filterOnSale),
            findsNothing,
          );
          final all = find.byKey(const ValueKey('product-category-all'));
          expect(tester.widget<ChoiceChip>(all).selected, isTrue);
          for (final id in ['cat-beauty', 'cat-sports']) {
            expect(
              find.byKey(ValueKey('product-category-$id')),
              findsOneWidget,
            );
          }
          final lastProduct = find.text(
            locale == 'ar'
                ? 'خوذة دراجة قابلة للتعديل'
                : 'Adjustable Cycling Helmet',
          );
          await tester.scrollUntilVisible(
            lastProduct,
            400,
            scrollable: find
                .descendant(
                  of: find.byType(CustomScrollView),
                  matching: find.byType(Scrollable),
                )
                .first,
            maxScrolls: 30,
          );
          await tester.pumpAndSettle();
          final state = container.read(productListControllerProvider(_offers));
          expect(state.items.length, 14);
          expect(state.items.every((p) => p.isOnSale), isTrue);
          expect(state.hasMore, isFalse);
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      'offer category, search, prices and sort stay within discount scope $locale',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 1000);
        addTearDown(tester.view.reset);
        final container = await _container(locale: locale);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const ShubayrApp(),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('home-offers-view-all')));
        await tester.pumpAndSettle();
        final router = container.read(routerProvider);
        final route = router.routeInformationProvider.value.uri;
        final l10n = AppLocalizations.of(
          tester.element(find.byType(ProductListScreen)),
        );
        ProductListState state() =>
            container.read(productListControllerProvider(_offers));
        List<String> ids() => state().items.map((p) => p.id).toList();
        Future<void> choose(String id) async {
          final chip = find.byKey(ValueKey('product-category-$id'));
          await tester.ensureVisible(chip);
          await tester.pumpAndSettle();
          await tester.tap(chip);
          await tester.pumpAndSettle();
          expect(router.routeInformationProvider.value.uri, route);
          expect(state().query.onSale, isTrue);
        }

        Future<void> search(String value) async {
          await tester.enterText(find.byType(TextField), value);
          await tester.pump(const Duration(milliseconds: 400));
          await tester.pumpAndSettle();
        }

        await choose('cat-beauty');
        expect(ids(), ['p13', 'p15']);
        await search('Cream'); // Present in this category, but not discounted.
        expect(ids(), isEmpty);
        expect(find.byType(AppEmptyView), findsOneWidget);
        await search('Coffee'); // Discounted elsewhere, outside this category.
        expect(ids(), isEmpty);
        await search('');
        await tester.tap(find.byTooltip(l10n.filtersTitle));
        await tester.pumpAndSettle();
        Finder price(String label) => find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == label,
        );
        await tester.enterText(price(l10n.filterMin), '10000');
        await tester.enterText(price(l10n.filterMax), '30000');
        await applyProductFilters(tester);
        expect(ids(), ['p13']);
        await chooseProductSort(tester, ProductSort.priceDesc);
        await choose('cat-sports');
        expect(ids(), ['p20', 'p19', 'p17']);
        expect(state().query.minPrice, 10000);
        expect(state().query.maxPrice, 30000);
        expect(state().query.sort, ProductSort.priceDesc);
        await search('Yoga');
        expect(ids(), ['p17']);
        await choose('all');
        expect(ids(), ['p17']);
        expect(state().query.categoryId, isNull);
        expect(state().query.text, 'Yoga');
        expect(state().query.onSale, isTrue);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('offer category discovery can retry a failed category tree', (
    tester,
  ) async {
    var attempts = 0;
    final repository = CatalogRepositoryMock(delay: Duration.zero);
    final container = await _container(
      loadCategories: () async {
        if (++attempts == 1) throw StateError('offline');
        return repository.fetchCategories();
      },
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const ProductListScreen(offersOnly: true),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byKey(const ValueKey('product-category-all')), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('product-category-all')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('product-category-cat-sports')),
      findsOneWidget,
    );
    expect(
      container.read(productListControllerProvider(_offers)).query.onSale,
      isTrue,
    );
    expect(attempts, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Home offers retain loading, error, retry and empty states', (
    tester,
  ) async {
    final pending = Completer<ProductPage>();
    var calls = 0;
    final container = await _container(
      loadOffers: () =>
          ++calls == 1 ? pending.future : Future.value(const ProductPage()),
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const HomeScreen(),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(ProductCardSkeleton), findsWidgets);
    pending.completeError(StateError('offline'));
    await tester.pumpAndSettle();
    expect(find.byType(AppErrorView), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.byType(AppEmptyView), findsOneWidget);
    expect(find.byType(ProductCard), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

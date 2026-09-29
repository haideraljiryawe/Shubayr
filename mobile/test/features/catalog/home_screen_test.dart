import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:flutter/material.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/theme/tokens/app_typography.dart';
import 'package:shubayr/core/theme/theme_context.dart';
import 'package:shubayr/core/theme/theme_mode_controller.dart';
import 'package:shubayr/features/catalog/presentation/screens/subcategories_screen.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/banners/data/home_banner.dart';
import 'package:shubayr/features/banners/presentation/widgets/home_banners.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
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
    compareAtPrice: 12000,
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
    final data = all
        .where(
          (p) =>
              (categoryId == null || p.categoryId == categoryId) &&
              (!onSale || p.isOnSale),
        )
        .toList();
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
    retry: (retryCount, error) => null,
    overrides: [
      notificationSyncProvider.overrideWith((ref) {}),
      unreadCountProvider.overrideWith((ref) async => 0),
      dataSourceProvider.overrideWithValue(DataSource.mock),
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      catalogRepositoryProvider.overrideWithValue(_FakeCatalog()),
      homeBannersProvider.overrideWith(
        (ref) async => const [
          HomeBanner(
            id: 'test-banner',
            title: 'بانر المتجر Store banner',
            imageUrl: '',
          ),
        ],
      ),
    ],
  );
}

void main() {
  for (final lang in ['ar', 'en']) {
    testWidgets(
      'Home identity follows $lang direction and search still opens the product search',
      (tester) async {
        addTearDown(tester.view.reset);
        final container = await _container();
        addTearDown(container.dispose);
        await container
            .read(localeControllerProvider.notifier)
            .setLocale(Locale(lang));
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const ShubayrApp(),
          ),
        );
        await tester.pumpAndSettle();
        for (final width in [320.0, 390.0, 1920.0]) {
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          await tester.pumpAndSettle();
          final header = find.byType(AppBar);
          final name = find.descendant(
            of: header,
            matching: find.text(lang == 'ar' ? 'شُبَيّر' : 'Shubayr'),
          );
          final logo = find.descendant(
            of: header,
            matching: find.byType(Image),
          );
          final search = find.descendant(
            of: header,
            matching: find.byIcon(Icons.search),
          );
          expect(name, findsOneWidget);
          expect(tester.getSize(logo), const Size(32, 32));
          expect(tester.widget<Image>(logo).fit, BoxFit.contain);
          expect(tester.getSize(header).height, kToolbarHeight);
          final nameRect = tester.getRect(name);
          final logoRect = tester.getRect(logo);
          final searchRect = tester.getRect(search);
          expect(searchRect.size, const Size(28, 28));
          final title = find.text(
            lang == 'ar' ? 'عروض وخصومات' : 'Offers & Discounts',
          );
          expect(title, findsOneWidget);
          final padding = find
              .ancestor(of: title, matching: find.byType(Padding))
              .first;
          expect(
            tester
                .widget<Padding>(padding)
                .padding
                .resolve(Directionality.of(tester.element(title))),
            EdgeInsets.symmetric(
              horizontal: width < 600
                  ? AppSpacing.screenMobileH
                  : AppSpacing.screenH,
              vertical: AppSpacing.sm,
            ),
          );
          expect(
            tester.getRect(title).center.dy,
            closeTo(tester.getRect(padding).center.dy, 0.01),
          );
          if (lang == 'ar') {
            expect(logoRect.left, greaterThan(nameRect.right));
            expect(searchRect.right, lessThan(nameRect.left));
          } else {
            expect(logoRect.right, lessThan(nameRect.left));
            expect(searchRect.left, greaterThan(nameRect.right));
          }
          expect(
            tester.widget<Text>(name).style!.fontFamily,
            AppTypography.homeBrandFontFamily,
          );
          expect(
            Theme.of(tester.element(name)).textTheme.titleLarge!.fontFamily,
            'Cairo',
          );
          expect(tester.takeException(), isNull);
        }
        await tester.tap(find.byIcon(Icons.search));
        await tester.pumpAndSettle();
        expect(find.byType(ProductListScreen), findsOneWidget);
        expect(find.text(lang == 'ar' ? 'شُبَيّر' : 'Shubayr'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final lang in ['ar', 'en']) {
    testWidgets(
      'banner, offers and search use the central mobile inset inside the safe area $lang',
      (tester) async {
        addTearDown(tester.view.reset);
        final container = await _container();
        addTearDown(container.dispose);
        await container
            .read(localeControllerProvider.notifier)
            .setLocale(Locale(lang));
        for (final (width, safeStart, safeEnd) in [
          (320.0, 0.0, 0.0),
          (390.0, 0.0, 0.0),
          (599.0, 0.0, 0.0),
          (390.0, 24.0, 8.0),
        ]) {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = Size(width, 1200);
          tester.view.padding = FakeViewPadding(
            left: safeStart,
            right: safeEnd,
          );
          await tester.pumpWidget(
            UncontrolledProviderScope(
              container: container,
              child: const ShubayrApp(),
            ),
          );
          await tester.pumpAndSettle();
          final banner = tester.getRect(
            find.byKey(const ValueKey('banner-page-0')),
          );
          final card = tester.getRect(find.byType(ProductCard).first);
          expect(banner.left, safeStart + AppSpacing.screenMobileH);
          expect(width - banner.right, safeEnd + AppSpacing.screenMobileH);
          expect(
            lang == 'ar' ? card.right : card.left,
            lang == 'ar' ? banner.right : banner.left,
          );
          expect(
            card.width,
            AppLayout.homeOfferCardWidth(
              tester.element(find.byType(HomeScreen)),
              width - safeStart - safeEnd - AppSpacing.screenMobileH * 2,
            ),
          );
          container.read(routerProvider).pushNamed(AppRoutes.searchName);
          await tester.pumpAndSettle();
          final searchCards = find.byType(ProductCard);
          final searchGrid = tester
              .getRect(searchCards.first)
              .expandToInclude(tester.getRect(searchCards.at(1)));
          expect(searchGrid.left, banner.left);
          expect(searchGrid.right, banner.right);
          container.read(routerProvider).pop();
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
      },
    );
  }

  for (final locale in ['ar', 'en']) {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      testWidgets(
        'Home shortcuts navigate without filtering the feed $locale $mode',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 1000);
          addTearDown(tester.view.reset);
          final container = await _container();
          addTearDown(container.dispose);
          await container
              .read(localeControllerProvider.notifier)
              .setLocale(Locale(locale));
          await container
              .read(themeModeControllerProvider.notifier)
              .setMode(mode);
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
          expect(find.text(l10n.homeSectionDepartments), findsNothing);
          final shortcuts = find.byKey(
            const ValueKey('home-category-shortcuts'),
          );
          expect(
            tester.getRect(shortcuts).top -
                tester.getRect(find.byType(HomeBanners)).bottom,
            AppSpacing.homeBannerToCategories,
          );

          expect(
            find.descendant(of: shortcuts, matching: find.byType(ChoiceChip)),
            findsNothing,
          );
          expect(
            find.descendant(of: shortcuts, matching: find.byIcon(Icons.check)),
            findsNothing,
          );
          expect(
            find.descendant(
              of: shortcuts,
              matching: find.text(l10n.homeAllDepartments),
            ),
            findsNothing,
          );
          final first = find.byKey(const ValueKey('home-category-c1'));
          final second = find.byKey(const ValueKey('home-category-c2'));
          final circle = find.descendant(
            of: first,
            matching: find.byWidgetPredicate(
              (w) =>
                  w is Container &&
                  w.decoration is BoxDecoration &&
                  (w.decoration! as BoxDecoration).shape == BoxShape.circle,
            ),
          );
          final decoration =
              tester.widget<Container>(circle).decoration! as BoxDecoration;
          expect(
            decoration.color,
            tester.element(first).colors.categoryShortcutBackground,
          );
          expect(decoration.border, isNull);
          expect(tester.getSize(circle).width, tester.getSize(circle).height);
          final label = find.descendant(of: first, matching: find.byType(Text));
          expect(
            tester.getRect(label).top,
            greaterThan(tester.getRect(circle).bottom),
          );
          expect(
            locale == 'ar'
                ? tester.getRect(first).left > tester.getRect(second).left
                : tester.getRect(first).left < tester.getRect(second).left,
            isTrue,
          );
          final icon = tester.widget<Icon>(
            find.descendant(of: first, matching: find.byType(Icon)),
          );
          expect(icon.color, tester.element(first).colors.primary);
          await tester.tap(first);
          await tester.pumpAndSettle();
          expect(find.byType(SubcategoriesScreen), findsNothing);
          final page = tester.widget<ProductListScreen>(
            find.byType(ProductListScreen),
          );
          expect(page.parentCategoryId, 'c1');
          expect(page.initialQuery.categoryId, 'c1');
          expect(find.byType(ProductCard), findsOneWidget);
          expect(
            find.text(locale == 'ar' ? 'قسم أول' : 'Cat One'),
            findsOneWidget,
          );
          expect(
            find.byKey(const ValueKey('product-subcategory-filters')),
            findsNothing,
          );
          container.read(routerProvider).pop();
          await tester.pumpAndSettle();
          expect(find.byType(HomeScreen), findsOneWidget);
          expect(
            container.read(homeOffersProvider).requireValue.data.length,
            1,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('home lists products and opens product detail', (tester) async {
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
    await tester.scrollUntilVisible(
      find.text('منتج أول'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.byType(ProductCard), findsOneWidget);
    expect(find.text('منتج أول'), findsOneWidget); // Arabic-first name

    await tester.ensureVisible(find.byType(ProductCard).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byType(ProductCard).first);
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byType(ProductDetailScreen), findsOneWidget);
  }, timeout: const Timeout(Duration(seconds: 30)));
}

import 'package:flutter/material.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/theme/tokens/app_typography.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/banners/data/home_banner.dart';
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
          final title = find.text(lang == 'ar' ? 'المنتجات' : 'Products');
          expect(title, findsOneWidget);
          final padding = find
              .ancestor(of: title, matching: find.byType(Padding))
              .first;
          expect(
            tester.widget<Padding>(padding).padding,
            const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenH,
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

  testWidgets(
    'home omits the department heading and category selection still filters products',
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
      final l10n = AppLocalizations.of(tester.element(find.byType(HomeScreen)));
      expect(find.text(l10n.homeSectionDepartments), findsNothing);
      final banner = tester.getRect(
        find.byKey(const ValueKey('banner-page-0')),
      );
      final chip = find.widgetWithText(ChoiceChip, 'قسم أول');
      expect(tester.getRect(chip).top - banner.bottom, inInclusiveRange(8, 24));
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(tester.widget<ChoiceChip>(chip).selected, isTrue);
      await tester.scrollUntilVisible(
        find.text('منتج أول'),
        100,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.byType(ProductCard), findsOneWidget);
      expect(find.text('منتج ثانٍ'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

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
      await tester.scrollUntilVisible(
        find.text('منتج أول'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.byType(ProductCard), findsNWidgets(2));
      expect(find.text('منتج أول'), findsOneWidget); // Arabic-first name

      await tester.ensureVisible(find.byType(ProductCard).first);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(ProductCard).first);
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(ProductDetailScreen), findsOneWidget);
    },
    timeout: const Timeout(Duration(seconds: 30)),
  );
}

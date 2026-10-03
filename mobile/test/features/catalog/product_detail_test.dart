import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
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

import '../../helpers/test_session.dart';

/// A product with three variants (S=low stock, M=in stock, L=sold out) and no
/// images, so the detail screen never touches the network.
class _FakeCatalog implements CatalogRepository {
  _FakeCatalog({
    this.promotion = false,
    this.authoritative = false,
    this.simple = false,
    this.fractional = false,
    this.whole = false,
  });
  final bool fractional, whole;
  final bool promotion;
  final bool authoritative;
  final bool simple;
  static const _product = Product(
    id: 'v1',
    categoryId: 'c',
    nameEn: 'Tee',
    nameAr: 'قميص',
    salePrice: 10000,
    availableQty: 13,
    variants: [
      ProductVariant(
        effectivePrice: 10000,
        id: 'v1-s',
        sku: 'S',
        attributes: {'size': 'S'},
      ),
      ProductVariant(
        id: 'v1-m',
        sku: 'M',
        attributes: {'size': 'M'},
        priceDelta: 5000,
        effectivePrice: 15000,
      ),
      ProductVariant(
        id: 'v1-l',
        sku: 'L',
        attributes: {'size': 'L'},
        priceDelta: 2000,
        effectivePrice: 12000,
      ),
    ],
  );

  @override
  Future<Product> fetchProduct(String id) async => simple
      ? Product.fromJson({
          ..._product.toJson(),
          'variants': [],
          if (promotion) ...{
            'price': 20000,
            'on_sale': true,
            'discounted_price': 10000,
            'effective_price': 10000,
            'discount_percent': 50,
          },
        })
      : authoritative
      ? Product.fromJson({
          ..._product.toJson(),
          'variants': [
            {
              'id': 'v1-s',
              'sku': 'S',
              'attributes': {'size': 'S'},
              'price_delta': 0,
              'effective_price': 7000,
            },
            {
              'id': 'v1-m',
              'sku': 'M',
              'attributes': {'size': 'M'},
              'price_delta': 5000,
              'effective_price': 17000,
            },
          ],
        })
      : fractional
      ? Product.fromJson({
          ..._product.toJson(),
          'available_qty': 0.5,
          'variants': [
            {
              'id': 'v1-s',
              'effective_price': 10000,
              'sku': 'S',
              'whole_units_only': whole,
              'base_unit': 'kg',
              'available_qty': 0.5,
              'in_stock': true,
            },
            {
              'id': 'v1-m',
              'effective_price': 15000,
              'sku': 'M',
              'whole_units_only': true,
              'available_qty': 3,
              'in_stock': true,
            },
          ],
        })
      : promotion
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
  Future<ProductAvailability> fetchAvailability(String id) async => fractional
      ? ProductAvailability.fromJson({
          'product_id': 'v1',
          'in_stock': true,
          'available_qty': 3.5,
          'variants': [
            {
              'variant_id': 'v1-s',
              'available_qty': 0.5,
              'in_stock': true,
              'whole_units_only': whole,
              'base_unit': 'kg',
            },
            {
              'variant_id': 'v1-m',
              'available_qty': 3,
              'in_stock': true,
              'whole_units_only': true,
            },
          ],
        })
      : const ProductAvailability(
          productId: 'v1',
          inStock: true,
          availableQty: 13,
          variants: [
            VariantAvailability(
              variantId: 'v1-s',
              availableQty: 3,
              inStock: true,
            ),
            VariantAvailability(
              variantId: 'v1-m',
              availableQty: 10,
              inStock: true,
            ),
            VariantAvailability(
              variantId: 'v1-l',
              availableQty: 0,
              inStock: false,
            ),
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

class _PendingCart extends CartRepositoryMock {
  final result = Completer<Cart>();
  @override
  Future<Cart> fetchCart() async => const Cart(id: 'valid');
  @override
  Future<Cart> addItem({
    required String productId,
    String? variantId,
    num quantity = 1,
  }) => result.future;
}

Widget _host({
  bool simple = false,
  bool authoritative = false,
  bool promotion = false,
  bool fractional = false,
  bool whole = false,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    catalogRepositoryProvider.overrideWithValue(
      _FakeCatalog(
        simple: simple,
        authoritative: authoritative,
        promotion: promotion,
        fractional: fractional,
        whole: whole,
      ),
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

  for (final promotion in [false, true]) {
    testWidgets('simple product displays server price (sale: $promotion)', (
      tester,
    ) async {
      sizePhone(tester);
      await tester.pumpWidget(_host(simple: true, promotion: promotion));
      await tester.pumpAndSettle();
      expect(find.textContaining('10,000'), findsOneWidget);
      expect(find.text('50% off'), promotion ? findsOneWidget : findsNothing);
      expect(
        find.textContaining('20,000'),
        promotion ? findsOneWidget : findsNothing,
      );
      expect(find.text('Base product offer'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'each selected SKU uses its server effective price, not base plus delta',
    (tester) async {
      sizePhone(tester);
      await tester.pumpWidget(_host(authoritative: true));
      await tester.pumpAndSettle();
      expect(find.textContaining('7,000'), findsOneWidget);
      expect(find.textContaining('10,000'), findsNothing);
      await tester.tap(find.text('M'));
      await tester
          .pump(); // The first rendered frame must already own M's price.
      expect(find.textContaining('17,000'), findsOneWidget);
      expect(find.textContaining('15,000'), findsNothing);
      expect(find.textContaining('IQD7,000'), findsNothing);
      expect(find.textContaining('null'), findsNothing);
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'fractional SKU stock enables .5, editable .125, and whole variant resets selection',
    (tester) async {
      sizePhone(tester);
      await tester.pumpWidget(_host(fractional: true));
      await tester.pumpAndSettle();
      expect(find.text('Only 0.5 left'), findsOneWidget);
      expect(find.text('0.5'), findsOneWidget);
      final addButton = find.widgetWithText(ElevatedButton, 'Add to cart');
      expect(tester.widget<ElevatedButton>(addButton).onPressed, isNotNull);
      await tester.ensureVisible(find.text('0.5'));
      await tester.tap(find.text('0.5'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '0.125');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('0.125'), findsOneWidget);
      await tester.ensureVisible(find.text('M'));
      await tester.tap(find.text('M'));
      await tester.pumpAndSettle();
      expect(find.text('1'), findsOneWidget);
      expect(find.text('0.125'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('a whole-unit SKU with only .5 in stock cannot be added', (
    tester,
  ) async {
    sizePhone(tester);
    await tester.pumpWidget(_host(fractional: true, whole: true));
    await tester.pumpAndSettle();
    expect(
      tester.widget<ElevatedButton>(find.byType(ElevatedButton).last).onPressed,
      isNull,
    );
    expect(find.text('0.5'), findsNothing);
  });

  for (final switchSession in [false, true]) {
    testWidgets(
      'add action reports its own failure, not global cart state (switch: $switchSession)',
      (tester) async {
        sizePhone(tester);
        final repository = _PendingCart();
        final container = ProviderContainer(
          retry: (_, _) => null,
          overrides: [
            dataSourceProvider.overrideWithValue(DataSource.mock),
            sessionControllerProvider.overrideWith(TestSession.new),
            catalogRepositoryProvider.overrideWithValue(_FakeCatalog()),
            cartRepositoryProvider.overrideWithValue(repository),
            brandProvider.overrideWithValue(const Brand.bundled()),
          ],
        );
        addTearDown(container.dispose);
        await container.read(sessionControllerProvider.future);
        container.listen(cartControllerProvider, (_, _) {});
        await container.read(cartControllerProvider.future);
        final router = GoRouter(
          routes: [
            GoRoute(
              path: '/',
              builder: (_, _) => const ProductDetailScreen(productId: 'v1'),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp.router(
              routerConfig: router,
              locale: const Locale('en'),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
            ),
          ),
        );
        await tester.pumpAndSettle();
        final l10n = AppLocalizations.of(
          tester.element(find.byType(ProductDetailScreen)),
        );
        await tester.tap(find.text(l10n.productAddToCart));
        await tester.pump();
        if (switchSession) {
          (container.read(sessionControllerProvider.notifier) as TestSession)
              .setSession(
                const Session.signedIn(User(id: 'new', role: 'customer')),
              );
          await tester.pump();
        }
        repository.result.completeError(const AppFailure.network());
        await tester.pumpAndSettle();
        expect(container.read(cartControllerProvider).hasError, isFalse);
        expect(container.read(cartControllerProvider).requireValue.id, 'valid');
        expect(find.text(l10n.cartAdded), findsNothing);
        expect(
          find.text(l10n.stateErrorTitle),
          switchSession ? findsNothing : findsOneWidget,
        );
        await tester.pump(const Duration(seconds: 4));
        await tester.pumpAndSettle();
      },
    );
  }

  testWidgets(
    'variant price keeps product offer explicitly tied to base price',
    (tester) async {
      sizePhone(tester);
      await tester.pumpWidget(_host(promotion: true));
      await tester.pumpAndSettle();
      expect(find.text('50% off'), findsOneWidget);
      expect(find.textContaining('20,000'), findsOneWidget);
      expect(find.text('Base product offer'), findsOneWidget);
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

    // Selecting M uses its effective price and refreshes the badge.
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

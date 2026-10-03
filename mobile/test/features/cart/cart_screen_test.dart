import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/data/review.dart';
import 'package:shubayr/features/catalog/domain/catalog_repository.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/cart/presentation/screens/cart_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

import '../../helpers/test_session.dart';

/// Names any product 'Widget'; other reads aren't used by the cart screen.
class _FakeCatalog implements CatalogRepository {
  _FakeCatalog({this.whole});
  final bool? whole;
  @override
  Future<Product> fetchProduct(String id) async => Product(
    id: 'x',
    categoryId: 'c',
    nameEn: 'Widget',
    nameAr: 'قطعة',
    salePrice: 1000,
    variants: whole == null
        ? const []
        : [
            ProductVariant(
              id: 'v',
              wholeUnitsOnly: whole!,
              baseUnit: 'kg',
              availableQty: 0.5,
            ),
          ],
  );

  @override
  Future<List<Category>> fetchCategories() async => throw UnimplementedError();

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
  Future<ProductAvailability> fetchAvailability(String id) async =>
      throw UnimplementedError();

  @override
  Future<ReviewPage> fetchReviews(
    String id, {
    int page = 1,
    int perPage = 20,
  }) async => throw UnimplementedError();
}

/// A cart controller pinned to a fixed cart (no session / repository needed).
class _FixedCart extends CartController {
  _FixedCart(this._cart);
  final Cart _cart;
  @override
  Future<Cart> build() async => _cart;
}

class _FailingCart extends CartRepositoryMock {
  _FailingCart(this.cart);
  final Cart cart;
  @override
  Future<Cart> fetchCart() async => cart;
  @override
  Future<Cart> updateItem(String itemId, num quantity) async =>
      throw const AppFailure.network();
  @override
  Future<Cart> removeItem(String itemId) async =>
      throw const AppFailure.network();
}

Widget _host(
  Cart cart, {
  bool failMutations = false,
  bool? whole,
  CartRepositoryMock? repository,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    catalogRepositoryProvider.overrideWithValue(_FakeCatalog(whole: whole)),
    brandProvider.overrideWithValue(const Brand.bundled()),
    if (failMutations || repository != null) ...[
      sessionControllerProvider.overrideWith(TestSession.new),
      cartRepositoryProvider.overrideWithValue(
        repository ?? _FailingCart(cart),
      ),
    ] else
      cartControllerProvider.overrideWith(() => _FixedCart(cart)),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: CartScreen(),
  ),
);

class _UpdatingCart extends CartRepositoryMock {
  _UpdatingCart(this.cart);
  Cart cart;
  num? requested;
  @override
  Future<Cart> fetchCart() async => cart;
  @override
  Future<Cart> updateItem(String id, num quantity) async {
    requested = quantity;
    return cart = Cart(items: [cart.items.single.copyWith(quantity: quantity)]);
  }
}

void main() {
  testWidgets(
    'cart uses SKU fractional rules, preserves display and submits .125',
    (tester) async {
      const cart = Cart(
        items: [
          CartItem(
            id: 'c1',
            productId: 'x',
            variantId: 'v',
            quantity: 0.5,
            availableQty: 0.5,
          ),
        ],
      );
      final repo = _UpdatingCart(cart);
      await tester.pumpWidget(_host(cart, whole: false, repository: repo));
      await tester.pumpAndSettle();
      expect(find.text('0.5'), findsOneWidget);
      await tester.tap(find.text('0.5'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '0.125');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(repo.requested, 0.125);
      expect(find.text('0.125'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();
      expect(repo.requested, 0.5);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('shows cart lines and the subtotal', (tester) async {
    const cart = Cart(
      items: [CartItem(id: 'c1', productId: 'x', quantity: 2, unitPrice: 1000)],
      subtotal: 2000,
    );
    await tester.pumpWidget(_host(cart));
    await tester.pumpAndSettle();

    expect(find.text('Widget'), findsOneWidget);
    expect(find.text('2'), findsOneWidget); // quantity in the stepper
    expect(find.text('Subtotal'), findsOneWidget);
    // Line total and subtotal are both 2,000.
    expect(find.textContaining('2,000'), findsWidgets);
  });

  for (final icon in [Icons.add, Icons.close]) {
    testWidgets('failed cart action $icon retains lines and shows its error', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(
          const Cart(
            items: [
              CartItem(id: 'c1', productId: 'x', quantity: 2, unitPrice: 1000),
            ],
            subtotal: 2000,
          ),
          failMutations: true,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(icon));
      await tester.pumpAndSettle();
      final l10n = AppLocalizations.of(tester.element(find.byType(CartScreen)));
      expect(find.text(l10n.errorNetwork), findsOneWidget);
      expect(find.text('Widget'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
      expect(find.textContaining('2,000'), findsWidgets);
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
    });
  }

  testWidgets('shows the empty state', (tester) async {
    await tester.pumpWidget(_host(const Cart()));
    await tester.pumpAndSettle();

    expect(find.text('Your cart is empty'), findsOneWidget);
  });
}

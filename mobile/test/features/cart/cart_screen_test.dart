import 'package:flutter/material.dart';
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
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/cart/presentation/screens/cart_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

/// Names any product 'Widget'; other reads aren't used by the cart screen.
class _FakeCatalog implements CatalogRepository {
  @override
  Future<Product> fetchProduct(String id) async => const Product(
    id: 'x',
    categoryId: 'c',
    nameEn: 'Widget',
    nameAr: 'قطعة',
    salePrice: 1000,
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

Widget _host(Cart cart) => ProviderScope(
  overrides: [
    catalogRepositoryProvider.overrideWithValue(_FakeCatalog()),
    brandProvider.overrideWithValue(const Brand.bundled()),
    cartControllerProvider.overrideWith(() => _FixedCart(cart)),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: CartScreen(),
  ),
);

void main() {
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

  testWidgets('shows the empty state', (tester) async {
    await tester.pumpWidget(_host(const Cart()));
    await tester.pumpAndSettle();

    expect(find.text('Your cart is empty'), findsOneWidget);
  });
}

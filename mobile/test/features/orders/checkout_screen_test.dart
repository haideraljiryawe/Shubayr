import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/orders/data/coupon.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/domain/order_repository.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/checkout_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

class _FixedCart extends CartController {
  _FixedCart(this._cart);
  final Cart _cart;
  @override
  Future<Cart> build() async => _cart;
}

class _FixedAddresses extends AddressesController {
  _FixedAddresses(this._list);
  final List<Address> _list;
  @override
  Future<List<Address>> build() async => _list;
}

class _FakeOrders implements OrderRepository {
  @override
  Future<Coupon> validateCoupon(String code) async =>
      Coupon(code: code, type: 'percentage', value: 10);

  @override
  Future<Order> placeOrder({
    required String addressId,
    String? couponCode,
  }) async => const Order(id: 'o1', orderNumber: 'SH-1', total: 55000);
}

Widget _host() => ProviderScope(
  overrides: [
    cartControllerProvider.overrideWith(
      () => _FixedCart(
        const Cart(
          items: [
            CartItem(id: 'c1', productId: 'x', quantity: 1, unitPrice: 50000),
          ],
          subtotal: 50000,
        ),
      ),
    ),
    addressesControllerProvider.overrideWith(
      () => _FixedAddresses(const [
        Address(id: 'a1', label: 'Home', city: 'Baghdad', isDefault: true),
      ]),
    ),
    orderRepositoryProvider.overrideWithValue(_FakeOrders()),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: CheckoutScreen(),
  ),
);

void main() {
  testWidgets('shows the address and places a COD order', (tester) async {
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Cash on delivery'), findsOneWidget);
    expect(find.text('Place order'), findsOneWidget);

    await tester.tap(find.text('Place order'));
    await tester.pumpAndSettle();

    // The success view replaces the form.
    expect(find.text('Order placed'), findsOneWidget);
    expect(find.text('SH-1'), findsOneWidget);
  });
}

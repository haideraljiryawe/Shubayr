import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/checkout_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import '../../helpers/test_session.dart';
import 'api11_actions_test.dart' show PriceOrders, priceCart, conflict;
import 'order_action_lifecycle_test.dart' show Carts, Addresses;

void main() {
  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
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
        testWidgets(
          'price review fits $width $locale dark=$dark and requires consent',
          (tester) async {
            tester.view.physicalSize = Size(width, 1000);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            final carts = Carts()..current = priceCart;
            final orders = PriceOrders(carts)
              ..onPlace = () async => throw conflict();
            final c = ProviderContainer(
              retry: (_, _) => null,
              overrides: [
                sessionControllerProvider.overrideWith(TestSession.new),
                cartRepositoryProvider.overrideWithValue(carts),
                orderRepositoryProvider.overrideWithValue(orders),
                addressesControllerProvider.overrideWith(Addresses.new),
                brandProvider.overrideWithValue(const Brand.bundled()),
              ],
            );
            addTearDown(c.dispose);
            await tester.pumpWidget(
              UncontrolledProviderScope(
                container: c,
                child: MaterialApp(
                  locale: Locale(locale),
                  localizationsDelegates:
                      AppLocalizations.localizationsDelegates,
                  supportedLocales: AppLocalizations.supportedLocales,
                  theme: dark
                      ? AppTheme.dark(const Brand.bundled())
                      : AppTheme.light(const Brand.bundled()),
                  builder: (context, child) => MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      textScaler: TextScaler.linear(width == 599 ? 1.5 : 1),
                    ),
                    child: child!,
                  ),
                  home: const CheckoutScreen(),
                ),
              ),
            );
            await tester.pumpAndSettle();
            final l10n = AppLocalizations.of(
              tester.element(find.byType(CheckoutScreen)),
            );
            await tester.ensureVisible(find.text(l10n.checkoutPlaceOrder));
            await tester.tap(find.text(l10n.checkoutPlaceOrder));
            await tester.pumpAndSettle();
            expect(find.text(l10n.checkoutPricesChanged), findsOneWidget);
            expect(find.text('SKU'), findsOneWidget);
            expect(orders.placements, 1);
            expect(orders.accepted.single, isEmpty);
            expect(tester.takeException(), isNull);
            orders.onPlace = () async =>
                const Order(id: 'o', total: 1175, currency: 'IQD');
            await tester.tap(find.text(l10n.checkoutAcceptPrices));
            await tester.pumpAndSettle();
            expect(orders.placements, 2);
            expect(orders.accepted.last.single.priceVersion, 'server-new');
            expect(find.byType(AlertDialog), findsNothing);
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
  testWidgets('changing session closes a price prompt without submitting', (
    tester,
  ) async {
    final carts = Carts()..current = priceCart;
    final orders = PriceOrders(carts)..onPlace = () async => throw conflict();
    final c = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        sessionControllerProvider.overrideWith(TestSession.new),
        cartRepositoryProvider.overrideWithValue(carts),
        orderRepositoryProvider.overrideWithValue(orders),
        addressesControllerProvider.overrideWith(Addresses.new),
        brandProvider.overrideWithValue(const Brand.bundled()),
      ],
    );
    addTearDown(c.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: const MaterialApp(
          locale: Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: CheckoutScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Place order'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
      const Session.signedIn(User(id: 'B', role: 'customer')),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(orders.placements, 1);
    expect(tester.takeException(), isNull);
  });
}

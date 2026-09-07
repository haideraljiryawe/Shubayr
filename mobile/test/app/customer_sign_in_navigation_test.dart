import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:shubayr/features/auth/presentation/screens/verify_otp_screen.dart';
import 'package:shubayr/features/settings/presentation/screens/account_view.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_detail_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/features/wishlist/presentation/screens/wishlist_screen.dart';

/// Driving the whole OTP flow through the UI must land the customer inside the
/// shell without throwing. Regression guard for the go_router duplicate
/// page-key crash that fired when the session flipped to signed-in while the
/// imperatively-pushed sign-in/verify routes were still on the stack.
Future<ProviderContainer> _guestContainer() async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  return ProviderContainer(
    overrides: [
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      productProvider('p5').overrideWith(
        (ref) async => const Product(
          id: 'p5',
          categoryId: 'grocery',
          nameEn: 'Coffee',
          nameAr: 'قهوة',
        ),
      ),
    ],
  );
}

Future<void> _pumpApp(WidgetTester tester, ProviderContainer container) async {
  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const ShubayrApp()),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'OTP flow returns a customer to Account without duplicate pages',
    (tester) async {
      final container = await _guestContainer();
      addTearDown(container.dispose);
      await _pumpApp(tester, container);

      // Guest taps Account -> settings screen, then the sign-in prompt inside it.
      await tester.tap(find.byIcon(Icons.person_outline).first);
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.login));
      await tester.pumpAndSettle();
      expect(find.byType(SignInScreen), findsOneWidget);

      // Enter a phone and request the code -> verify screen is pushed.
      await tester.enterText(find.byType(TextFormField), '7701234567');
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();
      expect(find.byType(VerifyOtpScreen), findsOneWidget);

      // Enter any 6-digit code (mock accepts it) and verify.
      await tester.enterText(find.byType(TextFormField), '123456');
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      // The customer must land in the shell, with the sign-in flow gone and no
      // duplicate-page-key crash.
      expect(tester.takeException(), isNull);
      expect(find.byType(SignInScreen), findsNothing);
      expect(find.byType(VerifyOtpScreen), findsNothing);
      expect(find.byType(AccountView), findsOneWidget);

      // The signed-in tab bar now exposes Cart and Orders alongside the public
      // destinations (they are hidden for guests).
      expect(find.byIcon(Icons.shopping_cart_outlined), findsOneWidget);
      expect(find.byIcon(Icons.receipt_long_outlined), findsOneWidget);
    },
    timeout: const Timeout(Duration(seconds: 30)),
  );

  for (final destination in ['/products/p5', '/wishlist', '/search?q=coffee']) {
    testWidgets('OTP returns to $destination without replaying an action', (
      tester,
    ) async {
      final container = await _guestContainer();
      addTearDown(container.dispose);
      await _pumpApp(tester, container);
      final router = container.read(routerProvider);
      final cartBefore = await tester.runAsync(
        () => container.read(cartRepositoryProvider).fetchCart(),
      );
      router.go(
        Uri(
          path: '/sign-in',
          queryParameters: {'returnTo': destination},
        ).toString(),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '7701234567');
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '123456');
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final screen = find.byType(switch (destination) {
        '/products/p5' => ProductDetailScreen,
        '/wishlist' => WishlistScreen,
        _ => ProductListScreen,
      });
      expect(screen, findsOneWidget);
      expect(
        GoRouterState.of(tester.element(screen)).uri.toString(),
        destination,
      );
      final cartAfter = await tester.runAsync(
        () => container.read(cartRepositoryProvider).fetchCart(),
      );
      expect(cartAfter!.items.length, cartBefore!.items.length);
      expect(router.canPop(), isTrue);
      router.pop();
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, '/home');
      expect(tester.takeException(), isNull);
    });
  }
}

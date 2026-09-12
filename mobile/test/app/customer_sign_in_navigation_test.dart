import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/theme_mode_controller.dart';
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
    retry: (retryCount, error) => null,
    overrides: [
      // Banner networking is covered separately; keep navigation tests deterministic.
      homeBannersProvider.overrideWith((ref) async => []),
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
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets(
      'guest add-to-cart snackbar stays dark and readable in ${mode.name} mode',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(390, 844));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final container = await _guestContainer();
        addTearDown(container.dispose);
        await container
            .read(themeModeControllerProvider.notifier)
            .setMode(mode);
        await _pumpApp(tester, container);
        container.read(routerProvider).go('/products/p5');
        await tester.pumpAndSettle();
        final context = tester.element(find.byType(ProductDetailScreen));
        final l10n = AppLocalizations.of(context);
        expect(Directionality.of(context), TextDirection.rtl);
        await tester.tap(find.text(l10n.productAddToCart));
        await tester.pumpAndSettle();

        expect(find.text(l10n.cartSignInPrompt), findsOneWidget);
        final surface = tester
            .widget<Material>(
              find
                  .descendant(
                    of: find.byType(SnackBar),
                    matching: find.byType(Material),
                  )
                  .first,
            )
            .color!;
        final messageColor = DefaultTextStyle.of(
          tester.element(find.text(l10n.cartSignInPrompt)),
        ).style.color!;
        final actionColor = DefaultTextStyle.of(
          tester.element(find.text(l10n.authSignInTitle)),
        ).style.color!;
        expect(surface.computeLuminance(), lessThan(0.1));
        expect(_contrast(surface, messageColor), greaterThanOrEqualTo(4.5));
        expect(_contrast(surface, actionColor), greaterThanOrEqualTo(4.5));

        await tester.tap(find.text(l10n.authSignInTitle));
        await tester.pumpAndSettle();
        expect(find.byType(SignInScreen), findsOneWidget);
        expect(
          tester.widget<SignInScreen>(find.byType(SignInScreen)).returnTo,
          '/products/p5',
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

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

double _contrast(Color first, Color second) {
  final a = first.computeLuminance();
  final b = second.computeLuminance();
  return a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);
}

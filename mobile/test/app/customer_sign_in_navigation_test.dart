import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:shubayr/features/auth/presentation/screens/verify_otp_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';

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
  testWidgets('OTP flow through the UI lands a customer on Home', (
    tester,
  ) async {
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
    expect(find.byType(HomeScreen), findsOneWidget);

    // The signed-in tab bar now exposes Cart and Orders alongside the public
    // destinations (they are hidden for guests).
    expect(find.byIcon(Icons.shopping_cart_outlined), findsOneWidget);
    expect(find.byIcon(Icons.receipt_long_outlined), findsOneWidget);
  }, timeout: const Timeout(Duration(seconds: 30)));
}

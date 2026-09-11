import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/settings/presentation/screens/account_view.dart';

/// A guest can open Account (app settings) without signing in, reach sign-in
/// from a prompt inside it, and change language/theme while signed out.
Future<ProviderContainer> _guestContainer() async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  return ProviderContainer(
    overrides: [
      // Banner networking is covered separately; keep navigation tests deterministic.
      homeBannersProvider.overrideWith((ref) async => []),
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

/// Guest taps the Account tab and lands on the settings screen.
Future<void> _openAccount(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.person_outline).first);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('guest opens Account settings without being sent to sign-in', (
    tester,
  ) async {
    final container = await _guestContainer();
    addTearDown(container.dispose);
    await _pumpApp(tester, container);

    await _openAccount(tester);

    expect(find.byType(AccountView), findsOneWidget);
    expect(find.byType(SignInScreen), findsNothing);
    // The sign-in prompt is inside the settings screen.
    expect(find.byIcon(Icons.login), findsOneWidget);
  });

  testWidgets('guest reaches sign-in from the Account prompt and can go back', (
    tester,
  ) async {
    final container = await _guestContainer();
    addTearDown(container.dispose);
    await _pumpApp(tester, container);

    await _openAccount(tester);
    await tester.tap(find.byIcon(Icons.login));
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsOneWidget);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byType(AccountView), findsOneWidget);
    expect(find.byType(SignInScreen), findsNothing);
  });

  testWidgets('guest can switch the app language from Account', (tester) async {
    final container = await _guestContainer();
    addTearDown(container.dispose);
    await _pumpApp(tester, container);

    await _openAccount(tester);
    // Arabic is the default locale.
    expect(find.text('التفضيلات'), findsOneWidget);

    // Switch to English — the section labels re-render in English, proving a
    // signed-out guest is no longer stuck in whatever language was last set.
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('Preferences'), findsOneWidget);
    expect(find.text('التفضيلات'), findsNothing);
  });

  testWidgets('reaching sign-in with no history falls back to public Home', (
    tester,
  ) async {
    final container = await _guestContainer();
    addTearDown(container.dispose);
    await _pumpApp(tester, container);

    // Entering by redirect/deep link replaces the stack — nothing to pop.
    container.read(routerProvider).go(AppRoutes.signIn);
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsOneWidget);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
  });
}

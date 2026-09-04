import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/categories_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';

/// A signed-out guest must always be able to leave the sign-in screen.
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
  testWidgets('Home → Account → sign in → back → Home', (tester) async {
    final container = await _guestContainer();
    addTearDown(container.dispose);
    await _pumpApp(tester, container);

    expect(find.byType(HomeScreen), findsOneWidget);

    await tester.tap(find.byIcon(Icons.person_outline).first);
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsOneWidget);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(SignInScreen), findsNothing);
  });

  testWidgets('Categories → Account → sign in → back → Categories', (
    tester,
  ) async {
    final container = await _guestContainer();
    addTearDown(container.dispose);
    await _pumpApp(tester, container);

    await tester.tap(find.byIcon(Icons.grid_view_outlined).first);
    await tester.pumpAndSettle();
    expect(find.byType(CategoriesScreen), findsOneWidget);

    await tester.tap(find.byIcon(Icons.person_outline).first);
    await tester.pumpAndSettle();
    expect(find.byType(SignInScreen), findsOneWidget);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();

    // Back returns to what the guest was browsing, not to a hard-coded Home.
    expect(find.byType(CategoriesScreen), findsOneWidget);
    expect(find.byType(HomeScreen), findsNothing);
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

  testWidgets('the back affordance is present in Arabic RTL and English LTR', (
    tester,
  ) async {
    final container = await _guestContainer();
    addTearDown(container.dispose);
    await _pumpApp(tester, container);

    await tester.tap(find.byIcon(Icons.person_outline).first);
    await tester.pumpAndSettle();

    // Arabic is the default locale: the sign-in screen lays out right-to-left
    // and the platform back glyph mirrors itself (matchTextDirection).
    final rtlContext = tester.element(find.byType(BackButton));
    expect(Directionality.of(rtlContext), TextDirection.rtl);
    expect(find.byType(BackButton), findsOneWidget);

    await container
        .read(localeControllerProvider.notifier)
        .setLocale(AppLocales.english);
    await tester.pumpAndSettle();

    final ltrContext = tester.element(find.byType(BackButton));
    expect(Directionality.of(ltrContext), TextDirection.ltr);
    expect(find.byType(BackButton), findsOneWidget);

    // Still able to leave the screen after the locale switch.
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);
  });
}

import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/app_colors.dart';
import 'package:shubayr/core/theme/theme_mode_controller.dart';
import 'package:shubayr/features/catalog/presentation/screens/categories_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';

Future<ProviderContainer> _container() async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  return ProviderContainer(
    retry: (retryCount, error) => null,
    overrides: [
      notificationSyncProvider.overrideWith((ref) {}),
      unreadCountProvider.overrideWith((ref) async => 0),
      dataSourceProvider.overrideWithValue(DataSource.mock),
      // Banner networking is covered separately; keep navigation tests deterministic.
      homeBannersProvider.overrideWith((ref) async => []),
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
    ],
  );
}

void main() {
  for (final locale in ['ar', 'en']) {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      testWidgets(
        'bottom navigation separates unselected from selected $locale $mode',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 1000);
          addTearDown(tester.view.reset);
          final container = await _container();
          addTearDown(container.dispose);
          await container
              .read(localeControllerProvider.notifier)
              .setLocale(Locale(locale));
          await container
              .read(themeModeControllerProvider.notifier)
              .setMode(mode);
          await tester.pumpWidget(
            UncontrolledProviderScope(
              container: container,
              child: const ShubayrApp(),
            ),
          );
          await tester.pumpAndSettle();
          final colors = Theme.of(
            tester.element(find.byType(HomeScreen)),
          ).extension<AppColors>()!;
          final unselectedColor = Theme.of(
            tester.element(find.byType(HomeScreen)),
          ).colorScheme.onSurface.withValues(alpha: 0.92);
          final homeLabel = locale == 'ar' ? 'الرئيسية' : 'Home';
          final categoriesLabel = locale == 'ar' ? 'الأقسام' : 'Categories';
          Finder destinationIcon(String label, IconData icon) =>
              find.descendant(
                of: find
                    .ancestor(
                      of: find.text(label),
                      matching: find.byType(InkWell),
                    )
                    .first,
                matching: find.byIcon(icon),
              );
          expect(
            tester.widget<Text>(find.text(homeLabel)).style!.color,
            colors.primary,
          );
          expect(
            tester.widget<Text>(find.text(categoriesLabel)).style!.color,
            unselectedColor,
          );
          expect(
            tester
                .widget<Icon>(
                  destinationIcon(categoriesLabel, Icons.grid_view_outlined),
                )
                .color,
            unselectedColor,
          );
          await tester.tap(find.text(categoriesLabel));
          await tester.pumpAndSettle();
          expect(
            tester.widget<Text>(find.text(homeLabel)).style!.color,
            unselectedColor,
          );
          expect(
            tester
                .widget<Icon>(destinationIcon(homeLabel, Icons.home_outlined))
                .color,
            unselectedColor,
          );
          expect(
            tester
                .widget<Icon>(
                  destinationIcon(categoriesLabel, Icons.grid_view_rounded),
                )
                .color,
            colors.primary,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('starts in Arabic with a right-to-left layout', (tester) async {
    final container = await _container();
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const ShubayrApp(),
      ),
    );
    await tester.pumpAndSettle();

    final context = tester.element(find.byType(HomeScreen));
    expect(Directionality.of(context), TextDirection.rtl);
    expect(Localizations.localeOf(context).languageCode, 'ar');
    expect(find.text('الرئيسية'), findsOneWidget);
    expect(find.text('الأقسام'), findsOneWidget);
    expect(find.text('الحساب'), findsOneWidget);
  });

  testWidgets('guest bottom navigation has exactly three destinations', (
    tester,
  ) async {
    final container = await _container();
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const ShubayrApp(),
      ),
    );
    await tester.pumpAndSettle();

    // Guest bar = Home · Categories · Account (each label once); Cart absent.
    expect(find.text('الرئيسية'), findsOneWidget);
    expect(find.text('الأقسام'), findsOneWidget);
    expect(find.text('الحساب'), findsOneWidget);
    expect(find.text('السلة'), findsNothing);
  });

  testWidgets('a guest can reach Categories from the bottom navigation', (
    tester,
  ) async {
    final container = await _container();
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const ShubayrApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(HomeScreen), findsOneWidget);

    await tester.tap(find.byIcon(Icons.grid_view_outlined).first);
    await tester.pumpAndSettle();

    expect(find.byType(CategoriesScreen), findsOneWidget);
  });

  testWidgets('switches to English and left-to-right', (tester) async {
    final container = await _container();
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const ShubayrApp(),
      ),
    );
    await tester.pumpAndSettle();

    await container
        .read(localeControllerProvider.notifier)
        .setLocale(AppLocales.english);
    await tester.pumpAndSettle();

    final context = tester.element(find.byType(HomeScreen));
    expect(Directionality.of(context), TextDirection.ltr);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Categories'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
  });

  testWidgets('paints the bundled green brand on a warm off-white ground', (
    tester,
  ) async {
    final container = await _container();
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const ShubayrApp(),
      ),
    );
    await tester.pumpAndSettle();

    final theme = Theme.of(tester.element(find.byType(HomeScreen)));
    final colors = theme.extension<AppColors>()!;
    expect(colors.primary, const Color(0xFF396D48));
    expect(theme.scaffoldBackgroundColor, const Color(0xFFF6F5EE));
  });
}

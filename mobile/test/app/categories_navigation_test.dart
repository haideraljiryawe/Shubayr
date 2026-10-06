import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/categories_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/subcategories_screen.dart';

void main() {
  for (final locale in ['ar', 'en']) {
    testWidgets(
      'guest uses actual category route and retains mobile navigation $locale',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(390, 1000);
        addTearDown(tester.view.reset);
        SharedPreferences.setMockInitialValues({});
        final prefs = PrefsStore(await SharedPreferences.getInstance());
        final container = ProviderContainer(
          overrides: [
            notificationSyncProvider.overrideWith((ref) {}),
            unreadCountProvider.overrideWith((ref) async => 0),
            dataSourceProvider.overrideWithValue(DataSource.mock),
            prefsStoreProvider.overrideWithValue(prefs),
            tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
            homeBannersProvider.overrideWith((ref) async => []),
            categoriesProvider.overrideWith(
              (ref) async => const [
                Category(
                  id: 'parent',
                  nameEn: 'Parent',
                  nameAr: 'الرئيسي',
                  children: [
                    Category(id: 'child', nameEn: 'Child', nameAr: 'الفرعي'),
                  ],
                ),
                Category(id: 'second', nameEn: 'Second', nameAr: 'الثاني'),
              ],
            ),
          ],
        );
        addTearDown(container.dispose);
        await container
            .read(localeControllerProvider.notifier)
            .setLocale(Locale(locale));
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const ShubayrApp(),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.byTooltip(locale == 'ar' ? 'الأقسام' : 'Categories'),
        );
        await tester.pumpAndSettle();
        expect(
          find.text(locale == 'ar' ? 'الأقسام الرئيسية' : 'Main Categories'),
          findsOneWidget,
        );
        expect(
          find.byTooltip(locale == 'ar' ? 'الأقسام' : 'Categories'),
          findsOneWidget,
        );
        await tester.tap(find.byKey(const ValueKey('cat-card-parent')));
        await tester.pumpAndSettle();
        expect(find.byType(SubcategoriesScreen), findsOneWidget);
        expect(
          find.text(locale == 'ar' ? 'الرئيسي' : 'Parent'),
          findsOneWidget,
        );
        expect(find.text(locale == 'ar' ? 'الفرعي' : 'Child'), findsOneWidget);
        expect(
          find.byTooltip(locale == 'ar' ? 'الحساب' : 'Account'),
          findsOneWidget,
        );
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(find.byType(CategoriesScreen), findsOneWidget);
        // A direct URL also constructs the parent stack with natural back.
        container.read(routerProvider).go('/categories/parent');
        await tester.pumpAndSettle();
        expect(find.byType(SubcategoriesScreen), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(find.byType(CategoriesScreen), findsOneWidget);
        for (final width in [800.0, 1920.0, 390.0]) {
          tester.view.physicalSize = Size(width, 1000);
          await tester.pumpAndSettle();
          expect(find.byType(NavigationRail), findsNothing);
          expect(
            find.byTooltip(locale == 'ar' ? 'الحساب' : 'Account'),
            findsOneWidget,
          );
          expect(find.byType(CategoriesScreen), findsOneWidget);
          final first = tester.getRect(
            find.byKey(const ValueKey('cat-card-parent')),
          );
          final second = tester.getRect(
            find.byKey(const ValueKey('cat-card-second')),
          );
          if (width == 390) {
            expect(second.top, greaterThan(first.bottom));
          } else {
            expect(second.top, closeTo(first.top, 0.01));
            expect(first.width, lessThan(width / 2));
          }
          expect(tester.takeException(), isNull);
        }
      },
    );
  }
}

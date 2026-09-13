import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/categories_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/subcategories_screen.dart';

void main() {
  testWidgets(
    'guest uses actual category route and retains mobile navigation',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 1000);
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues({});
      final prefs = PrefsStore(await SharedPreferences.getInstance());
      final container = ProviderContainer(
        overrides: [
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
            ],
          ),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const ShubayrApp(),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('الأقسام'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('cat-card-parent')));
      await tester.pumpAndSettle();
      expect(find.byType(SubcategoriesScreen), findsOneWidget);
      expect(find.text('الرئيسي'), findsOneWidget);
      expect(find.text('الفرعي'), findsOneWidget);
      expect(find.text('الحساب'), findsOneWidget);
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
      expect(tester.takeException(), isNull);
    },
  );
}

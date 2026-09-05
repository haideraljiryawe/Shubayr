import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/domain/catalog_repository.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/settings/presentation/screens/profile_screen.dart';

/// Empty, network-free catalog so the home screen behind the profile flow does
/// not try to load product images over the network (which never settles under
/// the test binding).
class _EmptyCatalog implements CatalogRepository {
  @override
  Future<List<Category>> fetchCategories() async => const [];
  @override
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) async => const ProductPage();
  @override
  Future<Product> fetchProduct(String id) async =>
      const Product(id: 'x', categoryId: 'c', nameEn: 'x', nameAr: 'x');
}

Future<ProviderContainer> _container() async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  return ProviderContainer(
    overrides: [
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      catalogRepositoryProvider.overrideWithValue(_EmptyCatalog()),
    ],
  );
}

void main() {
  testWidgets('profile Save enables on change and updates the name', (
    tester,
  ) async {
    final container = await _container();
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const ShubayrApp()),
    );
    // Bounded pumps rather than pumpAndSettle: splash/loading spinners animate
    // continuously, so pumpAndSettle never converges in this flow.
    await tester.pump(const Duration(seconds: 1));

    // Fire sign-in and pump so the mock's delay timer runs under the fake
    // clock, then await the finished future.
    final signIn = container
        .read(sessionControllerProvider.notifier)
        .verifyOtp(phone: '07700000000', code: '123456');
    await tester.pump(const Duration(seconds: 1));
    await signIn;

    container.read(routerProvider).push(AppRoutes.profile);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(ProfileScreen), findsOneWidget);

    // Save (the only ElevatedButton) is disabled until something changes.
    final save = find.byType(ElevatedButton);
    expect(tester.widget<ElevatedButton>(save).onPressed, isNull);

    await tester.enterText(find.byType(TextField), 'أحمد');
    await tester.pump();
    expect(tester.widget<ElevatedButton>(save).onPressed, isNotNull);

    await tester.tap(save);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // The name is persisted to the session (locally, in mock mode).
    expect(
      container.read(sessionControllerProvider).valueOrNull?.user?.name,
      'أحمد',
    );
    // Save returns to disabled now that there are no unsaved changes.
    expect(tester.widget<ElevatedButton>(save).onPressed, isNull);
    // The isolated delete action is present.
    expect(find.byIcon(Icons.delete_outline), findsOneWidget);
  }, timeout: const Timeout(Duration(seconds: 25)));
}

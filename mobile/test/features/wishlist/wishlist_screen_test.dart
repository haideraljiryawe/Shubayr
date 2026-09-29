import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:shubayr/features/wishlist/data/wishlist_item.dart';
import 'package:shubayr/features/wishlist/presentation/providers/wishlist_providers.dart';
import 'package:shubayr/features/wishlist/presentation/screens/wishlist_screen.dart';

class _FixedWishlist extends WishlistController {
  _FixedWishlist(this._items);
  final List<WishlistItem> _items;
  @override
  Future<List<WishlistItem>> build() async => _items;
}

Product _product(String id, String name) => Product(
  id: id,
  categoryId: 'c1',
  nameEn: name,
  nameAr: name,
  salePrice: 1000,
);

Widget _host(List<WishlistItem> items) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    wishlistControllerProvider.overrideWith(() => _FixedWishlist(items)),
    productProvider('p1').overrideWith((ref) async => _product('p1', 'Alpha')),
    productProvider('p2').overrideWith((ref) async => _product('p2', 'Beta')),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: WishlistScreen(),
  ),
);

void main() {
  testWidgets('shows an empty state with no saved products', (tester) async {
    await tester.pumpWidget(_host(const []));
    await tester.pumpAndSettle();

    expect(find.text('No saved products'), findsOneWidget);
  });

  testWidgets('lists saved products in a grid', (tester) async {
    await tester.pumpWidget(
      _host(const [
        WishlistItem(id: 'w1', productId: 'p1'),
        WishlistItem(id: 'w2', productId: 'p2'),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.text('Alpha'), findsOneWidget);
    expect(find.text('Beta'), findsOneWidget);
    // A remove heart is overlaid on each card.
    expect(find.byIcon(Icons.favorite), findsNWidgets(2));
  });
}

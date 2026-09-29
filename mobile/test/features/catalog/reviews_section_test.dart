import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/data/review.dart';
import 'package:shubayr/features/catalog/domain/catalog_repository.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/widgets/reviews_section.dart';

/// Returns two reviews for any product except 'none', which has none.
class _FakeCatalog implements CatalogRepository {
  @override
  Future<ReviewPage> fetchReviews(
    String id, {
    int page = 1,
    int perPage = 20,
  }) async {
    if (id == 'none') return const ReviewPage();
    final data = [
      Review(
        id: 'r0',
        productId: id,
        rating: 5,
        comment: 'ممتاز',
        verifiedPurchase: true,
        createdAt: DateTime(2026, 8, 1),
      ),
      Review(
        id: 'r1',
        productId: id,
        rating: 3,
        comment: 'مقبول',
        createdAt: DateTime(2026, 7, 20),
      ),
    ];
    return ReviewPage(
      page: 1,
      perPage: perPage,
      total: data.length,
      data: data,
    );
  }

  @override
  Future<List<Category>> fetchCategories() async => throw UnimplementedError();

  @override
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    bool onSale = false,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) async => throw UnimplementedError();

  @override
  Future<Product> fetchProduct(String id) async => throw UnimplementedError();

  @override
  Future<ProductAvailability> fetchAvailability(String id) async =>
      throw UnimplementedError();
}

Widget _host(String productId) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    catalogRepositoryProvider.overrideWithValue(_FakeCatalog()),
  ],
  child: MaterialApp(
    locale: const Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: ReviewsSection(productId: productId, ratingAvg: 4.5)),
  ),
);

void main() {
  testWidgets('renders reviews with the count, comment and verified mark', (
    tester,
  ) async {
    await tester.pumpWidget(_host('p'));
    await tester.pumpAndSettle();

    expect(find.text('2 reviews'), findsOneWidget);
    expect(find.text('ممتاز'), findsOneWidget);
    expect(find.text('Verified purchase'), findsOneWidget);
  });

  testWidgets('shows an empty state when there are no reviews', (tester) async {
    await tester.pumpWidget(_host('none'));
    await tester.pumpAndSettle();

    expect(find.text('No reviews yet'), findsOneWidget);
  });
}

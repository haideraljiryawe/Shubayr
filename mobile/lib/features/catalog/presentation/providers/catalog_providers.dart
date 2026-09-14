import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../data/catalog_repository_mock.dart';
import '../../data/catalog_repository_remote.dart';
import '../../data/category.dart';
import '../../data/product.dart';
import '../../data/product_availability.dart';
import '../../data/product_page.dart';
import '../../data/review.dart';
import '../../domain/catalog_repository.dart';

/// Mock ⇄ remote switch, overridable globally (`DATA_SOURCE`) or per test.
final catalogRepositoryProvider = Provider<CatalogRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => CatalogRepositoryMock(),
    DataSource.remote => CatalogRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// The department / category tree.
final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(catalogRepositoryProvider).fetchCategories(),
);

/// The home feed for a chosen department (null = all), newest first. Used by
/// the home screen's selectable department chips.
final categoryFeedProvider = FutureProvider.family<ProductPage, String?>(
  (ref, categoryId) => ref
      .watch(catalogRepositoryProvider)
      .fetchProducts(categoryId: categoryId, sort: 'newest', perPage: 20),
);

/// Bounded Home preview; the existing onSale query owns discount semantics.
final homeOffersProvider = FutureProvider<ProductPage>(
  (ref) => ref
      .watch(catalogRepositoryProvider)
      .fetchProducts(onSale: true, sort: 'newest', perPage: 8),
);

/// Only parent categories with offers. Each existence query includes the
/// subtree and needs one record, avoiding downloading all products to the UI.
final offerCategoriesProvider = FutureProvider<List<Category>>((ref) async {
  final repository = ref.watch(catalogRepositoryProvider);
  final parents = await ref.watch(categoriesProvider.future);
  final available = await Future.wait([
    for (final parent in parents)
      repository.fetchProducts(categoryId: parent.id, onSale: true, perPage: 1),
  ]);
  return [
    for (var i = 0; i < parents.length; i++)
      if (available[i].total > 0) parents[i],
  ];
});

/// A single product by id, for the detail screen.
final productProvider = FutureProvider.family<Product, String>(
  (ref, id) => ref.watch(catalogRepositoryProvider).fetchProduct(id),
);

/// Live per-variant availability for a product, for the detail screen. Kept
/// separate from [productProvider] so stock can refresh without refetching the
/// whole product.
final availabilityProvider = FutureProvider.family<ProductAvailability, String>(
  (ref, id) => ref.watch(catalogRepositoryProvider).fetchAvailability(id),
);

/// First page of published reviews for a product, for the detail screen.
final productReviewsProvider = FutureProvider.family<ReviewPage, String>(
  (ref, id) => ref.watch(catalogRepositoryProvider).fetchReviews(id),
);

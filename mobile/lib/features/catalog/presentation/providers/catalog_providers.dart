import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../data/catalog_repository_mock.dart';
import '../../data/catalog_repository_remote.dart';
import '../../data/category.dart';
import '../../data/product.dart';
import '../../data/product_page.dart';
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
  (ref, categoryId) => ref.watch(catalogRepositoryProvider).fetchProducts(
    categoryId: categoryId,
    sort: 'newest',
    perPage: 20,
  ),
);

/// A single product by id, for the detail screen.
final productProvider = FutureProvider.family<Product, String>(
  (ref, id) => ref.watch(catalogRepositoryProvider).fetchProduct(id),
);

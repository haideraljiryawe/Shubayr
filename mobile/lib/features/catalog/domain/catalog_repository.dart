import '../data/category.dart';
import '../data/product.dart';
import '../data/product_page.dart';

/// Read side of the catalog. Implemented by a mock and a Dio repository;
/// presentation code only ever sees this interface.
abstract interface class CatalogRepository {
  /// `GET /categories` — the department/category tree (public).
  Future<List<Category>> fetchCategories();

  /// `GET /products` — list / filter / search, paginated (public).
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    String? sort,
    int page = 1,
    int perPage = 20,
  });

  /// `GET /products/{id}` — product detail (public).
  Future<Product> fetchProduct(String id);
}

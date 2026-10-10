import '../../../core/network/api_client.dart';
import '../../../core/error/response_decode.dart';
import '../domain/catalog_repository.dart';
import 'category.dart';
import 'product.dart';
import 'product_availability.dart';
import 'product_page.dart';
import 'review.dart';

class CatalogRepositoryRemote implements CatalogRepository {
  const CatalogRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<List<Category>> fetchCategories() => decodeResponse(() async {
    final json = await _api.get<List<dynamic>>('/categories');
    return json
        .map((e) => Category.fromJson(e as Map<String, dynamic>))
        .toList();
  });

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
  }) => decodeResponse(() async {
    final params = <String, dynamic>{'page': page, 'per_page': perPage};
    if (query != null && query.trim().isNotEmpty) params['q'] = query.trim();
    if (categoryId != null) params['category_id'] = categoryId;
    if (minPrice != null) params['min_price'] = minPrice;
    if (maxPrice != null) params['max_price'] = maxPrice;
    if (sort != null) params['sort'] = sort;
    if (onSale) params['on_sale'] = true;
    final json = await _api.get<Map<String, dynamic>>(
      '/products',
      query: params,
    );
    return ProductPage.fromJson(json);
  });

  @override
  Future<Product> fetchProduct(String id) => decodeResponse(() async {
    final json = await _api.get<Map<String, dynamic>>('/products/$id');
    return Product.fromJson(json);
  });

  @override
  Future<ProductAvailability> fetchAvailability(String id) =>
      decodeResponse(() async {
        final json = await _api.get<Map<String, dynamic>>(
          '/products/$id/availability',
        );
        return ProductAvailability.fromJson(json);
      });

  @override
  Future<ReviewPage> fetchReviews(
    String id, {
    int page = 1,
    int perPage = 20,
  }) => decodeResponse(() async {
    final json = await _api.get<Map<String, dynamic>>(
      '/products/$id/reviews',
      query: {'page': page, 'per_page': perPage},
    );
    return ReviewPage.fromJson(json);
  });
}

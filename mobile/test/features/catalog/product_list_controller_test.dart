import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/domain/catalog_repository.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/providers/product_list_controller.dart';

/// In-memory catalog that mirrors the contract's filter/sort/paginate semantics
/// so the controller can be tested deterministically, without the network.
class _FakeCatalog implements CatalogRepository {
  _FakeCatalog({this.count = 15});

  final int count;
  late final List<Product> _all = List.generate(
    count,
    (i) => Product(
      id: 'p$i',
      categoryId: i.isEven ? 'a' : 'b',
      nameEn: i == 0 ? 'Special Widget' : 'Item $i',
      nameAr: 'منتج $i',
      salePrice: (i + 1) * 1000,
      ratingAvg: (i % 5) + 1,
      availableQty: 5,
    ),
  );

  @override
  Future<List<Category>> fetchCategories() async => const [];

  @override
  Future<Product> fetchProduct(String id) async =>
      _all.firstWhere((p) => p.id == id);

  @override
  Future<ProductAvailability> fetchAvailability(String id) async =>
      ProductAvailability(productId: id, inStock: true, availableQty: 5);

  @override
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) async {
    var items = _all.where((p) {
      if (categoryId != null && p.categoryId != categoryId) return false;
      if (minPrice != null && p.salePrice < minPrice) return false;
      if (maxPrice != null && p.salePrice > maxPrice) return false;
      if (query != null && query.trim().isNotEmpty) {
        if (!p.nameEn.toLowerCase().contains(query.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    }).toList();

    items = switch (sort) {
      'price_asc' => items..sort((a, b) => a.salePrice.compareTo(b.salePrice)),
      'price_desc' => items..sort((a, b) => b.salePrice.compareTo(a.salePrice)),
      'rating' => items..sort((a, b) => b.ratingAvg.compareTo(a.ratingAvg)),
      _ => items,
    };

    final total = items.length;
    final start = (page - 1) * perPage;
    final slice = start >= total
        ? <Product>[]
        : items.sublist(start, (start + perPage).clamp(0, total));
    return ProductPage(page: page, perPage: perPage, total: total, data: slice);
  }
}

const _q = ProductQuery();

/// Builds a container with a live subscription so the autoDispose controller
/// stays alive for the whole test, and returns (container, controller).
(ProviderContainer, ProductListController) _setup({int count = 15}) {
  final c = ProviderContainer(
    overrides: [
      catalogRepositoryProvider.overrideWithValue(_FakeCatalog(count: count)),
    ],
  );
  addTearDown(c.dispose);
  final sub = c.listen(productListControllerProvider(_q), (_, _) {});
  addTearDown(sub.close);
  return (c, c.read(productListControllerProvider(_q).notifier));
}

/// Waits for the in-flight fetch to finish, then returns the state.
Future<ProductListState> _settled(ProviderContainer c) async {
  var state = c.read(productListControllerProvider(_q));
  while (state.loadingInitial || state.loadingMore) {
    await Future<void>.delayed(const Duration(milliseconds: 1));
    state = c.read(productListControllerProvider(_q));
  }
  return state;
}

void main() {
  test('loads the first page then paginates to the end', () async {
    final (c, controller) = _setup(count: 15);

    var state = await _settled(c);
    expect(state.items.length, 8); // perPage
    expect(state.hasMore, isTrue);

    controller.loadMore();
    state = await _settled(c);
    expect(state.items.length, 15);
    expect(state.hasMore, isFalse);
  });

  test('search text filters the results', () async {
    final (c, controller) = _setup();
    await _settled(c);

    controller.updateQuery(const ProductQuery(text: 'Special'));
    final state = await _settled(c);
    expect(state.items.length, 1);
    expect(state.items.single.nameEn, 'Special Widget');
  });

  test('sort by price orders cheapest / dearest first', () async {
    final (c, controller) = _setup();
    await _settled(c);

    controller.updateQuery(const ProductQuery(sort: ProductSort.priceAsc));
    var state = await _settled(c);
    expect(state.items.first.salePrice, 1000);

    controller.updateQuery(const ProductQuery(sort: ProductSort.priceDesc));
    state = await _settled(c);
    expect(state.items.first.salePrice, 15000);
  });

  test('price filter narrows the range', () async {
    final (c, controller) = _setup();
    await _settled(c);

    controller.updateQuery(const ProductQuery(minPrice: 5000, maxPrice: 8000));
    final state = await _settled(c);
    // prices 5000, 6000, 7000, 8000 → 4 items.
    expect(state.items.length, 4);
    expect(
      state.items.every((p) => p.salePrice >= 5000 && p.salePrice <= 8000),
      isTrue,
    );
  });
}

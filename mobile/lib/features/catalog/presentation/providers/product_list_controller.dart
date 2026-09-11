import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/product.dart';
import 'catalog_providers.dart';

/// Sort options exposed by `GET /products` (`sort` query param).
abstract final class ProductSort {
  static const newest = 'newest';
  static const priceAsc = 'price_asc';
  static const priceDesc = 'price_desc';
  static const rating = 'rating';
}

/// The active search / filter / sort for a product listing. Also the family key
/// that seeds the listing (e.g. a category chosen on the home screen).
@immutable
class ProductQuery {
  const ProductQuery({
    this.text = '',
    this.categoryId,
    this.minPrice,
    this.maxPrice,
    this.onSale = false,
    this.sort = ProductSort.newest,
  });

  final String text;
  final String? categoryId;
  final num? minPrice;
  final num? maxPrice;
  final bool onSale;
  final String sort;

  ProductQuery copyWith({
    String? text,
    String? sort,
    bool? onSale,
    Object? categoryId = _keep,
    Object? minPrice = _keep,
    Object? maxPrice = _keep,
  }) => ProductQuery(
    text: text ?? this.text,
    sort: sort ?? this.sort,
    onSale: onSale ?? this.onSale,
    categoryId: categoryId == _keep ? this.categoryId : categoryId as String?,
    minPrice: minPrice == _keep ? this.minPrice : minPrice as num?,
    maxPrice: maxPrice == _keep ? this.maxPrice : maxPrice as num?,
  );

  static const _keep = Object();

  @override
  bool operator ==(Object other) =>
      other is ProductQuery &&
      other.text == text &&
      other.categoryId == categoryId &&
      other.minPrice == minPrice &&
      other.maxPrice == maxPrice &&
      other.onSale == onSale &&
      other.sort == sort;

  @override
  int get hashCode =>
      Object.hash(text, categoryId, minPrice, maxPrice, sort, onSale);
}

/// Accumulated listing state: the loaded page of products plus paging flags.
@immutable
class ProductListState {
  const ProductListState({
    required this.query,
    this.items = const [],
    this.loadingInitial = false,
    this.loadingMore = false,
    this.hasMore = true,
    this.page = 0,
    this.error,
  });

  final ProductQuery query;
  final List<Product> items;
  final bool loadingInitial;
  final bool loadingMore;
  final bool hasMore;
  final int page;
  final Object? error;

  bool get isEmpty => items.isEmpty && !loadingInitial && error == null;

  ProductListState copyWith({
    ProductQuery? query,
    List<Product>? items,
    bool? loadingInitial,
    bool? loadingMore,
    bool? hasMore,
    int? page,
    Object? error,
    bool clearError = false,
  }) => ProductListState(
    query: query ?? this.query,
    items: items ?? this.items,
    loadingInitial: loadingInitial ?? this.loadingInitial,
    loadingMore: loadingMore ?? this.loadingMore,
    hasMore: hasMore ?? this.hasMore,
    page: page ?? this.page,
    error: clearError ? null : (error ?? this.error),
  );
}

/// Drives a paginated, filterable product listing. Seeded by a [ProductQuery]
/// (the family key); further filter/sort/search changes go through
/// [updateQuery], and [loadMore] appends the next page.
class ProductListController
    extends AutoDisposeFamilyNotifier<ProductListState, ProductQuery> {
  static const _perPage = 8;
  int _requestId = 0;

  @override
  ProductListState build(ProductQuery arg) {
    ref.onDispose(() => _requestId++);
    _fetch(arg, page: 1, reset: true);
    return ProductListState(query: arg, loadingInitial: true);
  }

  /// Replace the active search/filter/sort and reload from page one.
  void updateQuery(ProductQuery next) {
    if (next == state.query) return;
    state = ProductListState(query: next, loadingInitial: true);
    _fetch(next, page: 1, reset: true);
  }

  /// Load the next page and append it.
  void loadMore() {
    final s = state;
    if (s.loadingInitial || s.loadingMore || !s.hasMore || s.error != null) {
      return;
    }
    state = s.copyWith(loadingMore: true);
    _fetch(s.query, page: s.page + 1, reset: false);
  }

  void retry() {
    if (state.loadingInitial || state.loadingMore) return;
    if (state.items.isEmpty) {
      _fetch(state.query, page: 1, reset: true);
    } else {
      state = state.copyWith(clearError: true);
      loadMore();
    }
  }

  Future<void> _fetch(
    ProductQuery query, {
    required int page,
    required bool reset,
  }) async {
    final requestId = ++_requestId;
    if (reset) {
      state = ProductListState(query: query, loadingInitial: true);
    }
    try {
      final result = await ref
          .read(catalogRepositoryProvider)
          .fetchProducts(
            query: query.text,
            categoryId: query.categoryId,
            minPrice: query.minPrice,
            maxPrice: query.maxPrice,
            onSale: query.onSale,
            sort: query.sort,
            page: page,
            perPage: _perPage,
          );
      // Ignore responses for a query the user has since changed.
      if (requestId != _requestId) return;
      state = state.copyWith(
        items: reset ? result.data : [...state.items, ...result.data],
        loadingInitial: false,
        loadingMore: false,
        page: page,
        hasMore: result.hasMore,
        clearError: true,
      );
    } catch (error) {
      if (requestId != _requestId) return;
      state = state.copyWith(
        loadingInitial: false,
        loadingMore: false,
        error: error,
      );
    }
  }
}

final productListControllerProvider =
    AutoDisposeNotifierProvider.family<
      ProductListController,
      ProductListState,
      ProductQuery
    >(ProductListController.new);

import '../../../../core/layout/app_layout.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../data/category.dart';
import '../providers/catalog_providers.dart';
import '../providers/product_list_controller.dart';
import '../widgets/product_card.dart';
import '../widgets/product_grid.dart';
import '../widgets/product_filters.dart';

/// Search + filter + sort listing with infinite pagination.
class ProductListScreen extends ConsumerStatefulWidget {
  const ProductListScreen({
    super.key,
    this.initialQuery = const ProductQuery(),
    this.parentCategoryId,
    this.offersOnly = false,
  });

  final ProductQuery initialQuery;

  /// A fixed discount scope, distinct from the optional Offers toggle.
  final bool offersOnly;

  /// Home browsing keeps this parent fixed while query.categoryId selects
  /// either the parent subtree (All) or one of its children.
  final String? parentCategoryId;

  @override
  ConsumerState<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends ConsumerState<ProductListScreen> {
  late final TextEditingController _search;
  Timer? _debounce;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _search = TextEditingController(text: widget.initialQuery.text);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  ProductQuery get _initialQuery => widget.offersOnly
      ? widget.initialQuery.copyWith(onSale: true)
      : widget.initialQuery;

  ProductListController get _controller =>
      ref.read(productListControllerProvider(_initialQuery).notifier);
  ProductQuery get _query =>
      ref.read(productListControllerProvider(_initialQuery)).query;

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _controller.updateQuery(_query.copyWith(text: value));
    });
  }

  void _selectCategory(String? id) {
    // Apply pending search text with the category in a single request.
    _debounce?.cancel();
    _controller.updateQuery(
      _query.copyWith(categoryId: id, text: _search.text),
    );
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  bool _onScroll(ScrollNotification n) {
    if (n.metrics.pixels >= n.metrics.maxScrollExtent - 400) {
      _controller.loadMore();
    }
    return false;
  }

  void _applyFilters(ProductQuery filters) {
    _debounce?.cancel();
    _controller.updateQuery(
      _query.copyWith(
        text: _search.text,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        sort: filters.sort,
        onSale: widget.offersOnly || filters.onSale,
      ),
    );
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  Future<void> _openFilters() async {
    final result = await showProductFilters(
      context,
      query: _query,
      offersOnly: widget.offersOnly,
    );
    if (mounted && result != null) _applyFilters(result);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(productListControllerProvider(_initialQuery));
    // A wide grid can fit the first page without scrolling. Fill that viewport
    // before relying on scroll notifications for subsequent pages.
    if (state.items.isNotEmpty &&
        state.hasMore &&
        !state.loadingInitial &&
        !state.loadingMore &&
        state.error == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted &&
            _scroll.hasClients &&
            _scroll.position.maxScrollExtent == 0) {
          _controller.loadMore();
        }
      });
    }
    final categorySource = widget.offersOnly
        ? offerCategoriesProvider
        : categoriesProvider;
    final hasCategoryRow = widget.offersOnly || widget.parentCategoryId != null;
    final categories = hasCategoryRow || _initialQuery.categoryId != null
        ? ref.watch(categorySource)
        : const AsyncData<List<Category>>([]);
    Category? findCategory(List<Category> nodes, String? id) {
      for (final node in nodes) {
        if (node.id == id) return node;
        final child = findCategory(node.children, id);
        if (child != null) return child;
      }
      return null;
    }

    final parent = findCategory(
      categories.asData?.value ?? [],
      widget.parentCategoryId ?? _initialQuery.categoryId,
    );
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.offersOnly
              ? l10n.homeOffersTitle
              : parent?.localizedName(
                      Localizations.localeOf(context).languageCode,
                    ) ??
                    l10n.homeSectionProducts,
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            ProductSearchBar(
              controller: _search,
              onChanged: _onSearchChanged,
              onFilters: _openFilters,
              filterCount: state.query.appliedFilterCount(
                offersOnly: widget.offersOnly,
              ),
            ),
            if (hasCategoryRow)
              categories.when(
                data: (list) {
                  if (widget.offersOnly) {
                    return list.isEmpty
                        ? const SizedBox.shrink()
                        : _CategoryFilters(
                            categories: list,
                            selectedId: state.query.categoryId,
                            onSelected: _selectCategory,
                          );
                  }
                  return parent == null || parent.children.isEmpty
                      ? const SizedBox.shrink()
                      : _CategoryFilters(
                          categories: parent.children,
                          allCategoryId: parent.id,
                          selectedId: state.query.categoryId,
                          onSelected: _selectCategory,
                        );
                },
                loading: () => Padding(
                  padding: AppLayout.pageInsets(
                    context,
                    top: 0,
                    bottom: AppSpacing.sm,
                  ),
                  child: const Skeleton.line(),
                ),
                error: (_, _) => TextButton.icon(
                  onPressed: () {
                    if (widget.offersOnly) ref.invalidate(categoriesProvider);
                    ref.invalidate(categorySource);
                  },
                  icon: const Icon(Icons.refresh),
                  label: Text(l10n.actionRetry),
                ),
              ),
            AppliedProductFilters(
              query: state.query,
              offersOnly: widget.offersOnly,
              onChanged: _applyFilters,
            ),
            Expanded(
              child: _Body(
                scroll: _scroll,
                state: state,
                onRetry: _controller.retry,
                onScroll: _onScroll,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryFilters extends StatelessWidget {
  const _CategoryFilters({
    required this.categories,
    this.allCategoryId,
    required this.selectedId,
    required this.onSelected,
  });
  final List<Category> categories;
  final String? allCategoryId;
  final String? selectedId;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    final lang = Localizations.localeOf(context).languageCode;
    Widget chip(String? id, String label) => Padding(
      padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
      child: ChoiceChip(
        key: ValueKey('product-category-${id ?? 'all'}'),
        label: Text(label),
        selected: selectedId == id,
        onSelected: (_) => onSelected(id),
      ),
    );
    return SingleChildScrollView(
      key: const ValueKey('product-subcategory-filters'),
      scrollDirection: Axis.horizontal,
      padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
      child: Row(
        children: [
          chip(allCategoryId, context.l10n.homeAllDepartments),
          for (final child in categories)
            chip(child.id, child.localizedName(lang)),
        ],
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.state,
    required this.onRetry,
    required this.onScroll,
    required this.scroll,
  });

  final ProductListState state;
  final ScrollController scroll;
  final VoidCallback onRetry;
  final bool Function(ScrollNotification) onScroll;

  @override
  Widget build(BuildContext context) {
    if (state.loadingInitial) {
      return CustomScrollView(
        physics: const NeverScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: AppLayout.pageInsets(context),
            sliver: ProductGridSliver(
              itemCount: 6,
              itemBuilder: (_, _) => const ProductCardSkeleton(),
            ),
          ),
        ],
      );
    }
    if ((state.error != null && state.items.isEmpty) || state.isEmpty) {
      // The keyboard and applied filters can leave a short results viewport.
      // Preserve centered states when they fit and allow scrolling otherwise.
      return CustomScrollView(
        slivers: [
          SliverFillRemaining(
            hasScrollBody: false,
            child: state.error != null
                ? AppErrorView(error: state.error, onRetry: onRetry)
                : AppEmptyView(
                    icon: Icons.search_off_outlined,
                    message: context.l10n.searchNoResults,
                  ),
          ),
        ],
      );
    }

    return NotificationListener<ScrollNotification>(
      onNotification: onScroll,
      child: CustomScrollView(
        controller: scroll,
        slivers: [
          SliverPadding(
            padding: AppLayout.pageInsets(context),
            sliver: ProductGridSliver(
              itemCount: state.items.length,
              itemBuilder: (context, i) {
                final product = state.items[i];
                return ProductCard(
                  product: product,
                  onTap: () => context.pushNamed(
                    AppRoutes.productName,
                    pathParameters: {'id': product.id},
                  ),
                );
              },
            ),
          ),
          if (state.loadingMore)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.xl),
                child: Center(child: CircularProgressIndicator()),
              ),
            ),
          if (state.error != null)
            SliverToBoxAdapter(
              child: AppErrorView(error: state.error, onRetry: onRetry),
            ),
        ],
      ),
    );
  }
}

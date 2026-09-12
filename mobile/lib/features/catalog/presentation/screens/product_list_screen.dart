import '../../../../core/layout/app_layout.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/state_views.dart';
import '../providers/product_list_controller.dart';
import '../widgets/product_card.dart';
import '../widgets/product_grid.dart';

/// Search + filter + sort listing with infinite pagination.
class ProductListScreen extends ConsumerStatefulWidget {
  const ProductListScreen({
    super.key,
    this.initialQuery = const ProductQuery(),
  });

  final ProductQuery initialQuery;

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

  ProductListController get _controller =>
      ref.read(productListControllerProvider(widget.initialQuery).notifier);
  ProductQuery get _query =>
      ref.read(productListControllerProvider(widget.initialQuery)).query;

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _controller.updateQuery(_query.copyWith(text: value));
    });
  }

  bool _onScroll(ScrollNotification n) {
    if (n.metrics.pixels >= n.metrics.maxScrollExtent - 400) {
      _controller.loadMore();
    }
    return false;
  }

  Future<void> _openFilters() async {
    final result = await showModalBottomSheet<({num? min, num? max})>(
      context: context,
      isScrollControlled: true,
      builder: (_) =>
          _PriceFilterSheet(min: _query.minPrice, max: _query.maxPrice),
    );
    if (result != null) {
      _controller.updateQuery(
        _query.copyWith(minPrice: result.min, maxPrice: result.max),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final state = ref.watch(productListControllerProvider(widget.initialQuery));
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
    final hasPriceFilter =
        state.query.minPrice != null || state.query.maxPrice != null;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _search,
          onChanged: _onSearchChanged,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: l10n.searchHint,
            prefixIcon: const Icon(Icons.search),
            border: InputBorder.none,
            filled: false,
          ),
        ),
        actions: [
          IconButton(
            onPressed: _openFilters,
            icon: Icon(
              hasPriceFilter ? Icons.filter_alt : Icons.filter_alt_outlined,
              color: hasPriceFilter ? colors.primary : null,
            ),
            tooltip: l10n.filtersTitle,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: _SortBar(
            onSale: state.query.onSale,
            onSaleChanged: (value) =>
                _controller.updateQuery(_query.copyWith(onSale: value)),
            sort: state.query.sort,
            onSelected: (s) =>
                _controller.updateQuery(_query.copyWith(sort: s)),
          ),
        ),
      ),
      body: _Body(
        scroll: _scroll,
        state: state,
        onRetry: _controller.retry,
        onScroll: _onScroll,
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
    if (state.error != null && state.items.isEmpty) {
      return AppErrorView(error: state.error, onRetry: onRetry);
    }
    if (state.isEmpty) {
      return AppEmptyView(
        icon: Icons.search_off_outlined,
        message: context.l10n.searchNoResults,
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

class _SortBar extends StatelessWidget {
  const _SortBar({
    required this.sort,
    required this.onSelected,
    required this.onSale,
    required this.onSaleChanged,
  });

  final String sort;
  final bool onSale;
  final ValueChanged<bool> onSaleChanged;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final options = <(String, String)>[
      (ProductSort.newest, l10n.sortNewest),
      (ProductSort.priceAsc, l10n.sortCheapest),
      (ProductSort.priceDesc, l10n.sortDearest),
      (ProductSort.rating, l10n.sortTopRated),
    ];
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
            child: FilterChip(
              label: Text(l10n.filterOnSale),
              selected: onSale,
              onSelected: onSaleChanged,
            ),
          ),
          for (final (value, label) in options)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
              child: ChoiceChip(
                label: Text(label),
                selected: sort == value,
                onSelected: (_) => onSelected(value),
              ),
            ),
        ],
      ),
    );
  }
}

class _PriceFilterSheet extends StatefulWidget {
  const _PriceFilterSheet({this.min, this.max});

  final num? min;
  final num? max;

  @override
  State<_PriceFilterSheet> createState() => _PriceFilterSheetState();
}

class _PriceFilterSheetState extends State<_PriceFilterSheet> {
  late final TextEditingController _min;
  late final TextEditingController _max;

  @override
  void initState() {
    super.initState();
    _min = TextEditingController(text: widget.min?.toString() ?? '');
    _max = TextEditingController(text: widget.max?.toString() ?? '');
  }

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  num? _parse(String v) => num.tryParse(v.trim());

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      child: Padding(
        padding: EdgeInsetsDirectional.only(
          start: AppLayout.pageHorizontal(context),
          end: AppLayout.pageHorizontal(context),
          top: AppSpacing.lg,
          bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.filterPrice, style: context.text.titleMedium),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _min,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: l10n.filterMin),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: TextField(
                    controller: _max,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: l10n.filterMax),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: AppButton(
                    label: l10n.filterClear,
                    variant: AppButtonVariant.secondary,
                    onPressed: () =>
                        Navigator.pop(context, (min: null, max: null)),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: AppButton(
                    label: l10n.filterApply,
                    onPressed: () => Navigator.pop(context, (
                      min: _parse(_min.text),
                      max: _parse(_max.text),
                    )),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

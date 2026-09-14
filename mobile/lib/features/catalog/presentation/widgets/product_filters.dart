import '../../../../core/utils/numeric_input_formatters.dart';
import '../../../../core/utils/numeric_text.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/components/input_theme.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../providers/product_list_controller.dart';

/// Sheet filters are part of the existing query; search/category remain scopes.
extension ProductQueryFilters on ProductQuery {
  int appliedFilterCount({required bool offersOnly}) =>
      (minPrice != null || maxPrice != null ? 1 : 0) +
      (sort != ProductSort.newest ? 1 : 0) +
      (onSale && !offersOnly ? 1 : 0);

  ProductQuery clearFilters({required bool offersOnly}) => copyWith(
    minPrice: null,
    maxPrice: null,
    sort: ProductSort.newest,
    onSale: offersOnly,
  );
}

List<(String, String)> _sortOptions(BuildContext context) => [
  (ProductSort.newest, context.l10n.sortNewest),
  (ProductSort.priceAsc, context.l10n.sortCheapest),
  (ProductSort.priceDesc, context.l10n.sortDearest),
  (ProductSort.rating, context.l10n.sortTopRated),
];

Future<ProductQuery?> showProductFilters(
  BuildContext context, {
  required ProductQuery query,
  required bool offersOnly,
}) {
  Widget editor() => ProductFilterEditor(query: query, offersOnly: offersOnly);
  if (AppLayout.isDesktop(context)) {
    return showDialog<ProductQuery>(
      context: context,
      builder: (_) => Dialog(
        child: SizedBox(width: AppLayout.productFilterWidth, child: editor()),
      ),
    );
  }
  return showModalBottomSheet<ProductQuery>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: editor(),
    ),
  );
}

class ProductSearchBar extends StatelessWidget {
  const ProductSearchBar({
    super.key,
    required this.controller,
    required this.onChanged,
    required this.onFilters,
    required this.filterCount,
  });
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onFilters;
  final int filterCount;

  @override
  Widget build(BuildContext context) => Padding(
    padding: AppLayout.pageInsets(context, top: 0, bottom: AppSpacing.sm),
    child: IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: TextField(
              key: const ValueKey('product-search-field'),
              controller: controller,
              onChanged: onChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: context.l10n.searchHint,
                prefixIcon: const Icon(Icons.search),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          SizedBox(
            width: kMinInteractiveDimension,
            child: Tooltip(
              message: context.l10n.filtersTitle,
              child: OutlinedButton(
                key: const ValueKey('product-filter-button'),
                style: InputTheme.productFilterButton(context.colors),
                onPressed: onFilters,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const Center(child: Icon(Icons.filter_alt_outlined)),
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: FractionallySizedBox(
                          // An independent overlay slot below the exact center.
                          // Large text scales down only if it exceeds this slot.
                          heightFactor: 0.5,
                          widthFactor: 1,
                          child: Padding(
                            padding: const EdgeInsetsDirectional.only(
                              start: InputTheme.productFilterBadgeEndInset,
                              end: InputTheme.productFilterBadgeEndInset,
                              bottom: InputTheme.productFilterBadgeBottomInset,
                            ),
                            child: Align(
                              alignment: AlignmentDirectional.bottomEnd,
                              child: FittedBox(
                                key: const ValueKey(
                                  'product-filter-badge-bounds',
                                ),
                                fit: BoxFit.scaleDown,
                                child: Badge.count(
                                  key: const ValueKey('product-filter-badge'),
                                  count: filterCount,
                                  isLabelVisible: filterCount > 0,
                                  largeSize: AppSpacing.lg,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: AppSpacing.xxs,
                                  ),
                                  textStyle:
                                      InputTheme.productFilterBadgeTextStyle(
                                        context.text,
                                      ),
                                  backgroundColor: context.colors.primary,
                                  textColor: context.colors.onPrimary,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class AppliedProductFilters extends StatelessWidget {
  const AppliedProductFilters({
    super.key,
    required this.query,
    required this.offersOnly,
    required this.onChanged,
  });
  final ProductQuery query;
  final bool offersOnly;
  final ValueChanged<ProductQuery> onChanged;

  @override
  Widget build(BuildContext context) {
    final count = query.appliedFilterCount(offersOnly: offersOnly);
    if (count == 0) return const SizedBox.shrink();
    final l10n = context.l10n;
    final numbers = NumberFormat.decimalPattern('en');
    String priceLabel() {
      if (query.minPrice != null && query.maxPrice != null) {
        return l10n.productFilterPriceRange(
          numbers.format(query.minPrice),
          numbers.format(query.maxPrice),
        );
      }
      return query.minPrice != null
          ? l10n.productFilterPriceFrom(numbers.format(query.minPrice))
          : l10n.productFilterPriceTo(numbers.format(query.maxPrice));
    }

    Widget chip(String key, String label, ProductQuery next) => Padding(
      padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
      child: InputChip(
        key: ValueKey('applied-filter-$key'),
        label: Text(label),
        onDeleted: () => onChanged(next),
      ),
    );
    return SingleChildScrollView(
      key: const ValueKey('product-applied-filters'),
      scrollDirection: Axis.horizontal,
      padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
      child: Row(
        children: [
          if (query.minPrice != null || query.maxPrice != null)
            chip(
              'price',
              priceLabel(),
              query.copyWith(minPrice: null, maxPrice: null),
            ),
          if (query.sort != ProductSort.newest)
            chip(
              'sort',
              _sortOptions(context).firstWhere((o) => o.$1 == query.sort).$2,
              query.copyWith(sort: ProductSort.newest),
            ),
          if (query.onSale && !offersOnly)
            chip(
              'offers',
              l10n.productFiltersOffersOnly,
              query.copyWith(onSale: false),
            ),
          if (count > 1)
            TextButton(
              key: const ValueKey('applied-filters-clear'),
              onPressed: () =>
                  onChanged(query.clearFilters(offersOnly: offersOnly)),
              child: Text(l10n.productFiltersClearAll),
            ),
        ],
      ),
    );
  }
}

/// Local drafts use ProductQuery too. No provider is changed before Apply.
class ProductFilterEditor extends StatefulWidget {
  const ProductFilterEditor({
    super.key,
    required this.query,
    required this.offersOnly,
  });
  final ProductQuery query;
  final bool offersOnly;
  @override
  State<ProductFilterEditor> createState() => _ProductFilterEditorState();
}

class _ProductFilterEditorState extends State<ProductFilterEditor> {
  late ProductQuery _draft = widget.query;
  late final _min = TextEditingController(
    text: MoneyText.fromNumber(widget.query.minPrice),
  );
  late final _max = TextEditingController(
    text: MoneyText.fromNumber(widget.query.maxPrice),
  );

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  void _clear() => setState(() {
    _draft = _draft.clearFilters(offersOnly: widget.offersOnly);
    _min.clear();
    _max.clear();
  });

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(
              AppSpacing.lg,
              AppSpacing.sm,
              AppSpacing.sm,
              0,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.filtersTitle,
                    style: context.text.titleLarge,
                  ),
                ),
                CloseButton(key: const ValueKey('product-filters-close')),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.productFiltersSort,
                      style: context.text.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xs,
                      children: [
                        for (final (value, label) in _sortOptions(context))
                          ChoiceChip(
                            key: ValueKey('filter-sort-$value'),
                            label: Text(label),
                            selected: _draft.sort == value,
                            onSelected: (_) => setState(
                              () => _draft = _draft.copyWith(sort: value),
                            ),
                          ),
                      ],
                    ),
                    const Divider(height: AppSpacing.xxl),
                    Text(l10n.filterPrice, style: context.text.titleMedium),
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            key: const ValueKey('filter-min-price'),
                            controller: _min,
                            inputFormatters: const [MoneyInputFormatter()],
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: InputDecoration(
                              labelText: l10n.filterMin,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: TextField(
                            key: const ValueKey('filter-max-price'),
                            controller: _max,
                            inputFormatters: const [MoneyInputFormatter()],
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: InputDecoration(
                              labelText: l10n.filterMax,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (!widget.offersOnly) ...[
                      const Divider(height: AppSpacing.xxl),
                      Text(l10n.filterOnSale, style: context.text.titleMedium),
                      const SizedBox(height: AppSpacing.sm),
                      FilterChip(
                        key: const ValueKey('filter-offers-only'),
                        label: Text(l10n.productFiltersOffersOnly),
                        selected: _draft.onSale,
                        onSelected: (value) => setState(
                          () => _draft = _draft.copyWith(onSale: value),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Row(
              children: [
                Expanded(
                  child: AppButton(
                    key: const ValueKey('product-filters-clear'),
                    label: l10n.productFiltersClearAll,
                    variant: AppButtonVariant.secondary,
                    onPressed: _clear,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: AppButton(
                    key: const ValueKey('product-filters-apply'),
                    label: l10n.productFiltersShowResults,
                    onPressed: () => Navigator.pop(
                      context,
                      _draft.copyWith(
                        minPrice: MoneyText.tryParse(_min.text),
                        maxPrice: MoneyText.tryParse(_max.text),
                        onSale: widget.offersOnly || _draft.onSale,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_motion.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/state_views.dart';
import '../../data/category.dart';
import '../providers/catalog_providers.dart';
import '../widgets/category_icon.dart';

/// Departments browse — the two-pane master/detail pattern shoppers know from
/// large retail apps: a rail of top-level departments on one side, and the
/// selected department's subcategories on the other. Selecting a department
/// only swaps the detail pane; tapping "browse all" or a subcategory opens the
/// product list filtered to it.
class CategoriesScreen extends ConsumerStatefulWidget {
  const CategoriesScreen({super.key});

  @override
  ConsumerState<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends ConsumerState<CategoriesScreen> {
  String? _selectedId;
  String? _selectedChildId;

  void _openList(String categoryId) => context.pushNamed(
    AppRoutes.searchName,
    queryParameters: {'category_id': categoryId},
  );

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.categoriesTitle)),
      body: AsyncValueView(
        value: categories,
        onRetry: () => ref.invalidate(categoriesProvider),
        builder: (context, list) {
          if (list.isEmpty) return const AppEmptyView();

          // Keep the selection valid even if the list changes underneath us.
          final selected = list.firstWhere(
            (c) => c.id == _selectedId,
            orElse: () => list.first,
          );

          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _CategoryRail(
                categories: list,
                selectedId: selected.id,
                onSelected: (id) => setState(() {
                  _selectedId = id;
                  _selectedChildId = null;
                }),
              ),
              Expanded(
                child: _CategoryDetail(
                  category: selected,
                  onBrowseAll: () => _openList(selected.id),
                  selectedChildId: _selectedChildId,
                  onSubcategory: (id) {
                    setState(() => _selectedChildId = id);
                    _openList(id);
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// The vertical rail of top-level departments.
class _CategoryRail extends StatelessWidget {
  const _CategoryRail({
    required this.categories,
    required this.selectedId,
    required this.onSelected,
  });

  final List<Category> categories;
  final String selectedId;
  final ValueChanged<String> onSelected;

  static const double width = 100;

  @override
  Widget build(BuildContext context) {
    return Container(
      width:
          AppBreakpoints.classify(MediaQuery.sizeOf(context).width).index >=
              AppWindowClass.compactDesktop.index
          ? AppLayout.categoryRailWidth
          : width,
      color: context.colors.surfaceAlt,
      child: ListView.builder(
        padding: EdgeInsets.zero,
        itemCount: categories.length,
        itemBuilder: (context, i) {
          final c = categories[i];
          return _RailItem(
            key: ValueKey('cat-rail-${c.id}'),
            category: c,
            selected: c.id == selectedId,
            onTap: () => onSelected(c.id),
          );
        },
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem({
    super.key,
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final Category category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    return InkWell(
      onTap: onTap,
      child: AnimatedContainer(
        duration: AppMotion.fast,
        curve: AppMotion.standard,
        // The selected item shares the detail pane's surface; its icon and
        // label carry the selection colour without a dividing border.
        decoration: BoxDecoration(
          color: selected ? colors.surface : colors.surfaceAlt,
        ),
        padding: const EdgeInsets.symmetric(
          vertical: AppSpacing.lg,
          horizontal: AppSpacing.sm,
        ),
        child: Column(
          children: [
            Icon(
              categoryIconFor(category.icon),
              size: AppLayout.categoryIconSize,
              color: selected ? colors.primary : colors.textMuted,
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              category.localizedName(lang),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: context.text.labelMedium?.copyWith(
                height: 1.2,
                color: selected ? colors.primaryDark : colors.textSecondary,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The detail pane: the selected department's name, a browse-all action and a
/// grid of its subcategories.
class _CategoryDetail extends StatelessWidget {
  const _CategoryDetail({
    required this.category,
    required this.onBrowseAll,
    required this.onSubcategory,
    required this.selectedChildId,
  });

  final Category category;
  final VoidCallback onBrowseAll;
  final ValueChanged<String> onSubcategory;
  final String? selectedChildId;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    return ColoredBox(
      color: colors.surface,
      child: ListView(
        // A key so switching department resets the scroll to the top.
        key: ValueKey('cat-detail-${category.id}'),
        padding: AppLayout.pageInsets(context),
        children: [
          Text(category.localizedName(lang), style: context.text.titleLarge),
          const SizedBox(height: AppSpacing.md),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: ResponsiveContent(
              maxWidth: AppLayout.readingWidth,
              child: _BrowseAllTile(
                label: context.l10n.categoriesBrowseAll,
                onTap: onBrowseAll,
              ),
            ),
          ),
          if (category.children.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Wrap(
              spacing: AppSpacing.md,
              runSpacing: AppSpacing.md,
              children: [
                for (final sub in category.children)
                  _SubcategoryTile(
                    key: ValueKey('cat-sub-${sub.id}'),
                    category: sub,
                    selected: sub.id == selectedChildId,
                    onTap: () => onSubcategory(sub.id),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _BrowseAllTile extends StatelessWidget {
  const _BrowseAllTile({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Material(
      color: colors.primarySoft,
      borderRadius: AppRadii.mdAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          child: Row(
            children: [
              Icon(
                Icons.grid_view_rounded,
                size: 20,
                color: colors.primaryDark,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  label,
                  style: context.text.labelLarge?.copyWith(
                    color: colors.primaryDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Icon(
                // Material mirrors this forward chevron automatically in RTL.
                Icons.chevron_right,
                size: 20,
                color: colors.primaryDark,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SubcategoryTile extends StatelessWidget {
  const _SubcategoryTile({
    super.key,
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final Category category;
  final bool selected;
  final VoidCallback onTap;

  static const double width = 96;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    return SizedBox(
      width:
          AppBreakpoints.classify(MediaQuery.sizeOf(context).width) ==
              AppWindowClass.mobile
          ? width
          : AppLayout.categoryRailWidth,
      child: Semantics(
        selected: selected,
        child: Material(
          color: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: AppRadii.mdAll,
            side: BorderSide(
              color: selected ? colors.primary : colors.primaryLight,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                vertical: AppSpacing.md,
                horizontal: AppSpacing.sm,
              ),
              child: Column(
                children: [
                  SizedBox(
                    width: AppLayout.categoryIconTarget,
                    height: AppLayout.categoryIconTarget,
                    child: Icon(
                      categoryIconFor(category.icon),
                      size: AppLayout.categoryIconSize,
                      color: colors.primary,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    category.localizedName(lang),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.labelMedium?.copyWith(
                      color: colors.textPrimary,
                      fontWeight: selected ? FontWeight.w700 : null,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

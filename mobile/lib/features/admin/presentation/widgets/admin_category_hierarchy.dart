import 'package:flutter/material.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../domain/admin_category_tree.dart';
import '../../domain/admin_repository.dart';
import '../../../catalog/presentation/widgets/category_icon.dart';

/// One route shows the roots or selected branch, with cards fitting the space
/// and an explicit way back at every window size.
class AdminCategoryHierarchy extends StatelessWidget {
  const AdminCategoryHierarchy({
    super.key,
    required this.records,
    required this.selectedId,
    required this.onSelected,
    required this.onRefresh,
    this.onEdit,
    this.onDelete,
    this.onAddChild,
  });
  final List<AdminRecord> records;
  final String? selectedId;
  final ValueChanged<String?> onSelected;
  final Future<void> Function() onRefresh;
  final ValueChanged<AdminRecord>? onEdit, onDelete, onAddChild;

  @override
  Widget build(BuildContext context) {
    final tree = AdminCategoryTree(records);
    final selected = tree.byId[selectedId];
    Widget roots() => RefreshIndicator(
      onRefresh: onRefresh,
      child: tree.roots.isEmpty
          ? CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: AppEmptyView(
                    title: context.l10n.adminEmpty,
                    message: '',
                  ),
                ),
              ],
            )
          : ResponsiveCardList(
              key: const ValueKey('admin-category-roots'),
              physics: const AlwaysScrollableScrollPhysics(),
              padding: AppLayout.pageInsets(
                context,
                bottom: AppSpacing.xxxl * 2,
              ),
              itemCount: tree.roots.length,
              itemBuilder: (context, i) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: _card(context, tree, tree.roots[i], isRoot: true),
              ),
            ),
    );
    Widget branch() {
      if (selected == null) {
        return AppEmptyView(message: context.l10n.adminChooseCategory);
      }
      final children = tree.children(selected.id);
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: CustomScrollView(
          key: ValueKey('admin-category-branch-${selected.id}'),
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: AppLayout.pageInsets(context),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextButton.icon(
                      key: const ValueKey('admin-category-back'),
                      onPressed: () =>
                          onSelected(tree.byId[selected.text('parent_id')]?.id),
                      icon: const BackButtonIcon(),
                      label: Text(
                        selected.text('parent_id').isEmpty
                            ? context.l10n.adminBackToCategories
                            : tree.byId[selected.text('parent_id')]?.label(
                                    Localizations.localeOf(
                                      context,
                                    ).languageCode,
                                  ) ??
                                  context.l10n.adminBackToCategories,
                      ),
                    ),
                    Text(
                      tree.label(
                        selected.id,
                        Localizations.localeOf(context).languageCode,
                      ),
                      style: context.text.titleMedium,
                      key: const ValueKey('admin-category-path'),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    ResponsiveContent(
                      alignment: AlignmentDirectional.topStart,
                      child: _card(
                        context,
                        tree,
                        selected,
                        isRoot: false,
                        selected: true,
                      ),
                    ),
                    if (onAddChild != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.sm),
                        child: OutlinedButton.icon(
                          key: const ValueKey('admin-add-subcategory'),
                          onPressed: () => onAddChild!(selected),
                          icon: const Icon(Icons.add),
                          label: Text(context.l10n.adminAddSubcategory),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            if (children.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: AppEmptyView(
                  title: context.l10n.adminEmpty,
                  message: '',
                ),
              )
            else
              SliverPadding(
                padding: AppLayout.pageInsets(
                  context,
                  top: 0,
                  bottom: AppSpacing.xxxl * 2,
                ),
                sliver: ResponsiveCardSliver(
                  itemCount: children.length,
                  itemBuilder: (context, i) =>
                      _card(context, tree, children[i], isRoot: false),
                ),
              ),
          ],
        ),
      );
    }

    return PopScope(
      canPop: selected == null,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && selected != null) {
          onSelected(tree.byId[selected.text('parent_id')]?.id);
        }
      },
      child: selected == null ? roots() : branch(),
    );
  }

  Widget _card(
    BuildContext context,
    AdminCategoryTree tree,
    AdminRecord record, {
    required bool isRoot,
    bool selected = false,
  }) {
    final l = context.l10n;
    final count = tree.children(record.id).length;
    return AppCard(
      key: ValueKey(
        'admin-category-${selected ? 'selected-' : ''}${record.id}',
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                categoryIconFor(
                  record.text('icon'),
                  iconKey:
                      (record.json['icon_key'] ?? record.json['mock_icon_key'])
                          as String?,
                ),
                color: context.colors.primary,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  record.label(Localizations.localeOf(context).languageCode),
                  style: context.text.titleSmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            l.adminDisplayOrderValue(
              record.text('sort_order').isEmpty
                  ? '0'
                  : record.text('sort_order'),
            ),
            key: ValueKey(
              'admin-category-order-${selected ? 'selected-' : ''}${record.id}',
            ),
            style: context.text.bodySmall,
          ),
          Text(
            record.flag('is_visible', record.flag('is_active', true))
                ? l.categoryVisible
                : l.adminInactive,
            style: context.text.bodySmall,
          ),
          if (isRoot || count > 0 || selected)
            Text(
              l.adminSubcategoryCount('$count'),
              style: context.text.bodySmall,
            ),
          Wrap(
            spacing: AppSpacing.sm,
            children: [
              if (!selected && (isRoot || count > 0))
                TextButton(
                  key: ValueKey('admin-category-open-${record.id}'),
                  onPressed: () => onSelected(record.id),
                  child: Text(l.adminViewSubcategories),
                ),
              if (onEdit != null)
                TextButton.icon(
                  onPressed: () => onEdit!(record),
                  icon: const Icon(Icons.edit_outlined),
                  label: Text(l.adminEdit),
                ),
              if (onDelete != null)
                TextButton.icon(
                  onPressed: () => onDelete!(record),
                  icon: const Icon(Icons.delete_outline),
                  label: Text(l.actionDelete),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Match the list/branch composition while the complete category tree loads.
class AdminCategoryHierarchySkeleton extends StatelessWidget {
  const AdminCategoryHierarchySkeleton({super.key});
  @override
  Widget build(BuildContext context) => Padding(
    padding: AppLayout.pageInsets(context),
    child: const SkeletonCardList(minItemWidth: AppLayout.cardMinWidth),
  );
}

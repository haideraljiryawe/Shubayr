import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../domain/admin_category_tree.dart';
import '../../domain/admin_repository.dart';
import '../providers/admin_providers.dart';

/// Reuses the complete category lookup, including hidden branches. Querying
/// products stays paginated in the repository and combines scope with search.
class AdminProductScopeField extends ConsumerWidget {
  const AdminProductScopeField({
    super.key,
    required this.mainId,
    required this.childId,
    required this.onChanged,
    this.subcategory = false,
  });
  final String? mainId, childId;
  final bool subcategory;
  final void Function(String? mainId, String? childId) onChanged;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const query = AdminQuery(AdminResource.categories);
    return AsyncValueView(
      value: ref.watch(adminLookupsProvider(query)),
      loading: const Skeleton.line(),
      onRetry: () => ref.invalidate(adminLookupsProvider(query)),
      builder: (context, records) {
        final tree = AdminCategoryTree(records);
        final l = context.l10n;
        final options = subcategory ? tree.children(mainId ?? '') : tree.roots;
        final selected = subcategory ? childId : mainId;
        final values = {
          for (final option in options)
            option.id: option.label(
              Localizations.localeOf(context).languageCode,
            ),
        };
        if (selected != null && !values.containsKey(selected)) {
          values[selected] = selected;
        }
        return DropdownButtonFormField<String>(
          key: ValueKey(
            'admin-product-${subcategory ? 'child' : 'main'}-$selected',
          ),
          initialValue: selected ?? '',
          isExpanded: true,
          decoration: InputDecoration(
            labelText: subcategory
                ? l.adminSubcategoryFilter
                : l.adminMainCategoryFilter,
          ),
          items: [
            DropdownMenuItem(
              value: '',
              child: Text(
                subcategory ? l.adminAllSubcategories : l.adminAllProducts,
              ),
            ),
            for (final entry in values.entries)
              DropdownMenuItem(
                value: entry.key,
                child: Text(
                  entry.value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: subcategory && mainId == null
              ? null
              : (value) {
                  final id = value == '' ? null : value;
                  if (subcategory) {
                    onChanged(mainId, id);
                  } else {
                    onChanged(id, null);
                  }
                },
        );
      },
    );
  }
}

class AdminProductScopeSummary extends ConsumerWidget {
  const AdminProductScopeSummary({super.key, required this.categoryId});
  final String? categoryId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final records =
        ref
            .watch(
              adminLookupsProvider(const AdminQuery(AdminResource.categories)),
            )
            .value ??
        [];
    final tree = AdminCategoryTree(records);
    final label = categoryId == null
        ? context.l10n.adminAllProducts
        : tree.label(categoryId!, Localizations.localeOf(context).languageCode);
    return Text(
      context.l10n.adminProductScope(label.isEmpty ? categoryId! : label),
      key: const ValueKey('admin-product-scope'),
    );
  }
}

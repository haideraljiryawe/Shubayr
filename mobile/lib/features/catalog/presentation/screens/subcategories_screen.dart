import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../data/category.dart';
import '../providers/catalog_providers.dart';
import '../widgets/category_icon.dart';

class SubcategoriesScreen extends ConsumerWidget {
  const SubcategoriesScreen({super.key, required this.categoryId});
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);
    Category? parentIn(List<Category>? list) =>
        list?.where((category) => category.id == categoryId).firstOrNull;
    final parent = parentIn(categories.asData?.value);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          parent?.localizedName(Localizations.localeOf(context).languageCode) ??
              context.l10n.categoriesTitle,
        ),
      ),
      body: SafeArea(
        top: false,
        child: AsyncValueView(
          value: categories,
          onRetry: () => ref.invalidate(categoriesProvider),
          loading: const _SubcategoryGrid(),
          builder: (context, list) {
            final category = parentIn(list);
            if (category == null) {
              return AppEmptyView(title: context.l10n.routeNotFoundTitle);
            }
            if (category.children.isEmpty) return const AppEmptyView();
            return _SubcategoryGrid(children: category.children);
          },
        ),
      ),
    );
  }
}

/// Null children represent the same grid geometry while the tree loads.
class _SubcategoryGrid extends StatelessWidget {
  const _SubcategoryGrid({this.children});
  final List<Category>? children;

  @override
  Widget build(BuildContext context) => ResponsiveCardList(
    phoneColumns: 3,
    minItemWidth: AppLayout.subcategoryMinWidth,
    itemCount: children?.length ?? 6,
    itemBuilder: (context, index) => LayoutBuilder(
      builder: (context, constraints) {
        final labelStyle = context.text.labelMedium!;
        // Keep squares at normal scale, allowing two lines and a full touch
        // target to grow vertically at accessibility text sizes.
        final height = math.max(
          constraints.maxWidth,
          AppSpacing.md * 2 +
              AppLayout.categoryIconSize +
              AppSpacing.sm +
              MediaQuery.textScalerOf(context).scale(labelStyle.fontSize!) *
                  (labelStyle.height ?? 1) *
                  2,
        );
        final category = children?[index];
        if (category == null) {
          return Skeleton(height: height, borderRadius: AppRadii.mdAll);
        }
        return ConstrainedBox(
          key: ValueKey('cat-sub-${category.id}'),
          constraints: BoxConstraints(minHeight: height),
          child: Material(
            color: context.colors.categoryTile,
            borderRadius: AppRadii.mdAll,
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => context.pushNamed(
                AppRoutes.searchName,
                queryParameters: {'category_id': category.id},
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  vertical: AppSpacing.md,
                  horizontal: AppSpacing.sm,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      categoryIconFor(category.icon, categoryId: category.id),
                      size: AppLayout.categoryIconSize,
                      color: context.colors.primary,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      category.localizedName(
                        Localizations.localeOf(context).languageCode,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: labelStyle.copyWith(
                        color: context.colors.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    ),
  );
}

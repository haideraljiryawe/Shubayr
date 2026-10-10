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
import '../providers/product_list_controller.dart';
import '../widgets/category_icon.dart';
import '../widgets/catalog_image_view.dart';
import 'product_list_screen.dart';

class SubcategoriesScreen extends ConsumerWidget {
  const SubcategoriesScreen({super.key, required this.categoryId});
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);
    Category? parentIn(List<Category>? list) =>
        list?.where((category) => category.id == categoryId).firstOrNull;
    final parent = parentIn(categories.asData?.value);
    if (parent != null) {
      return ProductListScreen(
        key: ValueKey('category-products-${parent.id}'),
        initialQuery: ProductQuery(categoryId: parent.id),
        categoryHeaderSliver: parent.children.isEmpty
            ? null
            : _SubcategoryGrid(children: parent.children),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(
          parent?.localizedName(Localizations.localeOf(context).languageCode) ??
              context.l10n.categoriesTitle,
        ),
      ),
      body: SafeArea(
        top: false,
        bottom: BottomNavigationInset.of(context) == 0,
        child: AsyncValueView(
          value: categories,
          onRetry: () => ref.invalidate(categoriesProvider),
          loading: CustomScrollView(
            slivers: [
              const _SubcategoryGrid(),
              SliverToBoxAdapter(
                child: SizedBox(height: BottomNavigationInset.of(context)),
              ),
            ],
          ),
          builder: (context, list) {
            final category = parentIn(list);
            if (category == null) {
              return AppEmptyView(title: context.l10n.routeNotFoundTitle);
            }
            if (category.children.isEmpty) return const AppEmptyView();
            return CustomScrollView(
              slivers: [
                _SubcategoryGrid(children: category.children),
                SliverToBoxAdapter(
                  child: SizedBox(height: BottomNavigationInset.of(context)),
                ),
              ],
            );
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
  Widget build(BuildContext context) => SliverPadding(
    padding: AppLayout.pageInsets(context),
    sliver: ResponsiveCardSliver(
      phoneColumns: 3,
      minItemWidth: AppLayout.subcategoryMinWidth,
      itemCount: children?.length ?? 6,
      itemKeyBuilder: children == null ? null : (i) => children![i].id,
      itemBuilder: (context, index) {
        final labelStyle = context.text.labelMedium!.copyWith(
          color: context.colors.textPrimary,
        );
        final labelHeight = context.textLineHeight(labelStyle) * 2;
        final category = children?[index];
        if (category == null) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AspectRatio(
                aspectRatio: 1,
                child: Skeleton(borderRadius: AppRadii.mdAll),
              ),
              const SizedBox(height: AppSpacing.sm),
              SizedBox(
                height: labelHeight,
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                  child: Column(
                    children: [
                      Expanded(child: Skeleton.line()),
                      SizedBox(height: AppSpacing.xs),
                      Expanded(child: Skeleton.line()),
                    ],
                  ),
                ),
              ),
            ],
          );
        }
        final fallback = Center(
          child: Icon(
            categoryIconFor(
              null,
              categoryId: category.id,
              iconKey: category.iconKey,
            ),
            size: AppLayout.categoryIconSize,
            color: context.colors.primary,
          ),
        );
        return Material(
          key: ValueKey('cat-sub-${category.id}'),
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: AppRadii.mdAll,
            onTap: () => context.pushNamed(
              AppRoutes.searchName,
              queryParameters: {'category_id': category.id},
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AspectRatio(
                  aspectRatio: 1,
                  child: Ink(
                    key: ValueKey('cat-sub-artwork-${category.id}'),
                    decoration: BoxDecoration(
                      color: context.colors.surface,
                      borderRadius: AppRadii.mdAll,
                      border: Border.all(color: context.colors.border),
                    ),
                    child: ClipRRect(
                      borderRadius: AppRadii.mdAll,
                      child: ExcludeSemantics(
                        child: CatalogImageView(
                          image: category.image,
                          placeholder: fallback,
                          loading: fallback,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                SizedBox(
                  height: labelHeight,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                    ),
                    child: Text(
                      category.localizedName(
                        Localizations.localeOf(context).languageCode,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: labelStyle,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

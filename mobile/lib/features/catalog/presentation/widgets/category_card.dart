import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/layout/app_layout.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/theme/tokens/app_shadows.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../data/category.dart';
import 'category_icon.dart';

/// Temporary artwork stays in presentation, keyed by the stable category ID.
String categoryImageUrl(String id) =>
    'https://picsum.photos/seed/${Uri.encodeComponent('shubayr-category-$id')}/400/400';

double _cardHeight(BuildContext context) {
  final style = context.text.titleMedium!;
  return math.max(
    AppLayout.categoryCardHeight,
    MediaQuery.textScalerOf(context).scale(style.fontSize!) *
            (style.height ?? 1) *
            2 +
        AppSpacing.lg * 2,
  );
}

class CategoryCard extends StatelessWidget {
  const CategoryCard({super.key, required this.category, required this.onTap});
  final Category category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final name = category.localizedName(
      Localizations.localeOf(context).languageCode,
    );
    Widget fallback() => ColoredBox(
      color: colors.surfaceAlt,
      child: Center(
        child: Icon(
          categoryIconFor(category.icon, categoryId: category.id),
          color: colors.textMuted,
          size: AppLayout.categoryIconSize,
        ),
      ),
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: AppRadii.lgAll,
        boxShadow: AppShadows.level1,
      ),
      child: Material(
        color: colors.surface,
        borderRadius: AppRadii.lgAll,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: _cardHeight(context),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.titleMedium,
                      ),
                    ),
                  ),
                ),
                // Row follows Directionality. The outer Material clips only the
                // card's outer corners; the image/text seam remains square.
                Expanded(
                  child: ExcludeSemantics(
                    child: CachedNetworkImage(
                      key: ValueKey('cat-image-${category.id}'),
                      imageUrl: categoryImageUrl(category.id),
                      fit: BoxFit.cover,
                      placeholder: (_, _) => fallback(),
                      errorWidget: (_, _, _) => fallback(),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class CategoryCardSkeleton extends StatelessWidget {
  const CategoryCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: AppRadii.lgAll,
    child: SizedBox(
      height: _cardHeight(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Expanded(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.lg),
              child: Center(child: Skeleton.line()),
            ),
          ),
          const Expanded(child: Skeleton(borderRadius: BorderRadius.zero)),
        ],
      ),
    ),
  );
}

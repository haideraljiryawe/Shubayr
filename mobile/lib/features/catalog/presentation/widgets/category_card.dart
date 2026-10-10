import 'dart:math' as math;

import '../../data/media/catalog_image.dart';
import 'catalog_image_view.dart';
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
  const CategoryCard({
    super.key,
    required this.category,
    required this.onTap,
    this.description,
    this.legacyMockArtwork = false,
  });
  final Category category;
  final bool legacyMockArtwork;
  final String? description;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final name = category.localizedName(
      Localizations.localeOf(context).languageCode,
    );
    final subtitle = description?.trim();
    final hasDescription = subtitle != null && subtitle.isNotEmpty;
    Widget fallback() => ColoredBox(
      color: colors.surfaceAlt,
      child: Center(
        child: Icon(
          !legacyMockArtwork
              ? Icons.image_outlined
              : categoryIconFor(
                  null,
                  categoryId: category.id,
                  iconKey: category.iconKey,
                ),
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
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(color: colors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: LayoutBuilder(
            builder: (context, constraints) => ConstrainedBox(
              constraints: BoxConstraints(minHeight: _cardHeight(context)),
              // Grow only when the text really needs more room (e.g. text
              // scaling). Positioned artwork does not determine intrinsic height.
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        child: Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.titleMedium,
                              ),
                              if (hasDescription) ...[
                                const SizedBox(height: AppSpacing.xs),
                                Text(
                                  subtitle,
                                  key: ValueKey(
                                    'cat-description-${category.id}',
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: context.text.bodySmall?.copyWith(
                                    // This two-line preview shares a narrow
                                    // card with artwork; keep its compact size.
                                    fontSize:
                                        context.text.labelMedium?.fontSize,
                                    color: colors.textSecondary,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                    // Directionality keeps artwork left in Arabic, right in
                    // English. Only the outer Material rounds the corners.
                    SizedBox(
                      width:
                          constraints.maxWidth *
                          AppLayout.categoryCardImageFraction,
                      child: ExcludeSemantics(
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: CatalogImageView(
                                key: ValueKey('cat-image-${category.id}'),
                                image:
                                    category.image ??
                                    (!legacyMockArtwork
                                        ? null
                                        : UrlCatalogImage(
                                            categoryImageUrl(category.id),
                                          )),
                                placeholder: fallback(),
                                loading: fallback(),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
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
    child: LayoutBuilder(
      builder: (context, constraints) => SizedBox(
        height: _cardHeight(context),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Expanded(
              child: Padding(
                padding: EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Skeleton.line(),
                    SizedBox(height: AppSpacing.xs),
                    Skeleton.line(),
                  ],
                ),
              ),
            ),
            SizedBox(
              width: constraints.maxWidth * AppLayout.categoryCardImageFraction,
              child: const Skeleton(borderRadius: BorderRadius.zero),
            ),
          ],
        ),
      ),
    ),
  );
}

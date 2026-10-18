import 'package:flutter/material.dart';

import '../../../../core/layout/app_layout.dart';
import '../../../../core/theme/theme_context.dart';
import '../../data/category.dart';
import 'catalog_image_view.dart';

/// Category artwork is decorative: the adjacent name labels the tap target.
/// Missing and failed images share a neutral placeholder, never a legacy glyph.
class CategoryImage extends StatelessWidget {
  const CategoryImage({super.key, required this.category});

  final Category category;

  @override
  Widget build(BuildContext context) {
    final fallback = Center(
      child: Icon(
        Icons.image_outlined,
        size: AppLayout.categoryIconSize,
        color: context.colors.textMuted,
      ),
    );
    return ExcludeSemantics(
      child: CatalogImageView(
        image: category.image,
        placeholder: fallback,
        loading: fallback,
      ),
    );
  }
}

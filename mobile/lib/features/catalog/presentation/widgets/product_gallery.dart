import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';

/// Product image gallery: a large main image with a horizontally scrollable row
/// of thumbnails beneath it. Tapping a thumbnail shows it large, and the
/// selected thumbnail carries a thick primary border.
class ProductGallery extends StatefulWidget {
  const ProductGallery({super.key, required this.images});

  final List<String> images;

  static const double _mainSize = 1; // aspect ratio (square)
  static const double thumbSize = 64;

  @override
  State<ProductGallery> createState() => _ProductGalleryState();
}

class _ProductGalleryState extends State<ProductGallery> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    final images = widget.images;

    if (images.isEmpty) {
      return const AspectRatio(
        aspectRatio: ProductGallery._mainSize,
        child: _GalleryPlaceholder(size: 48),
      );
    }

    // Guard against the selection pointing past a shorter list.
    final selected = _selected.clamp(0, images.length - 1);

    return Column(
      children: [
        // Large main image (edge to edge, same size as before).
        AspectRatio(
          aspectRatio: ProductGallery._mainSize,
          child: _GalleryImage(
            key: const ValueKey('gallery-main'),
            url: images[selected],
          ),
        ),
        if (images.length > 1) ...[
          const SizedBox(height: AppSpacing.md),
          SizedBox(
            height: ProductGallery.thumbSize,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenH,
              ),
              itemCount: images.length,
              separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
              itemBuilder: (context, i) => _Thumb(
                key: ValueKey('gallery-thumb-$i'),
                url: images[i],
                selected: i == selected,
                onTap: () => setState(() => _selected = i),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({
    super.key,
    required this.url,
    required this.selected,
    required this.onTap,
  });

  final String url;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: ProductGallery.thumbSize,
        height: ProductGallery.thumbSize,
        decoration: BoxDecoration(
          borderRadius: AppRadii.smAll,
          border: Border.all(
            color: selected ? colors.primary : colors.border,
            width: selected ? 3 : 1,
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.sm - 2),
          child: _GalleryImage(url: url),
        ),
      ),
    );
  }
}

class _GalleryImage extends StatelessWidget {
  const _GalleryImage({super.key, required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      placeholder: (context, _) => ColoredBox(color: colors.surfaceAlt),
      errorWidget: (context, _, _) => const _GalleryPlaceholder(size: 28),
    );
  }
}

class _GalleryPlaceholder extends StatelessWidget {
  const _GalleryPlaceholder({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return ColoredBox(
      color: colors.surfaceAlt,
      child: Icon(Icons.image_outlined, color: colors.textMuted, size: size),
    );
  }
}

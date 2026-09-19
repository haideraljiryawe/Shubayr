import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../../core/theme/theme_context.dart';
import '../../data/media/catalog_image.dart';

ImageProvider catalogImageProvider(CatalogImage image) => switch (image) {
  LocalCatalogImage(:final bytes) => MemoryImage(bytes),
  UrlCatalogImage(:final url) => CachedNetworkImageProvider(url),
};

class CatalogImageView extends StatelessWidget {
  const CatalogImageView({
    super.key,
    required this.image,
    this.placeholder,
    this.loading,
  });
  final CatalogImage? image;
  final Widget? placeholder, loading;
  @override
  Widget build(BuildContext context) {
    final fallback =
        placeholder ??
        ColoredBox(
          color: context.colors.surfaceAlt,
          child: Center(
            child: Icon(Icons.image_outlined, color: context.colors.textMuted),
          ),
        );
    return switch (image) {
      LocalCatalogImage(:final bytes) => Image.memory(
        bytes,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => fallback,
      ),
      UrlCatalogImage(:final url) => CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.cover,
        placeholder: (_, _) =>
            loading ?? ColoredBox(color: context.colors.surfaceAlt),
        errorWidget: (_, _, _) => fallback,
      ),
      null => fallback,
    };
  }
}

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_motion.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';

/// Product image gallery — a swipeable carousel with page dots, the pattern
/// shoppers already know from every retail app. The dots sit centred inside
/// the image; the active one is brighter and slightly larger. Tapping the image
/// opens a full-screen viewer with pinch/double-tap zoom, swipe between images
/// and an `n / total` counter. Neither view wraps around: paging stops at the
/// first and last image.
class ProductGallery extends StatefulWidget {
  const ProductGallery({super.key, required this.images});

  final List<String> images;

  /// Aspect ratio of the main image (square). Removing the old thumbnail strip
  /// gives this height back to the image.
  static const double _ratio = 1;

  @override
  State<ProductGallery> createState() => _ProductGalleryState();
}

class _ProductGalleryState extends State<ProductGallery> {
  final PageController _controller = PageController();
  int _current = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _openFullScreen(int index) {
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.black,
        transitionDuration: AppMotion.medium,
        pageBuilder: (_, _, _) =>
            _FullScreenGallery(images: widget.images, initialIndex: index),
        transitionsBuilder: (_, animation, _, child) =>
            FadeTransition(opacity: animation, child: child),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final images = widget.images;

    if (images.isEmpty) {
      return const AspectRatio(
        aspectRatio: ProductGallery._ratio,
        child: _GalleryPlaceholder(size: 48),
      );
    }

    // Guard the index against a list that shrank underneath us.
    final current = _current.clamp(0, images.length - 1);

    return AspectRatio(
      aspectRatio: ProductGallery._ratio,
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            key: const ValueKey('gallery-main'),
            controller: _controller,
            itemCount: images.length,
            onPageChanged: (i) => setState(() => _current = i),
            itemBuilder: (context, i) => GestureDetector(
              onTap: () => _openFullScreen(i),
              child: _GalleryImage(url: images[i]),
            ),
          ),
          if (images.length > 1)
            Positioned(
              left: 0,
              right: 0,
              bottom: AppSpacing.md,
              child: _Dots(count: images.length, current: current),
            ),
        ],
      ),
    );
  }
}

/// The page-dot row, on a soft dark pill so it reads over any photo.
class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.current});

  final int count;
  final int current;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: 6,
        ),
        decoration: BoxDecoration(
          // Media chrome: a neutral scrim, not a brand surface, so a literal
          // translucent black keeps the dots legible on light and dark images.
          color: Colors.black.withValues(alpha: 0.28),
          borderRadius: AppRadii.pillAll,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < count; i++)
              _Dot(key: ValueKey('gallery-dot-$i'), active: i == current),
          ],
        ),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({super.key, required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    // `onDark` is the token for marks on dark/media surfaces (white).
    final onMedia = context.colors.onDark;
    return AnimatedContainer(
      duration: AppMotion.fast,
      curve: AppMotion.standard,
      width: active ? 9 : 7,
      height: active ? 9 : 7,
      margin: const EdgeInsets.symmetric(horizontal: 3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? onMedia : onMedia.withValues(alpha: 0.45),
        // A soft halo makes the active dot read as "lit".
        boxShadow: active
            ? [BoxShadow(color: onMedia.withValues(alpha: 0.6), blurRadius: 4)]
            : null,
      ),
    );
  }
}

/// Full-screen viewer: swipe between images, pinch or double-tap to zoom, with
/// a counter at the bottom and a close button. Built on `photo_view`, the
/// standard Flutter gallery, so zoom and paging never fight each other.
class _FullScreenGallery extends StatefulWidget {
  const _FullScreenGallery({required this.images, required this.initialIndex});

  final List<String> images;
  final int initialIndex;

  @override
  State<_FullScreenGallery> createState() => _FullScreenGalleryState();
}

class _FullScreenGalleryState extends State<_FullScreenGallery> {
  late final PageController _controller = PageController(
    initialPage: widget.initialIndex,
  );
  late int _current = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.images.length;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PhotoViewGallery.builder(
            pageController: _controller,
            itemCount: total,
            onPageChanged: (i) => setState(() => _current = i),
            backgroundDecoration: const BoxDecoration(color: Colors.black),
            loadingBuilder: (context, _) => const Center(
              child: SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              ),
            ),
            builder: (context, i) => PhotoViewGalleryPageOptions(
              imageProvider: CachedNetworkImageProvider(widget.images[i]),
              errorBuilder: (context, _, _) =>
                  const Center(child: _GalleryPlaceholder(size: 28)),
              // Fits the image, then lets it zoom to 2.5× on pinch/double-tap.
              minScale: PhotoViewComputedScale.contained,
              maxScale: PhotoViewComputedScale.covered * 2.5,
              initialScale: PhotoViewComputedScale.contained,
            ),
          ),
          SafeArea(
            child: Align(
              alignment: AlignmentDirectional.topStart,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: _CircleIconButton(
                  icon: Icons.close,
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ),
            ),
          ),
          if (total > 1)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                  child: Center(
                    child: _Counter(current: _current + 1, total: total),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The image counter, localized and laid out in the reading direction of the
/// active language: "1 من 5" in Arabic (reads right-to-left, current image on
/// the right) and "1 from 5" in English (left-to-right, current on the left).
/// Digits stay Western Arabic (passed as strings) to match the rest of the app.
class _Counter extends StatelessWidget {
  const _Counter({required this.current, required this.total});

  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: AppRadii.pillAll,
      ),
      child: Text(
        context.l10n.galleryCounter('$current', '$total'),
        style: context.text.labelLarge?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.45),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: IconButton(
        icon: Icon(icon, color: Colors.white),
        onPressed: onPressed,
        tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
      ),
    );
  }
}

class _GalleryImage extends StatelessWidget {
  const _GalleryImage({required this.url});

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

import 'package:flutter/material.dart';

import '../theme/theme_context.dart';
import '../theme/tokens/app_motion.dart';
import '../theme/tokens/app_radii.dart';
import '../theme/tokens/app_spacing.dart';

/// Shimmering placeholder block — the foundation for
/// "screen opens → skeleton → content", so no screen has to block on the
/// network before it can paint.
class Skeleton extends StatefulWidget {
  const Skeleton({
    super.key,
    this.width,
    this.height = 16,
    this.borderRadius = AppRadii.smAll,
  });

  /// A single line of placeholder text.
  const Skeleton.line({Key? key, double? width, double height = 14})
    : this(key: key, width: width, height: height);

  /// A square/rounded placeholder for imagery.
  const Skeleton.box({Key? key, double? width, double height = 120})
    : this(
        key: key,
        width: width,
        height: height,
        borderRadius: AppRadii.lgAll,
      );

  final double? width;
  final double height;
  final BorderRadius borderRadius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: AppMotion.shimmer,
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = _controller.value;
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: widget.borderRadius,
            gradient: LinearGradient(
              begin: Alignment(-1 - 2 * t, 0),
              end: Alignment(1 - 2 * t, 0),
              colors: [
                colors.surfaceAlt,
                colors.surfaceAlt.withValues(alpha: 0.45),
                colors.surfaceAlt,
              ],
              stops: const [0.1, 0.5, 0.9],
            ),
          ),
        );
      },
    );
  }
}

/// A stack of media rows (thumbnail + two lines) — the "list is loading"
/// placeholder for lists that show a leading image, e.g. the cart.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.itemCount = 4});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    // A non-scrolling scroll view so a placeholder taller than its slot clips
    // rather than overflowing (e.g. on short screens or in tests).
    return SingleChildScrollView(
      physics: const NeverScrollableScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < itemCount; i++)
            const Padding(
              padding: EdgeInsets.only(bottom: AppSpacing.lg),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Skeleton.box(width: 72, height: 72),
                  SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Skeleton.line(width: 180),
                        SizedBox(height: AppSpacing.sm),
                        Skeleton.line(width: 120),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// A stack of full-width card-shaped placeholders — the "list is loading"
/// placeholder for [AppCard]-based lists with no leading thumbnail (orders,
/// addresses, and the sections of a detail screen).
class SkeletonCardList extends StatelessWidget {
  const SkeletonCardList({super.key, this.itemCount = 5, this.height = 96});

  final int itemCount;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      physics: const NeverScrollableScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < itemCount; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: Skeleton(height: height, borderRadius: AppRadii.lgAll),
            ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../theme/theme_context.dart';
import '../theme/tokens/app_spacing.dart';

/// Shared user identity image. Supply an image when profile photos are supported;
/// missing or failed images show a filled Material person icon.
class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, this.image});

  final ImageProvider? image;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final fallback = Center(
      child: Icon(Icons.person, size: AppSpacing.xxxl, color: colors.onPrimary),
    );
    return ClipOval(
      child: SizedBox.square(
        dimension: AppSpacing.xxxl * 2,
        child: ColoredBox(
          color: colors.primary,
          child: image == null
              ? fallback
              : Image(
                  image: image!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, error, stackTrace) => fallback,
                ),
        ),
      ),
    );
  }
}

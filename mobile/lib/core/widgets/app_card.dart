import 'package:flutter/material.dart';

import '../theme/theme_context.dart';
import '../theme/tokens/app_radii.dart';
import '../theme/tokens/app_shadows.dart';
import '../theme/tokens/app_spacing.dart';

/// The standard raised surface: warm white, hairline border, soft shadow.
/// Use this instead of ad-hoc `Container(decoration: ...)` blocks.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.onTap,
    this.elevated = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final content = Padding(padding: padding, child: child);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: colors.border),
        boxShadow: elevated ? AppShadows.level1 : null,
      ),
      child: onTap == null
          // Descendant controls need ink above the card's decoration too.
          ? Material(
              type: MaterialType.transparency,
              textStyle: DefaultTextStyle.of(context).style,
              child: content,
            )
          : Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                borderRadius: AppRadii.lgAll,
                child: content,
              ),
            ),
    );
  }
}

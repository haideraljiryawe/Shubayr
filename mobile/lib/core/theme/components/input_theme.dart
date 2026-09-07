import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_spacing.dart';

abstract final class InputTheme {
  static InputDecorationThemeData build(AppColors c, TextTheme text) {
    OutlineInputBorder border(Color color, {double width = 1}) =>
        OutlineInputBorder(
          borderRadius: AppRadii.controlAll,
          borderSide: BorderSide(color: color, width: width),
        );

    return InputDecorationThemeData(
      filled: true,
      fillColor: c.surface,
      // Vertical padding sets the field height — the single place to retune it
      // app-wide, kept close to the button height for a consistent control bar.
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      hintStyle: text.bodyMedium?.copyWith(color: c.textMuted),
      labelStyle: text.bodyMedium?.copyWith(color: c.textSecondary),
      floatingLabelStyle: text.labelMedium?.copyWith(color: c.primaryDark),
      errorStyle: text.labelSmall?.copyWith(color: c.danger),
      prefixIconColor: c.textMuted,
      suffixIconColor: c.textMuted,
      enabledBorder: border(c.border),
      disabledBorder: border(c.divider),
      focusedBorder: border(c.primary, width: 1.6),
      errorBorder: border(c.danger),
      focusedErrorBorder: border(c.danger, width: 1.6),
    );
  }
}

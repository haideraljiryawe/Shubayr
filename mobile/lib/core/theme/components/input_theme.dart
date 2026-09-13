import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_spacing.dart';

abstract final class InputTheme {
  static const double productFilterIconSize = 22;

  /// Keeps the compact count inside the outline, above the centered icon.
  static const double productFilterBadgeInset = 1;

  static TextStyle? productFilterBadgeTextStyle(TextTheme text) =>
      text.labelSmall?.copyWith(height: 1);

  /// Outlined companion to product search fields; shares their control radius.
  static ButtonStyle productFilterButton(AppColors colors) =>
      OutlinedButton.styleFrom(
        minimumSize: const Size(
          kMinInteractiveDimension,
          kMinInteractiveDimension,
        ),
        padding: EdgeInsets.zero,
        iconSize: productFilterIconSize,
        foregroundColor: colors.textSecondary,
        backgroundColor: colors.surface,
        side: BorderSide(color: colors.border),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.controlAll),
      );

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
      hintStyle: WidgetStateTextStyle.resolveWith(
        (states) => (text.bodyMedium ?? const TextStyle()).copyWith(
          color: states.contains(WidgetState.disabled)
              ? c.textDisabled
              : c.textMuted,
        ),
      ),
      labelStyle: WidgetStateTextStyle.resolveWith(
        (states) => (text.bodyMedium ?? const TextStyle()).copyWith(
          color: states.contains(WidgetState.disabled)
              ? c.textDisabled
              : c.textSecondary,
        ),
      ),
      floatingLabelStyle: text.labelMedium?.copyWith(color: c.primaryDark),
      errorStyle: text.labelSmall?.copyWith(color: c.danger),
      prefixIconColor: WidgetStateColor.resolveWith(
        (states) => states.contains(WidgetState.disabled)
            ? c.textDisabled
            : c.textMuted,
      ),
      suffixIconColor: WidgetStateColor.resolveWith(
        (states) => states.contains(WidgetState.disabled)
            ? c.textDisabled
            : c.textMuted,
      ),
      enabledBorder: border(c.border),
      disabledBorder: border(c.divider),
      focusedBorder: border(c.primary, width: 1.6),
      errorBorder: border(c.danger),
      focusedErrorBorder: border(c.danger, width: 1.6),
    );
  }
}

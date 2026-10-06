import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_spacing.dart';
import '../tokens/app_typography.dart';

abstract final class InputTheme {
  static const double productFilterIconSize = 22;

  /// Logical end gives the requested bottom-left in RTL / bottom-right in LTR.
  /// Increase to move the badge horizontally inward, toward the button center.
  static const double productFilterBadgeEndInset =
      AppSpacing.xs + AppSpacing.xxs;

  /// Increase to lift the badge from the bottom edge toward the button center.
  static const double productFilterBadgeBottomInset = AppSpacing.xs;

  static TextStyle? productFilterBadgeTextStyle(TextTheme text) =>
      text.labelLarge?.copyWith(height: 1, fontWeight: FontWeight.w700);

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
      // Natural input metrics and 16px vertical insets keep floating labels
      // clear of selected text, including at 200% text scaling.
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.lg,
      ),
      hintStyle: WidgetStateTextStyle.resolveWith(
        (states) => (text.bodyMedium ?? const TextStyle()).copyWith(
          height: kTextHeightNone,
          color: states.contains(WidgetState.disabled)
              ? c.textDisabled
              : c.textMuted,
        ),
      ),
      labelStyle: WidgetStateTextStyle.resolveWith(
        (states) => AppTypography.formLabel(text).copyWith(
          color: states.contains(WidgetState.disabled)
              ? c.textDisabled
              : c.textSecondary,
        ),
      ),
      floatingLabelStyle: AppTypography.floatingFormLabel(
        text,
      ).copyWith(color: c.primaryDark),
      floatingLabelBehavior: FloatingLabelBehavior.auto,
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

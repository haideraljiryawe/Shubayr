import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_control_sizes.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_spacing.dart';
import '../tokens/app_typography.dart';

abstract final class InputTheme {
  /// Text areas and dropdown selectors retain their existing content insets.
  static const spaciousContentPadding = EdgeInsets.all(AppSpacing.lg);

  /// Match the preferred height using the actual, unscaled input line metrics.
  /// Padding (rather than a fixed/max height) lets scaled text, multiple lines,
  /// counters and validation messages grow naturally. The outlined field owns
  /// its padding; errors/helpers remain outside its border.
  static EdgeInsets _contentPadding(TextTheme text) {
    final painter = TextPainter(
      text: TextSpan(text: ' ', style: text.bodyLarge),
      textDirection: TextDirection.ltr,
    )..layout();
    final lineHeight = painter.height;
    painter.dispose();
    return EdgeInsets.symmetric(
      horizontal: AppSpacing.lg,
      vertical: math.max(0, (AppControlSizes.standardHeight - lineHeight) / 2),
    );
  }

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
      contentPadding: _contentPadding(text),
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

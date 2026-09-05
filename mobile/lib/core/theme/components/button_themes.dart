import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_spacing.dart';

/// Button styling for the whole app. Feature code uses `AppButton` (or plain
/// Material buttons) and never restyles them locally.
abstract final class ButtonThemes {
  /// Shared minimum height for all buttons — the single place to retune button
  /// height app-wide. Kept close to the text-field height for a consistent bar
  /// of controls.
  static const Size _minSize = Size(64, 48);
  static const EdgeInsets _padding = EdgeInsets.symmetric(
    horizontal: AppSpacing.xl,
    vertical: AppSpacing.md,
  );

  static ElevatedButtonThemeData elevated(AppColors c, TextTheme text) {
    return ElevatedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) return c.border;
          if (states.contains(WidgetState.pressed)) return c.primaryDark;
          return c.primary;
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) return c.textMuted;
          return c.onPrimary;
        }),
        overlayColor: WidgetStateProperty.all(
          c.onPrimary.withValues(alpha: 0.08),
        ),
        elevation: WidgetStateProperty.all(0),
        shadowColor: WidgetStateProperty.all(Colors.transparent),
        minimumSize: WidgetStateProperty.all(_minSize),
        padding: WidgetStateProperty.all(_padding),
        textStyle: WidgetStateProperty.all(text.labelLarge),
        shape: WidgetStateProperty.all(
          const RoundedRectangleBorder(borderRadius: AppRadii.controlAll),
        ),
      ),
    );
  }

  static OutlinedButtonThemeData outlined(AppColors c, TextTheme text) {
    return OutlinedButtonThemeData(
      style: ButtonStyle(
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) return c.textMuted;
          return c.primaryDark;
        }),
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.pressed)) return c.primarySoft;
          return c.surface;
        }),
        side: WidgetStateProperty.resolveWith(
          (states) => BorderSide(
            color: states.contains(WidgetState.disabled) ? c.divider : c.border,
          ),
        ),
        minimumSize: WidgetStateProperty.all(_minSize),
        padding: WidgetStateProperty.all(_padding),
        textStyle: WidgetStateProperty.all(text.labelLarge),
        shape: WidgetStateProperty.all(
          const RoundedRectangleBorder(borderRadius: AppRadii.controlAll),
        ),
      ),
    );
  }

  static TextButtonThemeData text_(AppColors c, TextTheme text) {
    return TextButtonThemeData(
      style: ButtonStyle(
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) return c.textMuted;
          return c.primaryDark;
        }),
        overlayColor: WidgetStateProperty.all(c.primarySoft),
        minimumSize: WidgetStateProperty.all(const Size(48, 44)),
        padding: WidgetStateProperty.all(
          const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        ),
        textStyle: WidgetStateProperty.all(text.labelLarge),
        shape: WidgetStateProperty.all(
          const RoundedRectangleBorder(borderRadius: AppRadii.controlAll),
        ),
      ),
    );
  }
}

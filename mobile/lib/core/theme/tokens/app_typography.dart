import 'package:flutter/material.dart';

/// Typography scale.
///
/// The UI font is Cairo, loaded from **local assets only** (never from the
/// network). Until the font files are added to `assets/fonts/` and the `fonts:`
/// block in `pubspec.yaml` is uncommented, Flutter silently falls back to the
/// platform UI font — the app still builds and renders correctly.
abstract final class AppTypography {
  /// Single place that names the font family.
  static const String fontFamily = 'Cairo';

  /// Line heights are generous: Arabic glyphs need more vertical room than
  /// Latin ones, and the same scale serves both locales.
  static TextTheme textTheme(Color primaryText, Color secondaryText) {
    TextStyle style(
      double size,
      FontWeight weight,
      double height,
      Color color,
    ) => TextStyle(
      fontFamily: fontFamily,
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: 0,
      color: color,
    );

    return TextTheme(
      displaySmall: style(30, FontWeight.w700, 1.25, primaryText),
      headlineMedium: style(24, FontWeight.w700, 1.3, primaryText),
      headlineSmall: style(20, FontWeight.w600, 1.35, primaryText),
      titleLarge: style(18, FontWeight.w600, 1.4, primaryText),
      titleMedium: style(16, FontWeight.w600, 1.4, primaryText),
      titleSmall: style(14, FontWeight.w600, 1.4, primaryText),
      bodyLarge: style(16, FontWeight.w400, 1.5, primaryText),
      bodyMedium: style(14, FontWeight.w400, 1.5, primaryText),
      bodySmall: style(12, FontWeight.w600, 1.45, secondaryText),
      labelLarge: style(14, FontWeight.w600, 1.2, primaryText),
      labelMedium: style(12, FontWeight.w700, 1.2, secondaryText),
      labelSmall: style(11, FontWeight.w500, 1.2, secondaryText),
    );
  }
}

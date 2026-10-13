import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';

/// Typography scale.
///
/// Zain is bundled locally for all UI text and wordmarks.
/// The available faces are 400, 700 and 800. Text roles use explicit
/// bundled weights rather than relying on an unavailable semibold face.
abstract final class AppTypography {
  /// Single place that names the font family.
  static const String fontFamily = 'Zain';

  static const String brandFontFamily = fontFamily;
  static const String homeBrandFontFamily = fontFamily;

  /// Keep adaptive iOS controls on the same family, retaining their native
  /// sizes and dynamic colors. Each role uses an actual bundled face.
  static CupertinoTextThemeData cupertinoTextTheme(Color primary) {
    final native = CupertinoTextThemeData(primaryColor: primary);
    TextStyle face(TextStyle style, {bool emphasized = false}) =>
        style.copyWith(
          fontFamily: fontFamily,
          fontWeight: emphasized ? FontWeight.w700 : FontWeight.w400,
        );
    return native.copyWith(
      textStyle: face(native.textStyle),
      actionTextStyle: face(native.actionTextStyle, emphasized: true),
      actionSmallTextStyle: face(native.actionSmallTextStyle, emphasized: true),
      tabLabelTextStyle: face(native.tabLabelTextStyle),
      navTitleTextStyle: face(native.navTitleTextStyle, emphasized: true),
      navLargeTitleTextStyle: face(
        native.navLargeTitleTextStyle,
        emphasized: true,
      ),
      navActionTextStyle: face(native.navActionTextStyle, emphasized: true),
      pickerTextStyle: face(native.pickerTextStyle),
      dateTimePickerTextStyle: face(native.dateTimePickerTextStyle),
    );
  }

  /// Resting form labels are distinct from both input text and hints.
  static TextStyle formLabel(TextTheme text) => text.bodyMedium!.copyWith(
    fontWeight: FontWeight.w700,
    height: kTextHeightNone,
  );

  /// InputDecorator paints floating labels at 75% of this size: 13.5px.
  /// Compensate only the label size; input text keeps its own size.
  static TextStyle floatingFormLabel(TextTheme text) =>
      text.labelLarge!.copyWith(fontSize: 18, fontWeight: FontWeight.w700);

  /// Inputs and control labels use natural font metrics for selection and
  /// vertical centering; prose and headings retain the established line rhythm.
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
      headlineSmall: style(20, FontWeight.w700, 1.35, primaryText),
      titleLarge: style(18, FontWeight.w700, 1.4, primaryText),
      titleMedium: style(16, FontWeight.w700, 1.4, primaryText),
      titleSmall: style(14, FontWeight.w700, 1.4, primaryText),
      bodyLarge: style(16, FontWeight.w400, kTextHeightNone, primaryText),
      bodyMedium: style(14, FontWeight.w400, 1.5, primaryText),
      // Supporting information stays readable; compact labels keep 12px below.
      bodySmall: style(14, FontWeight.w400, 1.45, secondaryText),
      labelLarge: style(14, FontWeight.w700, kTextHeightNone, primaryText),
      labelMedium: style(12, FontWeight.w700, kTextHeightNone, secondaryText),
      labelSmall: style(11, FontWeight.w400, 1.2, secondaryText),
    );
  }
}

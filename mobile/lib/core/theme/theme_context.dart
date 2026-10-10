import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Shorthands so widgets never reach for raw colour values.
extension ThemeContextX on BuildContext {
  /// Semantic colour tokens.
  AppColors get colors =>
      Theme.of(this).extension<AppColors>() ?? AppColors.bundled();

  TextTheme get text => Theme.of(this).textTheme;

  /// Section headings share the 16px bold title role. Card/row titles keep
  /// titleSmall (14px), while body and secondary copy keep their own scale.
  TextStyle get sectionTitle => text.titleMedium!;

  /// Measure the font rather than multiplying by TextStyle.height: a natural
  /// height is represented by zero, not a zero-height line.
  double textLineHeight(TextStyle style) {
    final painter = TextPainter(
      text: TextSpan(text: ' ', style: style),
      textDirection: Directionality.of(this),
      textScaler: MediaQuery.textScalerOf(this),
    )..layout();
    final height = painter.height;
    painter.dispose();
    return height;
  }

  /// True when the active locale lays out right-to-left.
  bool get isRtl => Directionality.of(this) == TextDirection.rtl;
}

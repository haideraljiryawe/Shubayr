import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Shorthands so widgets never reach for raw colour values.
extension ThemeContextX on BuildContext {
  /// Semantic colour tokens.
  AppColors get colors =>
      Theme.of(this).extension<AppColors>() ?? AppColors.bundled();

  TextTheme get text => Theme.of(this).textTheme;

  /// True when the active locale lays out right-to-left.
  bool get isRtl => Directionality.of(this) == TextDirection.rtl;
}

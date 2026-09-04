import 'package:flutter/animation.dart';

/// Motion tokens. Centralised now so later animation work stays consistent.
abstract final class AppMotion {
  static const Duration fast = Duration(milliseconds: 140);
  static const Duration medium = Duration(milliseconds: 240);
  static const Duration slow = Duration(milliseconds: 400);

  /// Skeleton shimmer sweep.
  static const Duration shimmer = Duration(milliseconds: 1200);

  static const Curve standard = Curves.easeOutCubic;
  static const Curve emphasized = Curves.easeInOutCubicEmphasized;
}

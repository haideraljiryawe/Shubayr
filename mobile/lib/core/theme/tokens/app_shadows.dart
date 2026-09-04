import 'package:flutter/painting.dart';

import 'color_primitives.dart';

/// Elevation as explicit shadows. Material's tint-based elevation is switched
/// off in the component themes so surfaces stay warm and flat by default.
abstract final class AppShadows {
  /// Resting cards, list tiles.
  static List<BoxShadow> get level1 => [
    BoxShadow(
      color: ColorPrimitives.shadow.withValues(alpha: 0.05),
      blurRadius: 10,
      offset: const Offset(0, 2),
    ),
  ];

  /// Raised / hovered / pressed surfaces.
  static List<BoxShadow> get level2 => [
    BoxShadow(
      color: ColorPrimitives.shadow.withValues(alpha: 0.08),
      blurRadius: 18,
      offset: const Offset(0, 6),
    ),
  ];

  /// Sheets, dialogs, sticky bars.
  static List<BoxShadow> get level3 => [
    BoxShadow(
      color: ColorPrimitives.shadow.withValues(alpha: 0.12),
      blurRadius: 28,
      offset: const Offset(0, 12),
    ),
  ];
}

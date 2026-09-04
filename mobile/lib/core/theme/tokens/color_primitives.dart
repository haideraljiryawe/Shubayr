import 'package:flutter/painting.dart';

/// Raw, non-semantic colour values.
///
/// This is the ONLY place in the app where colour literals are allowed.
/// Feature code must never reference this class directly — it reads semantic
/// tokens from `AppColors` (a [ThemeExtension]) instead.
abstract final class ColorPrimitives {
  // Brand — muted modern green (bundled default; overridable at runtime).
  static const Color green500 = Color(0xFF5B8F6B);

  // Warm neutrals — the app sits on warm off-white, not pure white.
  static const Color sand50 = Color(0xFFFAF7F2); // app background
  static const Color sand100 = Color(0xFFF4F0E8); // alternate surface
  static const Color sand200 = Color(0xFFE6E1D6); // borders
  static const Color sand150 = Color(0xFFEDE9E0); // dividers
  static const Color white = Color(0xFFFFFFFF); // cards / sheets

  // Ink — warm near-black through muted grey.
  static const Color ink900 = Color(0xFF1B1F1C);
  static const Color ink600 = Color(0xFF585F59);
  static const Color ink400 = Color(0xFF8A918B);

  // Accent — warm amber, pairs with the green without reading "botanical".
  static const Color amber500 = Color(0xFFC98A3C);

  // Status.
  static const Color success500 = Color(0xFF2E7D4F);
  static const Color warning500 = Color(0xFFC08A2E);
  static const Color danger500 = Color(0xFFC0453A);
  static const Color info500 = Color(0xFF2F6FA8);

  // Shadow base.
  static const Color shadow = Color(0xFF2A2E29);
}

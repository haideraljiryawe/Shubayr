import 'package:flutter/painting.dart';

/// Raw, non-semantic colour values.
///
/// This is the ONLY place in the app where colour literals are allowed.
/// Feature code must never reference this class directly — it reads semantic
/// tokens from `AppColors` (a [ThemeExtension]) instead.
abstract final class ColorPrimitives {
  // Brand — muted modern green (bundled default; overridable at runtime).
  //static const Color green500 = Color(0xFF5B8F6B);
  static const Color green500 = Color(0xFF396D48);

  // Warm neutrals — the app sits on warm off-white, not pure white.
  static const Color sand50 = Color(0xFFFAFAF8); // app background
  static const Color sand75 = Color(0xFFECE9E2); // category tiles
  static const Color sand100 = Color(0xFFF4F0E8); // alternate surface
  static const Color sand200 = Color(0xFFE6E1D6); // borders
  static const Color sand150 = Color(0xFFEDE9E0); // dividers
  static const Color white = Color(0xFFFFFFFF); // cards / sheets

  // Ink — warm near-black through muted grey.
  static const Color ink900 = Color(0xFF1B1F1C);
  static const Color ink600 = Color(0xFF515A53);
  static const Color ink500 = Color(0xFF6B716D);
  static const Color ink400 = Color(0xFF8A918B);

  // Inbox read-state icons on light surfaces.
  static const Color notificationUnread = Color(0xFF376E4B);
  static const Color notificationRead = Color(0xFF8A938D);

  // Accent — warm amber, pairs with the green without reading "botanical".
  static const Color amber500 = Color(0xFFC98A3C);

  // Dark green "confirmation" surface for positive snackbars/toasts. Kept the
  // same in light and dark themes: like other transient overlay chrome, it is a
  // fixed dark surface rather than a themed one, so an "added to cart" toast
  // reads the same everywhere and never inverts to a light fill in dark mode.
  static const Color confirmSurface = Color(0xFF183326);

  // Status.
  static const Color success500 = Color(0xFF2E7D4F);
  static const Color warning500 = Color(0xFFC08A2E);
  static const Color danger500 = Color(0xFFC0453A);
  static const Color info500 = Color(0xFF2F6FA8);

  // Shadow base.
  static const Color shadow = Color(0xFF2A2E29);

  // ---------------------------------------------------------------------------
  // Dark theme — warm charcoal neutrals (never pure black) to match the warm
  // sand of the light theme, plus a warm near-white "mist" text ramp.
  // ---------------------------------------------------------------------------
  static const Color charcoal900 = Color(0xFF15181A); // app background
  static const Color charcoal800 = Color(0xFF1E2225); // cards / sheets
  static const Color charcoal700 = Color(0xFF272C2F); // alternate surface
  static const Color charcoal650 = Color(0xFF2F3438); // dividers
  static const Color charcoal600 = Color(0xFF3A4044); // borders

  static const Color mist100 = Color(0xFFECEFEC); // primary text on dark
  static const Color mist300 = Color(0xFFBFC5C0); // secondary text on dark
  static const Color mist400 = Color(0xFF9CA59E); // supporting text on dark
  static const Color mist500 = Color(0xFF838A85); // disabled text on dark

  // Amber accent, lifted for dark surfaces.
  static const Color amber400 = Color(0xFFD79A52);

  // Status, lifted for legibility on dark surfaces.
  static const Color successDark = Color(0xFF4CAF7D);
  static const Color warningDark = Color(0xFFDAA548);
  static const Color dangerDark = Color(0xFFE0655B);
  static const Color infoDark = Color(0xFF5B9BD5);

  // Shadow base for dark surfaces — pure black reads better than the warm one.
  static const Color shadowDark = Color(0xFF000000);
}

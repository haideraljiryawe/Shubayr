/// Spacing scale (4pt based). Never hard-code paddings in feature widgets.
abstract final class AppSpacing {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;

  /// Horizontal padding used by full-width screens.
  static const double screenH = 16;

  /// Page horizontal inset on phones (<600dp), via AppLayout.pageHorizontal.
  /// Tune this value only for phone page margins (for example 14, 16 or 18).
  /// SafeArea, horizontal carousels and floating navigation are separate.
  static const double screenMobileH = 14;

  /// Resting content inset inside phone horizontal scroll views. This is not
  /// viewport padding; keep carousel artwork/card sizing independent of pages.
  static const double horizontalScrollMobileH = 8;

  /// Gap after Home banner/indicator and before category shortcuts.
  static const double homeBannerToCategories = 16;

  /// Vertical rhythm between major sections.
  static const double section = 24;
}

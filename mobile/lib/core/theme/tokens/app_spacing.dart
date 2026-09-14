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

  /// Phone page horizontal inset, consumed by AppLayout.pageHorizontal.
  /// Adjust this value to tune all phone page margins; SafeArea is separate.
  static const double screenMobileH = 8;

  /// Gap after Home banner/indicator and before category shortcuts.
  static const double homeBannerToCategories = 16;

  /// Vertical rhythm between major sections.
  static const double section = 24;
}

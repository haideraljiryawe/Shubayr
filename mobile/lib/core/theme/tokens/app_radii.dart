import 'package:flutter/painting.dart';

/// Corner radii. Rounded but restrained — premium retail, not playful.
abstract final class AppRadii {
  static const double xs = 6;
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 18;
  static const double xl = 26;
  static const double pill = 999;

  /// Retail imagery only; keep other cards and controls unchanged.
  static const double product = 16;
  static const double banner = 16;
  static const BorderRadius productAll = BorderRadius.all(
    Radius.circular(product),
  );
  static const BorderRadius bannerAll = BorderRadius.all(
    Radius.circular(banner),
  );

  /// Shared corner radius for every interactive control — buttons, text
  /// fields and dropdowns. This is the single source of truth for control
  /// roundness; change it here and the whole app follows, and buttons and
  /// fields can never drift apart because they read the same value.
  static const double control = 10;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius xlAll = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius pillAll = BorderRadius.all(Radius.circular(pill));
  static const BorderRadius controlAll = BorderRadius.all(
    Radius.circular(control),
  );
}

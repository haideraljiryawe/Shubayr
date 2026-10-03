/// Identity bundled with this application. API store settings may override
/// runtime presentation; native labels, icons and package IDs remain build-time.
abstract final class StoreIdentity {
  static const nameEn = 'Shubayr';
  static const nameAr = 'شُبَيّر';
  static const logoAsset = 'assets/images/branding/shubayr-logo.png';
  static const wordmarkFontAsset = 'assets/fonts/Zain-Bold.ttf';

  static String name(String languageCode) =>
      languageCode == 'ar' ? nameAr : nameEn;
}

import '../data/home_banner.dart';

abstract interface class BannerRepository {
  /// GET /banners returns the complete active list (no pagination), sort_order ASC.
  Future<List<HomeBanner>> fetchBanners();
}

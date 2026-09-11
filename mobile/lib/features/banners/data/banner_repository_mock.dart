import '../domain/banner_repository.dart';
import 'home_banner.dart';

class BannerRepositoryMock implements BannerRepository {
  BannerRepositoryMock({
    List<HomeBanner>? banners,
    DateTime Function()? now,
    this.delay = const Duration(milliseconds: 250),
  }) : _now = now ?? DateTime.now,
       _banners = List.unmodifiable(banners ?? _seed((now ?? DateTime.now)()));
  final List<HomeBanner> _banners;
  final DateTime Function() _now;
  final Duration delay;

  static List<HomeBanner> _seed(DateTime now) => [
    const HomeBanner(
      id: 'banner-home',
      title: 'اختيارات جديدة كل يوم',
      subtitle: 'اكتشف المواد المتوفرة في المتجر واختر ما يناسبك.',
      imageUrl: 'https://picsum.photos/seed/shubayr-home/1200/600',
      sortOrder: 2,
    ),
    const HomeBanner(
      id: 'banner-offers',
      title: 'تسوّق واكتشف العروض',
      subtitle: 'مواد مختارة بأسعار خاصة.',
      ctaText: 'اعرف المزيد',
      imageUrl: 'https://picsum.photos/seed/shubayr-offers/1200/600',
      // Example destination until real campaign content is configured.
      linkUrl: 'https://example.com/',
      sortOrder: 1,
    ),
    HomeBanner(
      id: 'banner-future',
      title: 'قريبًا',
      imageUrl: '',
      startsAt: now.add(const Duration(days: 1)),
    ),
    HomeBanner(
      id: 'banner-expired',
      title: 'انتهى العرض',
      imageUrl: '',
      endsAt: now.subtract(const Duration(days: 1)),
    ),
    const HomeBanner(
      id: 'banner-disabled',
      title: 'غير نشط',
      imageUrl: '',
      isActive: false,
    ),
  ];

  @override
  Future<List<HomeBanner>> fetchBanners() async {
    await Future<void>.delayed(delay);
    final now = _now();
    // Preserve fixture order for equal sort_order; the contract has no tie-breaker.
    final active =
        _banners.indexed.where((entry) => entry.$2.activeAt(now)).toList()
          ..sort((a, b) {
            final order = a.$2.sortOrder.compareTo(b.$2.sortOrder);
            return order != 0 ? order : a.$1.compareTo(b.$1);
          });
    return List.unmodifiable(active.map((entry) => entry.$2));
  }
}

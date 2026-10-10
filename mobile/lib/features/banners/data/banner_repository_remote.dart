import '../../../core/network/api_client.dart';
import '../../../core/error/response_decode.dart';
import '../domain/banner_repository.dart';
import 'home_banner.dart';

class BannerRepositoryRemote implements BannerRepository {
  const BannerRepositoryRemote(this.api);
  final ApiClient api;
  @override
  Future<List<HomeBanner>> fetchBanners() => decodeResponse(() async {
    final data = await api.get<List<dynamic>>('/banners');
    return data
        .map((value) => HomeBanner.fromJson(value as Map<String, dynamic>))
        .toList();
  });
}

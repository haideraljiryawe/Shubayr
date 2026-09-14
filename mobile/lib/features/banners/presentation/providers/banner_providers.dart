import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../data/banner_repository_mock.dart';
import '../../data/banner_repository_remote.dart';
import '../../data/home_banner.dart';
import '../../domain/banner_repository.dart';

final bannerRepositoryProvider = Provider<BannerRepository>(
  (ref) => switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => BannerRepositoryMock(),
    DataSource.remote => BannerRepositoryRemote(ref.watch(apiClientProvider)),
  },
);

final homeBannersProvider = FutureProvider.autoDispose<List<HomeBanner>>(
  (ref) => ref.watch(bannerRepositoryProvider).fetchBanners(),
);

/// Launch directly from the tap, without an asynchronous availability preflight,
/// so browsers retain the user gesture needed to open an external tab.
final bannerLinkLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) => (uri) {
    if (!['https', 'http'].contains(uri.scheme) || uri.host.isEmpty) {
      return Future.value(false);
    }
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  },
);

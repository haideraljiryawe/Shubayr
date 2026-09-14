import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/banners/data/banner_repository_mock.dart';
import 'package:shubayr/features/banners/data/banner_repository_remote.dart';
import 'package:shubayr/features/banners/data/home_banner.dart';

void main() {
  final time = DateTime.utc(2026, 9, 11, 12);
  HomeBanner banner(
    String id, {
    int order = 0,
    bool active = true,
    DateTime? start,
    DateTime? end,
  }) => HomeBanner(
    id: id,
    title: id,
    imageUrl: 'https://example.com/banner.jpg',
    sortOrder: order,
    isActive: active,
    startsAt: start,
    endsAt: end,
  );
  test(
    'active list filters optional windows at read time and sorts before returning',
    () async {
      var now = time;
      final repo = BannerRepositoryMock(
        delay: Duration.zero,
        now: () => now,
        banners: [
          banner('later-order', order: 9),
          banner('first', order: 1),
          banner('disabled', active: false),
          banner('future', start: time.add(const Duration(hours: 1))),
          banner('expired', end: time.subtract(const Duration(seconds: 1))),
          banner('at-start', order: 2, start: time),
          banner('at-end', order: 2, end: time),
          banner(
            'offset',
            order: 3,
            start: DateTime.parse('2026-09-11T15:00:00+03:00'),
          ),
        ],
      );
      expect((await repo.fetchBanners()).map((b) => b.id), [
        'first',
        'at-start',
        'at-end',
        'offset',
        'later-order',
      ]);
      now = time.add(const Duration(hours: 2));
      expect((await repo.fetchBanners()).map((b) => b.id), [
        'future',
        'first',
        'at-start',
        'offset',
        'later-order',
      ]);
    },
  );
  test('empty active set returns no placeholder records', () async {
    final repo = BannerRepositoryMock(
      delay: Duration.zero,
      now: () => time,
      banners: [banner('disabled', active: false)],
    );
    expect(await repo.fetchBanners(), isEmpty);
  });
  test(
    'remote reads public array without paging or invented language fields',
    () async {
      final dio = Dio();
      addTearDown(dio.close);
      late RequestOptions request;
      final json = {
        ...banner('remote').toJson(),
        'title': 'Supplied title',
        'subtitle': null,
        'cta_text': 'Open',
        'link_url': 'https://example.com/',
        'created_at': time.toIso8601String(),
      };
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (r, h) {
            request = r;
            h.resolve(
              Response<List<dynamic>>(
                requestOptions: r,
                statusCode: 200,
                data: [json],
              ),
            );
          },
        ),
      );
      final result = await BannerRepositoryRemote(
        ApiClient(dio),
      ).fetchBanners();
      expect(request.path, '/banners');
      expect(request.queryParameters, isEmpty);
      final read = HomeBanner.fromJson(result.single.toJson());
      expect(read.title, 'Supplied title');
      expect(read.subtitle, isNull);
      expect(read.ctaText, 'Open');
      expect(read.createdAt, time);
      expect(read.toJson().containsKey('title_ar'), isFalse);
    },
  );
  for (final url in <String?>[
    null,
    '',
    'not a url',
    'javascript:alert(1)',
    'file:///tmp/private',
    'https://',
    'https://example.com/',
  ]) {
    test('only usable web destinations are actionable: $url', () {
      final b = HomeBanner(id: 'a', title: 'A', imageUrl: '', linkUrl: url);
      expect(b.webLink != null, url == 'https://example.com/');
    });
  }
}

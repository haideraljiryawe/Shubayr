import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_view/photo_view_gallery.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_detail_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

// Seed the actual provider keys with controlled codec streams. This exercises
// both production viewers and the package's MultiImageStreamCompleter without
// depending on Picsum availability or the device's persistent disk cache.
Future<List<StreamController<ui.Codec>>> mountDetails(
  WidgetTester tester,
  String language,
) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(390, 1000);
  addTearDown(tester.view.reset);
  final repository = CatalogRepositoryMock(delay: Duration.zero);
  final product = (await tester.runAsync(() => repository.fetchProduct('p1')))!;
  final cache = PaintingBinding.instance.imageCache;
  cache.clear();
  cache.clearLiveImages();
  final streams = <StreamController<ui.Codec>>[];
  for (final url in product.images) {
    final stream = StreamController<ui.Codec>();
    streams.add(stream);
    cache.putIfAbsent(
      CachedNetworkImageProvider(url),
      () => MultiImageStreamCompleter(codec: stream.stream, scale: 1),
    );
  }
  addTearDown(() async {
    cache.clear();
    cache.clearLiveImages();
    for (final stream in streams) {
      await stream.close();
    }
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        notificationSyncProvider.overrideWith((ref) {}),
        unreadCountProvider.overrideWith((ref) async => 0),
        dataSourceProvider.overrideWithValue(DataSource.mock),
        catalogRepositoryProvider.overrideWithValue(repository),
        brandProvider.overrideWithValue(const Brand.bundled()),
      ],
      child: MaterialApp(
        locale: Locale(language),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const ProductDetailScreen(productId: 'p1'),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 1));
  return streams;
}

Future<void> swipe(WidgetTester tester, Finder pager, String language) async {
  await tester.drag(pager, Offset(language == 'ar' ? 320 : -320, 0));
  await tester.pump();
  await tester.pump(const Duration(seconds: 1));
}

Future<void> failImage(
  WidgetTester tester,
  StreamController<ui.Codec> stream,
  String failure,
) async {
  if (failure == 'http') {
    stream.addError(const HttpException('image response: 503'));
  } else {
    // Use the real decoder error for a response containing non-image bytes.
    final result = await tester.runAsync(() async {
      try {
        final codec = await ui.instantiateImageCodec(
          Uint8List.fromList('<html>not an image</html>'.codeUnits),
        );
        codec.dispose();
        return null;
      } catch (error, stack) {
        return (error, stack);
      }
    });
    expect(result, isNotNull);
    stream.addError(result!.$1, result.$2);
  }
  await tester.pump();
}

void main() {
  for (final language in ['ar', 'en']) {
    testWidgets('rapid paging and closing while images are pending $language', (
      tester,
    ) async {
      final streams = await mountDetails(tester, language);
      final main = find.byKey(const ValueKey('gallery-main'));
      final mainController = tester.widget<PageView>(main).controller!;
      for (final index in [1, 2, 3, 2, 0, 3, 1]) {
        mainController.jumpToPage(index);
        await tester.pump(const Duration(milliseconds: 16));
      }
      await tester.tap(main);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      final viewerController = tester
          .widget<PhotoViewGallery>(find.byType(PhotoViewGallery))
          .pageController!;
      for (final index in [2, 3, 1, 0, 3, 2]) {
        viewerController.jumpToPage(index);
        await tester.pump(const Duration(milliseconds: 16));
      }
      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpWidget(const SizedBox.shrink());
      // Late completion after both controllers and image listeners detach.
      for (final stream in streams) {
        stream.addError(const SocketException('late connection failure'));
      }
      await tester.pump();
      expect(tester.takeException(), isNull);
    });

    for (final failure in ['http', 'invalid bytes']) {
      testWidgets('detail carousel handles late $failure $language', (
        tester,
      ) async {
        final streams = await mountDetails(tester, language);
        final main = find.byKey(const ValueKey('gallery-main'));
        await swipe(tester, main, language);
        await failImage(tester, streams[1], failure);
        await tester.pump(const Duration(seconds: 1));
        expect(find.byIcon(Icons.image_outlined), findsOneWidget);
        expect(tester.takeException(), isNull);
        await swipe(tester, main, language);
        await swipe(tester, main, language);
        expect(tester.widget<PageView>(main).controller!.page, 3);
        await tester.pumpWidget(const SizedBox.shrink());
        expect(tester.takeException(), isNull);
      });

      testWidgets('full-screen paging handles late $failure $language', (
        tester,
      ) async {
        final streams = await mountDetails(tester, language);
        final main = find.byKey(const ValueKey('gallery-main'));
        await tester.tap(main);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        final viewer = find.byType(PhotoViewGallery);
        await swipe(tester, viewer, language);
        await swipe(tester, viewer, language);
        await swipe(tester, viewer, language);
        expect(
          find.text(language == 'ar' ? '4 من 4' : '4 of 4'),
          findsOneWidget,
        );
        await failImage(tester, streams[3], failure);
        expect(tester.takeException(), isNull);
        expect(find.byIcon(Icons.image_outlined), findsOneWidget);
        // A failed page still permits navigating back and closing the viewer.
        await swipe(tester, viewer, language == 'ar' ? 'en' : 'ar');
        expect(
          find.text(language == 'ar' ? '3 من 4' : '3 of 4'),
          findsOneWidget,
        );
        await tester.tap(find.byIcon(Icons.close));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        // Both viewers resolve the same failed stream when this page is visited.
        await swipe(tester, main, language);
        await swipe(tester, main, language);
        await swipe(tester, main, language);
        await tester.pump(const Duration(seconds: 1));
        expect(find.byIcon(Icons.image_outlined), findsOneWidget);
        await tester.pumpWidget(const SizedBox.shrink());
        expect(tester.takeException(), isNull);
      });
    }
  }
}

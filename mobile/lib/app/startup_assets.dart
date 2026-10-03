import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../core/theme/tokens/app_typography.dart';
import '../core/diagnostics/diagnostics.dart';

/// Local presentation resources only. No session or page-data work belongs here.
abstract final class StartupAssets {
  // ExactAssetImage resolves synchronously once cached, including on the first
  // build. Native launch stays background-only until this artwork is ready.
  static const logo = ExactAssetImage(
    'assets/images/branding/shubayr-logo.png',
  );

  static Future<void> prepare({AssetBundle? bundle}) async {
    final assets = bundle ?? rootBundle;
    await Future.wait([
      _optional(() => _prepareLogo(assets)),
      _optional(() {
        final wordmark = FontLoader(AppTypography.brandFontFamily)
          ..addFont(assets.load('assets/fonts/Zain-Bold.ttf'));
        return wordmark.load();
      }),
    ]);
  }

  // Artwork/font failures are presentation failures, not authorization or
  // configuration failures. Keep unrelated programmer errors visible.
  static Future<void> _optional(Future<void> Function() load) async {
    try {
      await load().timeout(const Duration(seconds: 5));
    } on Exception catch (error, stack) {
      Diagnostics.report(error, stack, boundary: 'startup.asset');
    } on FlutterError catch (error, stack) {
      Diagnostics.report(error, stack, boundary: 'startup.asset');
    }
  }

  static Future<void> _prepareLogo(AssetBundle bundle) {
    final ready = Completer<void>();
    final stream = logo.resolve(ImageConfiguration(bundle: bundle));
    late final ImageStreamListener listener;
    listener = ImageStreamListener(
      (image, synchronousCall) {
        stream.removeListener(listener);
        image.dispose();
        ready.complete();
      },
      onError: (Object error, StackTrace? stack) {
        stream.removeListener(listener);
        ready.completeError(error, stack);
      },
    );
    stream.addListener(listener);
    return ready.future;
  }
}

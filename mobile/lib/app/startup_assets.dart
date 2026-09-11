import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../core/theme/tokens/app_typography.dart';

/// Local presentation resources only. No session or page-data work belongs here.
abstract final class StartupAssets {
  // ExactAssetImage resolves synchronously once cached, including on the first
  // build. Native launch stays background-only until this artwork is ready.
  static const logo = ExactAssetImage(
    'assets/images/branding/shubayr-logo.png',
  );

  static Future<void> prepare() async {
    final wordmark = FontLoader(AppTypography.brandFontFamily)
      ..addFont(rootBundle.load('assets/fonts/Zain-Bold.ttf'));
    await Future.wait([_prepareLogo(), wordmark.load()]);
  }

  static Future<void> _prepareLogo() {
    final ready = Completer<void>();
    final stream = logo.resolve(ImageConfiguration(bundle: rootBundle));
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

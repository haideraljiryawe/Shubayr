import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/bootstrap.dart';
import 'package:shubayr/app/startup_assets.dart';
import 'package:shubayr/app/splash_screen.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/widgets/state_views.dart';

class _MissingAssets extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async =>
      throw FlutterError('Missing private asset path');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'platform preference failure uses defaults without discarding authentication',
    () async {
      final prefs = await PrefsStore.load(
        loader: () async =>
            throw PlatformException(code: 'unavailable', message: 'secret'),
      );
      expect(prefs.readLocaleCode(), isNull);
      expect(prefs.readThemeMode(), isNull);
      await prefs.writeLocaleCode('en');
      // A later platform load is retried rather than caching a failed store forever.
      SharedPreferences.setMockInitialValues({'app.locale': 'en'});
      expect((await PrefsStore.load()).readLocaleCode(), 'en');
    },
  );
  testWidgets(
    'an optional preference store cannot hold native startup indefinitely',
    (tester) async {
      final pending = Completer<SharedPreferences>();
      final loading = PrefsStore.load(loader: () => pending.future);
      await tester.pump(const Duration(seconds: 5));
      final prefs = await loading;
      expect(prefs.readLocaleCode(), isNull);
    },
  );
  test('configuration is checked before optional stores/assets', () async {
    var called = false;
    await expectLater(
      prepareApplication(
        configuration: () => throw const AppFailure(
          FailureKind.unknown,
          code: 'INVALID_API_CONFIGURATION',
        ),
        preferences: () async {
          called = true;
          return const PrefsStore.unavailable();
        },
        assets: () async {
          called = true;
        },
      ),
      throwsA(isA<AppFailure>()),
    );
    expect(called, isFalse);
  });
  testWidgets('optional missing logo/font do not fail resource preparation', (
    tester,
  ) async {
    await tester.runAsync(
      () => StartupAssets.prepare(bundle: _MissingAssets()),
    );
    expect(tester.takeException(), isNull);
  });
  for (final language in ['ar', 'en']) {
    testWidgets(
      'mandatory startup failure shows localized error and retry succeeds: $language',
      (tester) async {
        tester.binding.platformDispatcher.localeTestValue = Locale(language);
        addTearDown(tester.binding.platformDispatcher.clearLocaleTestValue);
        Widget? launched;
        var attempts = 0;
        final pending = Completer<ProviderContainer>();
        final c = ProviderContainer();
        addTearDown(c.dispose);
        await startApplication(
          launch: (widget) => launched = widget,
          prepare: () async {
            attempts++;
            if (attempts == 1) throw StateError('private-startup-error');
            return pending.future;
          },
        );
        await tester.pumpWidget(launched!);
        await tester.pumpAndSettle();
        final l = AppLocalizations.of(
          tester.element(find.byType(SplashScreen)),
        );
        expect(find.byType(AppErrorView), findsOneWidget);
        expect(find.text(l.errorUnknown), findsOneWidget);
        expect(find.textContaining('private-startup-error'), findsNothing);
        await tester.tap(find.text(l.actionRetry));
        await tester.tap(find.text(l.actionRetry));
        expect(attempts, 2);
        // Existing error UI remains visible while a retry is pending.
        expect(launched, isA<MaterialApp>());
        pending.complete(c);
        await tester.pump();
        expect(launched, isA<UncontrolledProviderScope>());
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
  testWidgets(
    'immutable invalid release config has a clear error without futile retry',
    (tester) async {
      Widget? launched;
      await startApplication(
        launch: (w) => launched = w,
        prepare: () async => throw const AppFailure(
          FailureKind.unknown,
          code: 'INVALID_API_CONFIGURATION',
        ),
      );
      await tester.pumpWidget(launched!);
      await tester.pumpAndSettle();
      final l = AppLocalizations.of(tester.element(find.byType(SplashScreen)));
      expect(find.text(l.startupConfigurationError), findsOneWidget);
      expect(find.text(l.actionRetry), findsNothing);
    },
  );
}

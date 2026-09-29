import 'package:shubayr/features/monitoring/presentation/monitor_providers.dart';
import '../features/monitoring/monitoring_test.dart' show RecordingMonitor;
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/app/splash_screen.dart';
import 'package:shubayr/app/startup_assets.dart';
import 'package:shubayr/app/startup_display_controller.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/settings/data/store_settings.dart';
import 'package:shubayr/features/settings/domain/settings_repository.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

class _Tokens extends InMemoryTokenStore {
  final pending = Completer<String?>();
  int reads = 0;

  @override
  Future<String?> readAccessToken() {
    reads++;
    return pending.future;
  }
}

class _Auth extends AuthRepositoryMock {
  final pending = Completer<User>();
  int reads = 0;

  @override
  Future<User> currentUser() {
    reads++;
    return pending.future;
  }
}

class _Settings implements SettingsRepository {
  final pending = Completer<StoreSettings>();

  @override
  Future<StoreSettings> fetch() => pending.future;
}

void main() {
  testWidgets(
    'fast restoration still displays startup for two seconds and preserves returnTo',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final container = ProviderContainer(
        retry: (retryCount, error) => null,
        overrides: [
          notificationSyncProvider.overrideWith((ref) {}),
          unreadCountProvider.overrideWith((ref) async => 0),
          dataSourceProvider.overrideWithValue(DataSource.mock),
          monitorRepositoryProvider.overrideWithValue(RecordingMonitor()),
          prefsStoreProvider.overrideWithValue(
            PrefsStore(await SharedPreferences.getInstance()),
          ),
          tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
          homeBannersProvider.overrideWith((ref) async => []),
        ],
      );
      addTearDown(container.dispose);
      final router = container.read(routerProvider);
      addTearDown(router.dispose);
      router.go('/categories');
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const ShubayrApp(),
        ),
      );
      await tester.pump();
      expect(find.byType(SplashScreen), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 1999));
      expect(router.routeInformationProvider.value.uri.path, '/splash');
      expect(
        container.read(sessionControllerProvider).requireValue.isSignedIn,
        isFalse,
      );
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump();
      expect(router.routeInformationProvider.value.uri.path, '/categories');
      await tester.pumpAndSettle();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(find.byType(SplashScreen), findsNothing);
      expect(router.routeInformationProvider.value.uri.path, '/categories');
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'startup display timer starts once and cancels with its container',
    (tester) async {
      final container = ProviderContainer(retry: (retryCount, error) => null);
      final display = container.read(startupDisplayReadyProvider.notifier);
      display.beginDisplay();
      await tester.pump(const Duration(seconds: 1));
      display.beginDisplay();
      await tester.pump(const Duration(seconds: 1));
      expect(container.read(startupDisplayReadyProvider), isTrue);
      container.dispose();
      final disposed = ProviderContainer(retry: (retryCount, error) => null);
      disposed.read(startupDisplayReadyProvider.notifier).beginDisplay();
      disposed.dispose();
      await tester.pump(const Duration(seconds: 3));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('prepared logo is decoded in the very first Flutter frame', (
    tester,
  ) async {
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    await tester.runAsync(StartupAssets.prepare);
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('ar'),
        theme: AppTheme.light(const Brand.bundled()),
        home: const SplashScreen(),
      ),
    );
    // Do not pump again: text must never be presented alone on the first frame.
    expect(tester.widget<RawImage>(find.byType(RawImage)).image, isNotNull);
    expect(find.text('شُبَيّر'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets(
        'startup fits $locale ${dark ? 'dark' : 'light'} and large text',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          for (final size in [
            const Size(320, 568),
            const Size(390, 844),
            const Size(600, 900),
            const Size(900, 600),
            const Size(1200, 800),
            const Size(1536, 960),
            const Size(1920, 1080),
            const Size(568, 320),
          ]) {
            tester.view.physicalSize = size;
            await tester.pumpWidget(
              MaterialApp(
                locale: Locale(locale),
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                theme: dark
                    ? AppTheme.dark(const Brand.bundled())
                    : AppTheme.light(const Brand.bundled()),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: TextScaler.linear(2),
                    padding: const EdgeInsets.only(top: 44, bottom: 34),
                  ),
                  child: child!,
                ),
                home: const SplashScreen(),
              ),
            );
            await tester.pump();
            final context = tester.element(find.byType(SplashScreen));
            expect(
              Directionality.of(context),
              locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
            );
            expect(
              find.text(locale == 'ar' ? 'شُبَيّر' : 'Shubayr'),
              findsOneWidget,
            );
            expect(
              find.text(
                locale == 'ar'
                    ? 'كل ما تحتاجه في مكان واحد'
                    : 'Everything you need, all in one place',
              ),
              findsOneWidget,
            );
            final bar = tester.widget<LinearProgressIndicator>(
              find.byType(LinearProgressIndicator),
            );
            expect(bar.value, isNull);
            final tagline = find.text(
              locale == 'ar'
                  ? 'كل ما تحتاجه في مكان واحد'
                  : 'Everything you need, all in one place',
            );
            final progress = find.byType(LinearProgressIndicator);
            final captionRect = tester.getRect(tagline);
            final progressRect = tester.getRect(progress);
            expect(progressRect.width, closeTo(captionRect.width, 0.01));
            expect(progressRect.top - captionRect.bottom, AppSpacing.md);
            expect(progressRect.height, AppSpacing.xs);
            final logoRect = tester.getRect(find.byType(Image));
            final groupHeight = progressRect.bottom - logoRect.top;
            final safeHeight = size.height - 44 - 34;
            if (groupHeight <= safeHeight - AppSpacing.xl * 2) {
              expect(
                (logoRect.top + progressRect.bottom) / 2,
                closeTo(44 + safeHeight / 2, 0.01),
              );
            }
            // A short landscape window with enlarged text scrolls the complete
            // identity group; the bar must remain reachable with its caption.
            await tester.ensureVisible(progress);
            await tester.pump();
            expect(
              tester.getRect(progress).bottom,
              lessThanOrEqualTo(size.height - 34),
            );
            expect(tester.takeException(), isNull, reason: '$size');
          }
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          expect(tester.binding.transientCallbackCount, 0);
        },
      );
    }
  }

  for (final outcome in [
    'guest',
    'customer',
    'delivery_agent',
    'order_monitor',
    'offline',
    'storage-error',
  ]) {
    testWidgets('restoration → $outcome; no optional-data wait or resume splash', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({
        'app.locale': 'en',
        'app.theme_mode': 'dark',
      });
      final prefs = await SharedPreferences.getInstance();
      final tokens = _Tokens();
      final auth = _Auth();
      final settings = _Settings();
      final banners = Completer<List<Never>>();
      var bannerReads = 0;
      final container = ProviderContainer(
        retry: (retryCount, error) => null,
        overrides: [
          notificationSyncProvider.overrideWith((ref) {}),
          unreadCountProvider.overrideWith((ref) async => 0),
          dataSourceProvider.overrideWithValue(DataSource.mock),
          monitorRepositoryProvider.overrideWithValue(RecordingMonitor()),
          prefsStoreProvider.overrideWithValue(PrefsStore(prefs)),
          tokenStoreProvider.overrideWithValue(tokens),
          authRepositoryProvider.overrideWithValue(auth),
          settingsRepositoryProvider.overrideWithValue(settings),
          homeBannersProvider.overrideWith((ref) {
            bannerReads++;
            return banners.future;
          }),
        ],
      );
      addTearDown(container.dispose);
      // Same work started by bootstrap, deliberately never completing settings.
      container.read(sessionControllerProvider);
      final refresh = container.read(storeSettingsProvider.notifier).refresh();
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const ShubayrApp(),
        ),
      );
      final router = container.read(routerProvider);
      addTearDown(router.dispose);
      await tester.pump();
      expect(find.byType(SplashScreen), findsOneWidget);
      expect(bannerReads, 0);
      final context = tester.element(find.byType(SplashScreen));
      expect(Localizations.localeOf(context).languageCode, 'en');
      expect(Theme.of(context).brightness, Brightness.dark);
      await tester.pump(const Duration(seconds: 6));
      expect(find.byType(SplashScreen), findsOneWidget);
      if (outcome == 'storage-error') {
        tokens.pending.completeError(StateError('storage unavailable'));
      } else {
        tokens.pending.complete(outcome == 'guest' ? null : 'stored-token');
      }
      await tester.pump();
      if (outcome != 'guest' && outcome != 'storage-error') {
        expect(find.byType(SplashScreen), findsOneWidget);
        if (outcome == 'offline') {
          auth.pending.completeError(const AppFailure(FailureKind.network));
        } else {
          auth.pending.complete(User(id: 'restored', role: outcome));
        }
      }
      // The two-second window already elapsed; do not add another wait after auth.
      await tester.pump();
      await tester.pump();
      expect(router.routeInformationProvider.value.uri.path, switch (outcome) {
        'delivery_agent' => '/delivery',
        'order_monitor' => '/monitor/orders',
        _ => '/home',
      });
      await tester.pump(const Duration(seconds: 1));
      expect(find.byType(SplashScreen), findsNothing);
      settings.pending.completeError(
        StateError('optional settings unavailable'),
      );
      await refresh;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(find.byType(SplashScreen), findsNothing);
      expect(tokens.reads, 1);
      expect(auth.reads, ['guest', 'storage-error'].contains(outcome) ? 0 : 1);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 1));
      expect(tester.takeException(), isNull);
    });
  }
}

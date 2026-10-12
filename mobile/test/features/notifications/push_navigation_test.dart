import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/app/startup_display_controller.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/session_credentials.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/notifications/data/notification_repository.dart';
import 'package:shubayr/features/notifications/domain/push_client.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/features/notifications/presentation/notifications_screen.dart';
import 'package:shubayr/features/notifications/presentation/push_providers.dart';
import '../../helpers/test_session.dart';

class _Ready extends StartupDisplayController {
  @override
  bool build() => false;
  @override
  void beginDisplay() {}
  void ready() => state = true;
}

class _Inbox extends NotificationRepository {
  _Inbox() : super(ApiClient(Dio()));
  @override
  Future<int> unreadCount() async => 0;
  @override
  Future<InboxPage> fetch({int page = 1}) async =>
      InboxPage(page: page, total: 0, items: []);
}

class _Client implements PushClient {
  final messages = StreamController<PushEvent>.broadcast();
  bool initial = false;
  @override
  String get platform => 'ios';
  @override
  Future<PushPermission> permission({bool request = false}) async =>
      PushPermission.authorized;
  @override
  Future<String?> token() async => 'fixture-token';
  @override
  Future<void> resetToken() async {}
  @override
  Stream<String> get tokenChanges => const Stream.empty();
  @override
  Stream<PushEvent> get events => messages.stream;
  @override
  Future<bool> initiallyOpened() async => initial;
}

class _Devices implements DeviceRegistration {
  Completer<void>? gate;
  @override
  Future<void> register(
    String token,
    String platform,
    String locale,
    int revision,
  ) async => await gate?.future;
  @override
  Future<void> unregister(String token, int revision) async {}
}

class _Harness {
  final session = TestSession();
  final events = StreamController<OwnedPushEvent>.broadcast();
  late ProviderContainer container;
  Future<void> mount(
    WidgetTester tester, {
    String language = 'en',
    bool ready = true,
    _Client? client,
    _Devices? devices,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await tester.runAsync(
      () async => PrefsStore(await SharedPreferences.getInstance()),
    );
    container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        dataSourceProvider.overrideWithValue(DataSource.mock),
        prefsStoreProvider.overrideWithValue(prefs!),
        tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
        sessionControllerProvider.overrideWith(() => session),
        notificationRepositoryProvider.overrideWithValue(_Inbox()),
        categoriesProvider.overrideWith((ref) async => []),
        homeOffersProvider.overrideWith(
          (ref) async => const ProductPage(total: 0, data: []),
        ),
        homeBannersProvider.overrideWith((ref) async => []),
        startupDisplayReadyProvider.overrideWith(_Ready.new),
        if (client == null) ...[
          pushSyncProvider.overrideWith((ref) {}),
          pushEventsProvider.overrideWith((ref) => events.stream),
        ] else ...[
          pushClientFactoryProvider.overrideWithValue(() async => client),
          deviceRegistrationProvider.overrideWithValue(devices!),
        ],
      ],
    );
    await tester.runAsync(() async {
      await container.read(sessionControllerProvider.future);
      await container
          .read(localeControllerProvider.notifier)
          .setLocale(Locale(language));
    });
    if (ready) this.ready();
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const ShubayrApp(),
      ),
    );
    if (ready) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
    }
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      final router = container.read(routerProvider);
      container.dispose();
      router.dispose();
      await events.close();
      await client?.messages.close();
    });
  }

  void ready() =>
      (container.read(startupDisplayReadyProvider.notifier) as _Ready).ready();
  void emit(PushEvent event) =>
      events.add((event: event, owner: container.read(pushOwnerProvider)!));
  void changeSession(Session next) {
    container.read(sessionCredentialsProvider).beginTransition();
    session.setSession(next);
  }
}

void _expectInbox(WidgetTester tester, _Harness h, String language) {
  expect(
    h.container.read(routerProvider).state.uri.path,
    AppRoutes.pushNotifications,
  );
  expect(find.byType(NotificationsScreen), findsOneWidget);
  expect(find.byType(BackButton), findsOneWidget);
  expect(find.byType(HomeScreen, skipOffstage: false), findsOneWidget);
  expect(h.container.read(routerProvider).canPop(), isTrue);
  final bounds = tester.getRect(find.byType(BackButton));
  expect(bounds.center.dx < 400, language == 'en');
}

void _expectHome(_Harness h) {
  expect(h.container.read(routerProvider).state.uri.path, AppRoutes.home);
  expect(find.byType(HomeScreen), findsOneWidget);
  expect(find.byType(NotificationsScreen, skipOffstage: false), findsNothing);
  expect(find.byType(HomeScreen, skipOffstage: false), findsOneWidget);
  expect(h.container.read(routerProvider).canPop(), isFalse);
}

void main() {
  setUpAll(() async {
    await (FontLoader('Zain')
          ..addFont(rootBundle.load('assets/fonts/Zain-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Zain-Bold.ttf')))
        .load();
  });
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final language in ['en', 'ar']) {
      testWidgets(
        'FCM stack, repeated opens, snackbar and native Back: $platform $language',
        (tester) async {
          final h = _Harness();
          await h.mount(tester, language: language);
          final router = h.container.read(routerProvider);
          router.go(AppRoutes.account);
          await tester.pumpAndSettle();
          h.emit(PushEvent.foreground);
          await tester.pumpAndSettle();
          final action = tester.widget<SnackBar>(find.byType(SnackBar)).action!;
          await tester.tap(
            find.descendant(
              of: find.byType(SnackBar),
              matching: find.text(action.label),
            ),
          );
          await tester.pumpAndSettle();
          _expectInbox(tester, h, language);
          await tester.tap(find.byType(BackButton));
          await tester.pumpAndSettle();
          _expectHome(h);
          router.go(AppRoutes.account);
          await tester.pumpAndSettle();
          for (var i = 0; i < 3; i++) {
            h.emit(PushEvent.opened);
            await tester.pumpAndSettle();
            _expectInbox(tester, h, language);
          }
          if (platform == TargetPlatform.android) {
            await tester.binding.handlePopRoute();
          } else {
            final rtl = language == 'ar';
            final width =
                tester.view.physicalSize.width / tester.view.devicePixelRatio;
            final start = Offset(rtl ? width - 1 : 1, 200);
            // A cancelled gesture must keep the inbox and its underlying Home.
            final gesture = await tester.startGesture(start);
            await gesture.moveBy(Offset(rtl ? -50 : 50, 0));
            await tester.pump(const Duration(milliseconds: 300));
            await gesture.up();
            await tester.pumpAndSettle();
            _expectInbox(tester, h, language);
            await tester.dragFrom(
              start,
              Offset((rtl ? -1 : 1) * width * .8, 0),
            );
          }
          await tester.pumpAndSettle();
          _expectHome(h);
          expect(tester.takeException(), isNull);
        },
        variant: TargetPlatformVariant({platform}),
      );
    }
  }
  testWidgets(
    'cold FCM waits for registration and startup, then Back returns Home',
    (tester) async {
      final client = _Client()..initial = true;
      final devices = _Devices()..gate = Completer<void>();
      final h = _Harness();
      await h.mount(tester, ready: false, client: client, devices: devices);
      expect(h.container.read(routerProvider).state.uri.path, AppRoutes.splash);
      devices.gate!.complete();
      await tester.pump();
      await tester.pump();
      expect(find.byType(NotificationsScreen), findsNothing);
      h.ready();
      await tester.pumpAndSettle();
      _expectInbox(tester, h, 'en');
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      _expectHome(h);
    },
  );
  for (final next in [
    const Session.signedOut(),
    customerSession,
    const Session.signedIn(User(id: 'other', role: 'customer')),
  ]) {
    testWidgets(
      'stale pending open and snackbar cannot cross session transition: ${next.user?.id}',
      (tester) async {
        final h = _Harness();
        await h.mount(tester, ready: false);
        final oldOwner = h.container.read(pushOwnerProvider)!;
        h.emit(PushEvent.opened);
        await tester.pump();
        await tester.pump();
        h.changeSession(next);
        h.ready();
        await tester.pumpAndSettle();
        _expectHome(h);
        h.events.add((event: PushEvent.opened, owner: oldOwner));
        await tester.pumpAndSettle();
        _expectHome(h);
        h.changeSession(customerSession);
        await tester.pumpAndSettle();
        h.emit(PushEvent.foreground);
        await tester.pumpAndSettle();
        final staleAction = tester
            .widget<SnackBar>(find.byType(SnackBar))
            .action!
            .onPressed;
        h.changeSession(next);
        await tester.pumpAndSettle();
        staleAction();
        // Allow the existing delayed cart fixture to finish after account change.
        await tester.pump(const Duration(seconds: 1));
        await tester.pumpAndSettle();
        _expectHome(h);
      },
    );
  }
  testWidgets(
    'both inbox routes remain private and logout removes the open inbox',
    (tester) async {
      final h = _Harness();
      await h.mount(tester);
      h.emit(PushEvent.opened);
      await tester.pumpAndSettle();
      _expectInbox(tester, h, 'en');
      h.changeSession(const Session.signedOut());
      await tester.pumpAndSettle();
      final router = h.container.read(routerProvider);
      expect(router.state.uri.path, AppRoutes.signIn);
      expect(find.byType(NotificationsScreen), findsNothing);
      for (final path in [
        AppRoutes.notifications,
        AppRoutes.pushNotifications,
      ]) {
        router.go(path);
        await tester.pumpAndSettle();
        expect(router.state.uri.path, AppRoutes.signIn);
        expect(find.byType(NotificationsScreen), findsNothing);
      }
    },
  );
}

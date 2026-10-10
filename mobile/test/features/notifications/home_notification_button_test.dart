import 'package:dio/dio.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/brand_mark.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/features/notifications/data/notification_repository.dart';
import 'package:shubayr/features/notifications/presentation/notification_button.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/features/notifications/presentation/notifications_screen.dart';
import 'package:shubayr/features/settings/presentation/screens/account_view.dart';

import '../../helpers/test_session.dart';

class _Inbox extends NotificationRepository {
  _Inbox() : super(ApiClient(Dio()));

  int count = 2;
  int countRequests = 0;
  int pageRequests = 0;
  final reads = <String>{};

  @override
  Future<int> unreadCount() async {
    countRequests++;
    return count;
  }

  @override
  Future<InboxPage> fetch({int page = 1}) async {
    pageRequests++;
    return InboxPage(
      page: page,
      total: 2,
      items: [
        for (final id in ['1', '2'])
          InboxNotification(
            id: id,
            targetRole: 'customer',
            titleAr: 'إشعار $id',
            titleEn: 'Notification $id',
            bodyAr: 'تحديث الطلب',
            bodyEn: 'Order update',
            entityType: 'order',
            entityId: 'order-$id',
            createdAt: DateTime.utc(2026, 10, 1),
            readAt: reads.contains(id) ? DateTime.utc(2026, 10, 2) : null,
          ),
      ],
    );
  }

  @override
  Future<void> read(String id) async {
    if (reads.add(id)) count--;
  }
}

Future<ProviderContainer> _container(
  _Inbox inbox, {
  String language = 'en',
  TestSession? session,
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = PrefsStore(await SharedPreferences.getInstance());
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      dataSourceProvider.overrideWithValue(DataSource.mock),
      prefsStoreProvider.overrideWithValue(prefs),
      tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
      sessionControllerProvider.overrideWith(() => session ?? TestSession()),
      notificationRepositoryProvider.overrideWithValue(inbox),
      categoriesProvider.overrideWith((ref) async => []),
      homeOffersProvider.overrideWith(
        (ref) async => const ProductPage(
          total: 1,
          data: [
            Product(
              id: 'p1',
              categoryId: 'c1',
              nameEn: 'Offer',
              nameAr: 'عرض',
              effectivePrice: 1000,
            ),
          ],
        ),
      ),
      homeBannersProvider.overrideWith((ref) async => []),
    ],
  );
  await container.read(sessionControllerProvider.future);
  await container
      .read(localeControllerProvider.notifier)
      .setLocale(Locale(language));
  return container;
}

Finder _bell(Type screen) => find.descendant(
  of: find.byType(screen),
  matching: find.byType(NotificationButton),
);

void _expectCount(WidgetTester tester, Type screen, int count) {
  final badge = find.descendant(
    of: _bell(screen),
    matching: find.byType(Badge),
  );
  expect(badge, count > 0 ? findsOneWidget : findsNothing);
  expect(
    find.descendant(of: badge, matching: find.text('$count')),
    count > 0 ? findsOneWidget : findsNothing,
  );
}

void main() {
  setUpAll(() async {
    await (FontLoader('Zain')
          ..addFont(rootBundle.load('assets/fonts/Zain-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Zain-Bold.ttf')))
        .load();
  });
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final language in ['ar', 'en']) {
      testWidgets(
        'shared badges, inbox and search work on $platform $language',
        (tester) async {
          await tester.binding.setSurfaceSize(const Size(390, 1000));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          final inbox = _Inbox();
          final container = (await tester.runAsync(
            () => _container(inbox, language: language),
          ))!;
          addTearDown(container.dispose);
          await tester.pumpWidget(
            UncontrolledProviderScope(
              container: container,
              child: const ShubayrApp(),
            ),
          );
          await tester.pumpAndSettle();
          final router = container.read(routerProvider);
          final l10n = AppLocalizations.of(
            tester.element(find.byType(HomeScreen)),
          );
          _expectCount(tester, HomeScreen, 2);
          expect(inbox.countRequests, 1);
          expect(inbox.pageRequests, 0);

          // Taps one pixel either side of the shared edge stay independent.
          final searchBounds = tester.getRect(find.byTooltip(l10n.searchHint));
          final sharedEdge = language == 'ar'
              ? searchBounds.left
              : searchBounds.right;
          final towardBell = language == 'ar' ? -1.0 : 1.0;
          await tester.tapAt(
            Offset(sharedEdge - towardBell, searchBounds.center.dy),
          );
          await tester.pumpAndSettle();
          expect(router.state.uri.path, AppRoutes.search);
          await tester.tap(find.byType(BackButton));
          await tester.pumpAndSettle();
          await tester.tapAt(
            Offset(sharedEdge + towardBell, searchBounds.center.dy),
          );
          await tester.pumpAndSettle();
          expect(router.state.uri.path, AppRoutes.notifications);
          await tester.tap(find.byType(BackButton));
          await tester.pumpAndSettle();

          await tester.tap(find.byIcon(Icons.person_outline));
          await tester.pumpAndSettle();
          _expectCount(tester, AccountView, 2);
          expect(
            inbox.countRequests,
            1,
            reason: 'Account shares the Home read',
          );
          await tester.tap(_bell(AccountView));
          await tester.pumpAndSettle();
          expect(find.byType(NotificationsScreen), findsOneWidget);
          expect(router.state.uri.path, AppRoutes.notifications);
          await tester.tap(find.byType(BackButton));
          await tester.pumpAndSettle();
          expect(find.byType(AccountView), findsOneWidget);

          await tester.tap(find.byIcon(Icons.home_outlined));
          await tester.pumpAndSettle();
          for (final id in ['1', '2']) {
            await tester.tap(_bell(HomeScreen));
            await tester.pumpAndSettle();
            expect(router.state.uri.path, AppRoutes.notifications);
            expect(find.byType(NotificationsScreen), findsOneWidget);
            await tester.tap(
              find.text(language == 'ar' ? 'إشعار $id' : 'Notification $id'),
            );
            await tester.pumpAndSettle();
            expect(inbox.reads, contains(id));
            expect(router.state.uri.path, '${AppRoutes.orders}/order-$id');
            await tester.tap(find.byType(BackButton));
            await tester.pumpAndSettle();
            expect(find.byType(NotificationsScreen), findsOneWidget);
            expect(
              find.byIcon(Icons.drafts_outlined),
              findsNWidgets(int.parse(id)),
            );
            await tester.tap(find.byType(BackButton));
            await tester.pumpAndSettle();
            final count = 2 - int.parse(id);
            _expectCount(tester, HomeScreen, count);
            final requests = inbox.countRequests;
            await tester.tap(find.byIcon(Icons.person_outline));
            await tester.pumpAndSettle();
            _expectCount(tester, AccountView, count);
            await tester.tap(find.byIcon(Icons.home_outlined));
            await tester.pumpAndSettle();
            _expectCount(tester, HomeScreen, count);
            expect(inbox.countRequests, requests);
          }

          // The existing application poll updates both consumers after an
          // external status change, with exactly one shared count request.
          inbox.count = 7;
          final requests = inbox.countRequests;
          await tester.pump(const Duration(seconds: 30));
          await tester.pumpAndSettle();
          _expectCount(tester, HomeScreen, 7);
          expect(inbox.countRequests, requests + 1);
          await tester.tap(find.byIcon(Icons.person_outline));
          await tester.pumpAndSettle();
          _expectCount(tester, AccountView, 7);
          expect(inbox.countRequests, requests + 1);
          await tester.tap(find.byIcon(Icons.home_outlined));
          await tester.pumpAndSettle();
          await tester.tap(find.byTooltip(l10n.searchHint));
          await tester.pumpAndSettle();
          expect(router.state.uri.path, AppRoutes.search);
          expect(find.byType(ProductListScreen), findsOneWidget);
          await tester.tap(find.byType(BackButton));
          await tester.pumpAndSettle();
          _expectCount(tester, HomeScreen, 7);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        },
        variant: TargetPlatformVariant({platform}),
      );
    }
  }

  for (final language in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets('toolbar geometry and semantics $language dark=$dark', (
        tester,
      ) async {
        final inbox = _Inbox()..count = 999;
        final container = (await tester.runAsync(() => _container(inbox)))!;
        addTearDown(container.dispose);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final semantics = tester.ensureSemantics();
        try {
          for (final width in [
            320.0,
            390.0,
            599.0,
            600.0,
            899.0,
            900.0,
            1199.0,
            1200.0,
            1535.0,
            1536.0,
            1920.0,
          ]) {
            for (final scale in [1.0, 2.0]) {
              await tester.binding.setSurfaceSize(Size(width, 1000));
              await tester.pumpWidget(
                UncontrolledProviderScope(
                  container: container,
                  child: MaterialApp(
                    locale: Locale(language),
                    localizationsDelegates:
                        AppLocalizations.localizationsDelegates,
                    supportedLocales: AppLocalizations.supportedLocales,
                    theme: dark
                        ? AppTheme.dark(const Brand.bundled())
                        : AppTheme.light(const Brand.bundled()),
                    builder: (context, child) => MediaQuery(
                      data: MediaQuery.of(
                        context,
                      ).copyWith(textScaler: TextScaler.linear(scale)),
                      child: child!,
                    ),
                    home: const HomeScreen(),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              final searchIcon = find.byIcon(Icons.search);
              final bellIcon = find.byIcon(Icons.notifications_outlined);
              final search = find.widgetWithIcon(IconButton, Icons.search);
              final bell = find.descendant(
                of: _bell(HomeScreen),
                matching: find.byType(IconButton),
              );
              final searchRect = tester.getRect(search);
              final bellRect = tester.getRect(bell);
              final barRect = tester.getRect(find.byType(AppBar));
              expect(tester.getSize(bellIcon), tester.getSize(searchIcon));
              expect(tester.getSize(bellIcon), const Size(28, 28));
              expect(searchRect.center.dy, bellRect.center.dy);
              expect(searchRect.overlaps(bellRect), isFalse);
              final searchIconRect = tester.getRect(searchIcon);
              final bellIconRect = tester.getRect(bellIcon);
              expect(searchIconRect.center, searchRect.center);
              expect(bellIconRect.center, bellRect.center);
              expect(
                (searchIconRect.center.dx - bellIconRect.center.dx).abs(),
                48,
              );
              expect(
                language == 'ar'
                    ? searchIconRect.left - bellIconRect.right
                    : bellIconRect.left - searchIconRect.right,
                20,
              );
              expect(barRect.height, kToolbarHeight);
              for (final rect in [searchRect, bellRect]) {
                expect(rect.size, const Size(48, 48));
                expect(barRect.contains(rect.topLeft), isTrue);
                expect(rect.right, lessThanOrEqualTo(barRect.right));
              }
              expect(
                language == 'ar'
                    ? searchRect.left - bellRect.right
                    : bellRect.left - searchRect.right,
                0,
              );
              for (final button in [search, bell]) {
                final surface = find.descendant(
                  of: button,
                  matching: find.byType(Material),
                );
                final ink = find.descendant(
                  of: button,
                  matching: find.byType(InkWell),
                );
                final bounds = tester.getRect(button);
                expect(tester.getRect(surface), bounds);
                expect(tester.getRect(ink), bounds);
                expect(
                  tester.widget<Material>(surface).shape,
                  isA<CircleBorder>(),
                );
                expect(
                  tester.widget<InkWell>(ink).customBorder,
                  isA<CircleBorder>(),
                );
                // The splash is clipped to this button's circular border,
                // whose bounds cannot enter the neighboring touch target.
                expect(tester.widget<InkWell>(ink).containedInkWell, isTrue);
                if (width == 320 && scale == 1) {
                  final otherInk = find.descendant(
                    of: button == search ? bell : search,
                    matching: find.byType(InkWell),
                  );
                  final press = await tester.startGesture(bounds.center);
                  await tester.pump(kPressTimeout);
                  final pressedInk = tester.widget<InkWell>(ink);
                  expect(
                    pressedInk.statesController!.value,
                    contains(WidgetState.pressed),
                  );
                  expect(
                    pressedInk.overlayColor!.resolve({WidgetState.pressed})!.a,
                    greaterThan(0),
                  );
                  expect(tester.getRect(surface).center, bounds.center);
                  expect(
                    tester.widget<InkWell>(otherInk).statesController!.value,
                    isNot(contains(WidgetState.pressed)),
                  );
                  await press.cancel();
                  await tester.pumpAndSettle();
                  final mouse = await tester.createGesture(
                    kind: PointerDeviceKind.mouse,
                  );
                  await mouse.addPointer(location: bounds.center);
                  await tester.pump();
                  final hoveredInk = tester.widget<InkWell>(ink);
                  expect(
                    hoveredInk.statesController!.value,
                    contains(WidgetState.hovered),
                  );
                  expect(
                    hoveredInk.overlayColor!.resolve({WidgetState.hovered})!.a,
                    greaterThan(0),
                  );
                  expect(tester.getRect(surface).center, bounds.center);
                  expect(
                    tester.widget<InkWell>(otherInk).statesController!.value,
                    isNot(contains(WidgetState.hovered)),
                  );
                  await mouse.removePointer();
                  await tester.pumpAndSettle();
                }
              }
              final badgeRect = tester.getRect(find.byType(Badge));
              expect(badgeRect.overlaps(searchRect), isFalse);
              expect(badgeRect.left, greaterThanOrEqualTo(bellRect.left));
              expect(badgeRect.right, lessThanOrEqualTo(bellRect.right));
              expect(badgeRect.top, greaterThanOrEqualTo(barRect.top));
              expect(badgeRect.bottom, lessThanOrEqualTo(barRect.bottom));
              final brand = tester.getRect(find.byType(BrandMark));
              expect(brand.overlaps(searchRect), isFalse);
              expect(brand.overlaps(bellRect), isFalse);
              expect(language == 'ar' ? width - brand.right : brand.left, 16);
              final l10n = AppLocalizations.of(tester.element(bell));
              final node = tester.getSemantics(bell);
              expect(node.flagsCollection.isButton, isTrue);
              expect(
                node.getSemanticsData().hasAction(SemanticsAction.tap),
                isTrue,
              );
              expect(node.getSemanticsData().tooltip, l10n.notificationsTitle);
              expect(node.label, contains('999'));
              expect(tester.takeException(), isNull, reason: '$width / $scale');
            }
          }
          expect(inbox.countRequests, 1);
          await tester.pumpWidget(const SizedBox.shrink());
        } finally {
          semantics.dispose();
        }
      });
    }
  }

  testWidgets(
    'mounted Home and Account update together with one count request',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1200, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final inbox = _Inbox();
      final container = (await tester.runAsync(() => _container(inbox)))!;
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: AppTheme.light(const Brand.bundled()),
            home: const Row(
              children: [
                Expanded(child: HomeScreen()),
                Expanded(child: Scaffold(body: AccountView())),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      _expectCount(tester, HomeScreen, 2);
      _expectCount(tester, AccountView, 2);
      expect(inbox.countRequests, 1);
      final subscription = container.listen(inboxProvider, (_, _) {});
      await tester.pumpAndSettle();
      final items = container.read(inboxProvider).requireValue.items;
      for (final item in items) {
        final reading = container.read(inboxProvider.notifier).markRead(item);
        await tester.pumpAndSettle();
        expect(await reading, isTrue);
        final expected = 2 - inbox.reads.length;
        _expectCount(tester, HomeScreen, expected);
        _expectCount(tester, AccountView, expected);
        expect(inbox.countRequests, 1 + inbox.reads.length);
      }
      subscription.close();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'guest retains search and does not fetch private notification state',
    (tester) async {
      final inbox = _Inbox();
      final container = (await tester.runAsync(
        () => _container(
          inbox,
          session: TestSession(initial: const Session.signedOut()),
        ),
      ))!;
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const ShubayrApp(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.notifications_outlined), findsNothing);
      expect(find.byIcon(Icons.search), findsOneWidget);
      expect(
        tester.getCenter(find.byIcon(Icons.search)),
        tester.getCenter(find.widgetWithIcon(IconButton, Icons.search)),
      );
      expect(inbox.countRequests, 0);
      expect(inbox.pageRequests, 0);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

import 'package:shubayr/app/shell/admin_frame.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/core/widgets/app_card.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_providers.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_list_screen.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_record_form.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/permissions.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:shubayr/features/settings/presentation/screens/account_screen.dart';
import 'package:shubayr/features/settings/presentation/screens/account_view.dart';
import 'features/admin/support/admin_fakes.dart';
import 'features/admin/support/admin_order_fakes.dart';
import 'features/admin/admin_orders_screen_test.dart' as orders;

Future<void> setWindow(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  await tester.binding.setSurfaceSize(size);
}

void main() {
  tearDown(() {
    final binding = TestWidgetsFlutterBinding.instance;
    binding.platformDispatcher.views.first.resetPhysicalSize();
    binding.platformDispatcher.views.first.resetDevicePixelRatio();
  });
  late PrefsStore prefs;
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = PrefsStore(await SharedPreferences.getInstance());
    await (FontLoader('Cairo')
          ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf')))
        .load();
  });

  Widget host({
    Widget child = const AccountScreen(),
    String role = 'manager',
    String locale = 'en',
    double scale = 1,
    GoRouter? router,
  }) => ProviderScope(
    retry: (_, _) => null,
    overrides: [
      prefsStoreProvider.overrideWithValue(prefs),
      brandProvider.overrideWithValue(const Brand.bundled()),
      adminRepositoryProvider.overrideWithValue(RecordingAdmin()),
      sessionControllerProvider.overrideWith(
        () => AdminTestSession(
          initial: Session.signedIn(
            User(
              id: 'test',
              name: 'Test User',
              role: role,
              permissions: Permissions.all,
            ),
          ),
        ),
      ),
    ],
    child: router == null
        ? MaterialApp(
            locale: Locale(locale),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: locale == 'ar'
                ? AppTheme.light(const Brand.bundled())
                : AppTheme.dark(const Brand.bundled()),
            home: child,
          )
        : MaterialApp.router(
            routerConfig: router,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: AdminFrame(router: router, child: child!),
            ),
            locale: Locale(locale),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: locale == 'ar'
                ? AppTheme.light(const Brand.bundled())
                : AppTheme.dark(const Brand.bundled()),
          ),
  );

  for (final locale in ['ar', 'en']) {
    for (final resource in [
      AdminResource.users,
      AdminResource.roles,
      AdminResource.products,
      AdminResource.categories,
    ]) {
      testWidgets(
        '$resource add placement, start alignment and navigation $locale',
        (tester) async {
          addTearDown(() => tester.binding.setSurfaceSize(null));
          for (final width in [
            390.0,
            599.0,
            600.0,
            899.0,
            900.0,
            901.0,
            1199.0,
            1200.0,
            1535.0,
            1536.0,
            1920.0,
          ]) {
            await setWindow(tester, Size(width, 1000));
            await tester.pumpWidget(
              host(
                locale: locale,
                child: AdminListScreen(resource: resource),
              ),
            );
            await tester.pumpAndSettle();
            final desktop = width >= AppLayout.wideHeaderWidth;
            final add = find.byKey(const ValueKey('admin-toolbar-add'));
            expect(find.byType(FloatingActionButton), findsOneWidget);
            expect(add, findsNothing);
            expect(
              find.byKey(const ValueKey('admin-mobile-account-action')),
              desktop ? findsNothing : findsOneWidget,
            );
            if (desktop && resource.canSearch) {
              final search = find.byType(TextField).first;
              final rect = tester.getRect(search);
              expect(
                locale == 'ar' ? width - rect.right : rect.left,
                closeTo(AppSpacing.screenH, 0.01),
              );
              if (resource == AdminResource.users) {
                final filter = tester.getRect(
                  find.byType(DropdownButtonFormField<String>),
                );
                expect(rect.top, closeTo(filter.top, 1));
                expect(rect.height, closeTo(filter.height, 1));
                expect(
                  locale == 'ar'
                      ? rect.left > filter.right
                      : rect.right < filter.left,
                  isTrue,
                );
                expect(
                  tester.widget<TextField>(search).decoration!.hintText,
                  locale == 'ar' ? 'ابحث عن مستخدم' : 'Search for a user',
                );
              }
            }
            expect(
              tester.takeException(),
              isNull,
              reason: '$width $resource $locale',
            );
          }
          await tester.tap(find.byType(FloatingActionButton));
          await tester.pumpAndSettle();
          expect(find.byType(AdminRecordForm), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }

    for (final role in [
      'customer',
      'manager',
      'admin',
      'warehouse',
      'delivery',
    ]) {
      testWidgets(
        'account links and vertical start-aligned content $role $locale',
        (tester) async {
          addTearDown(() => tester.binding.setSurfaceSize(null));
          for (final width in [390.0, 900.0, 1920.0]) {
            await setWindow(tester, Size(width, 1200));
            await tester.pumpWidget(host(role: role, locale: locale));
            await tester.pumpAndSettle();
            final account = find.byType(AccountView);
            final cards = find.descendant(
              of: account,
              matching: find.byType(AppCard),
            );
            expect(
              find.byIcon(Icons.favorite_border),
              role == 'customer' ? findsOneWidget : findsNothing,
            );
            expect(
              find.byIcon(Icons.location_on_outlined),
              role == 'customer' ? findsOneWidget : findsNothing,
            );
            final first = tester.getRect(cards.first);
            final second = tester.getRect(cards.at(1));
            expect(second.top, greaterThan(first.bottom));
            expect(first.width, lessThanOrEqualTo(AppLayout.readingWidth));
            expect(
              locale == 'ar' ? width - first.right : first.left,
              width < 600 ? AppSpacing.screenMobileH : AppSpacing.screenH,
            );
            expect(tester.takeException(), isNull);
          }
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }

    testWidgets('desktop identity opens existing account route $locale', (
      tester,
    ) async {
      await setWindow(tester, const Size(1200, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final router = GoRouter(
        initialLocation: AppRoutes.adminUsers,
        routes: [
          GoRoute(
            path: AppRoutes.adminUsers,
            builder: (_, _) =>
                const AdminListScreen(resource: AdminResource.users),
          ),
          GoRoute(
            path: AppRoutes.settings,
            builder: (_, _) => const AccountScreen(),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(host(router: router, locale: locale));
      await tester.pumpAndSettle();
      expect(find.text('Test User'), findsOneWidget);
      final labels = AppLocalizations.of(
        tester.element(find.byType(AdminListScreen)),
      );
      expect(find.text(labels.homeBrandName), findsOneWidget);
      final global = find.byType(GlobalAdminHeader);
      expect(
        find.descendant(of: global, matching: find.text(labels.accountTitle)),
        findsOneWidget,
      );
      expect(
        find.descendant(of: global, matching: find.byType(BackButton)),
        findsNothing,
      );
      expect(
        find.descendant(
          of: global,
          matching: find.byKey(const ValueKey('admin-page-header')),
        ),
        findsNothing,
      );
      await tester.tap(find.byKey(const ValueKey('admin-account-action')));
      await tester.pumpAndSettle();
      expect(find.byType(AccountView), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('admin-account-action')));
      await tester.pumpAndSettle();
      router.pop();
      await tester.pumpAndSettle();
      expect(
        find.byType(AdminListScreen),
        findsOneWidget,
        reason: 'Repeated account clicks must not push duplicate account pages',
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets(
      'global header persists across pages and mobile resize $locale',
      (tester) async {
        await setWindow(tester, const Size(1200, 1100));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final router = GoRouter(
          initialLocation: AppRoutes.adminUsers,
          routes: [
            GoRoute(
              path: AppRoutes.adminUsers,
              builder: (_, _) =>
                  const AdminListScreen(resource: AdminResource.users),
            ),
            GoRoute(
              path: AppRoutes.settings,
              builder: (_, _) => const AccountScreen(),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(host(router: router, locale: locale));
        await tester.pumpAndSettle();
        final global = find.byType(GlobalAdminHeader);
        final element = tester.element(global);
        final initialRect = tester.getRect(global);
        final logo = tester.getRect(
          find.byKey(const ValueKey('admin-brand-logo')),
        );
        final account = tester.getRect(
          find.byKey(const ValueKey('admin-account-action')),
        );
        expect(
          locale == 'ar'
              ? logo.left > account.right
              : logo.right < account.left,
          isTrue,
        );
        expect(
          find.descendant(of: global, matching: find.byType(BackButton)),
          findsNothing,
        );
        final page = find.byKey(const ValueKey('admin-page-header'));
        expect(tester.getRect(page).top, initialRect.bottom);
        await tester.tap(find.byType(FloatingActionButton));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(identical(tester.element(global), element), isTrue);
        expect(tester.getRect(global), initialRect);
        await tester.pumpAndSettle();
        expect(find.byType(AdminRecordForm), findsOneWidget);
        final back = find.byType(BackButton);
        expect(
          tester.getRect(back).top,
          greaterThanOrEqualTo(initialRect.bottom),
        );
        await tester.tap(back);
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField).first, 'مستخدم');
        await tester.pump(const Duration(milliseconds: 350));
        await tester.pumpAndSettle();
        for (final width in [
          899.0,
          599.0,
          390.0,
          320.0,
          900.0,
          1920.0,
          390.0,
        ]) {
          await setWindow(tester, Size(width, 1100));
          await tester.pumpAndSettle();
          expect(
            tester
                .widget<TextField>(find.byType(TextField).first)
                .controller!
                .text,
            'مستخدم',
          );
          expect(global, width >= 900 ? findsOneWidget : findsNothing);
          expect(
            find.byKey(const ValueKey('admin-mobile-account-action')),
            width < 900 ? findsOneWidget : findsNothing,
          );
          expect(tester.takeException(), isNull);
        }
        await setWindow(tester, const Size(900, 1100));
        await tester.pumpWidget(host(router: router, locale: locale, scale: 2));
        await tester.pumpAndSettle();
        expect(global, findsOneWidget);
        expect(tester.takeException(), isNull);
        await setWindow(tester, const Size(390, 1100));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('admin-mobile-account-action')),
        );
        await tester.pumpAndSettle();
        expect(find.byType(AccountView), findsOneWidget);
        expect(
          find.byKey(const ValueKey('admin-mobile-account-action')),
          findsNothing,
        );
        await setWindow(tester, const Size(1200, 1100));
        await tester.pumpAndSettle();
        final accountHeaderElement = tester.element(global);
        router.pop();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(identical(tester.element(global), accountHeaderElement), isTrue);
        await tester.pumpAndSettle();
        expect(find.byType(AdminListScreen), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );

    testWidgets('orders use one bounded calendar on all windows $locale', (
      tester,
    ) async {
      addTearDown(() => tester.binding.setSurfaceSize(null));
      for (final (width, scale) in [
        (390.0, 1.0),
        (900.0, 1.0),
        (1920.0, 1.0),
        (900.0, 2.0),
        (1920.0, 2.0),
      ]) {
        await setWindow(tester, Size(width, 1000));
        await tester.pumpWidget(
          orders.host(RecordingAdminOrders(), lang: locale, scale: scale),
        );
        await tester.pumpAndSettle();
        final search = tester.getRect(find.byType(TextField).first);
        expect(
          locale == 'ar' ? width - search.right : search.left,
          width < 600 ? AppSpacing.screenMobileH : AppSpacing.screenH,
        );
        final date = find.widgetWithIcon(TextButton, Icons.date_range_outlined);
        final rect = tester.getRect(date);
        expect(
          locale == 'ar' ? width - rect.right : rect.left,
          width < 600 ? AppSpacing.screenMobileH : AppSpacing.screenH,
        );
        await tester.tap(date);
        await tester.pumpAndSettle();
        final bounded = find.byKey(const ValueKey('admin-date-range-dialog'));
        expect(bounded, findsOneWidget);
        {
          final size = tester.getSize(bounded);
          expect(size.width, lessThanOrEqualTo(AppLayout.dateRangeWidth));
          expect(size.height, lessThanOrEqualTo(1000));
        }
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      }
    });
  }

  testWidgets(
    'page insets change only horizontal mobile space and preserve SafeArea',
    (tester) async {
      addTearDown(() => tester.binding.setSurfaceSize(null));
      for (final width in [
        390.0,
        599.0,
        600.0,
        899.0,
        900.0,
        1200.0,
        1536.0,
        1920.0,
      ]) {
        await setWindow(tester, Size(width, 1000));
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(
                size: Size(width, 1000),
                padding: const EdgeInsets.only(left: 30, right: 20),
              ),
              child: Scaffold(
                body: SafeArea(
                  child: Builder(
                    builder: (context) => Padding(
                      padding: AppLayout.pageInsets(context),
                      child: const SizedBox.expand(
                        key: ValueKey('page-content'),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        final rect = tester.getRect(find.byKey(const ValueKey('page-content')));
        final horizontal = width < 600
            ? AppSpacing.screenMobileH
            : AppSpacing.screenH;
        expect(rect.left, 30 + horizontal);
        expect(width - rect.right, 20 + horizontal);
        expect(rect.top, AppSpacing.screenH);
      }
    },
  );
}

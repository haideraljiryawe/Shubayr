import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/l10n_context.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/theme_mode_controller.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';

import '../helpers/test_session.dart';
import '../features/orders/support/order_history_repository.dart';

const _product = Product(
  id: 'p1',
  categoryId: 'cat-0',
  nameEn: 'Product',
  nameAr: 'منتج',
  effectivePrice: 1000,
);

class _Cart extends CartController {
  @override
  Future<Cart> build() async => Cart(
    total: 10000,
    currency: 'IQD',
    items: [
      for (var i = 0; i < 10; i++)
        CartItem(
          id: 'line-$i',
          productId: 'p1',
          unitPrice: 1000,
          lineTotal: 1000,
          available: true,
        ),
    ],
  );
}

class _GatedTokenStore extends InMemoryTokenStore {
  final clearGate = Completer<void>();
  @override
  Future<void> clear() async {
    await clearGate.future;
    await super.clear();
  }
}

Future<({ProviderContainer container, _GatedTokenStore tokens})> _pumpApp(
  WidgetTester tester,
  String language,
  ThemeMode mode,
) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(320, 700);
  tester.view.padding = const FakeViewPadding(bottom: 34);
  tester.view.viewPadding = const FakeViewPadding(bottom: 34);
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final tokens = _GatedTokenStore();
  final container = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      dataSourceProvider.overrideWithValue(DataSource.mock),
      prefsStoreProvider.overrideWithValue(
        PrefsStore(await SharedPreferences.getInstance()),
      ),
      tokenStoreProvider.overrideWithValue(tokens),
      sessionControllerProvider.overrideWith(TestSession.new),
      notificationSyncProvider.overrideWith((ref) {}),
      unreadCountProvider.overrideWith((ref) async => 0),
      homeBannersProvider.overrideWith((ref) async => []),
      homeOffersProvider.overrideWith(
        (ref) async => const ProductPage(total: 1, data: [_product]),
      ),
      categoriesProvider.overrideWith(
        (ref) async => [
          for (var i = 0; i < 10; i++)
            Category(id: 'cat-$i', nameEn: 'Category $i', nameAr: 'قسم $i'),
        ],
      ),
      cartControllerProvider.overrideWith(_Cart.new),
      productProvider('p1').overrideWith((ref) async => _product),
      orderRepositoryProvider.overrideWithValue(
        OrderHistoryRepository(
          orders: [
            for (var i = 0; i < 6; i++)
              Order(
                id: 'order-$i',
                orderNumber: 'OVERLAY-$i',
                status: 'delivered',
                total: 1000,
              ),
          ],
        ),
      ),
    ],
  );
  addTearDown(container.dispose);
  await container
      .read(localeControllerProvider.notifier)
      .setLocale(Locale(language));
  await container.read(themeModeControllerProvider.notifier).setMode(mode);
  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const ShubayrApp()),
  );
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
  return (container: container, tokens: tokens);
}

void main() {
  for (final language in ['ar', 'en']) {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      testWidgets(
        'actual tab lists extend behind the bar and reveal their last content: $language $mode',
        (tester) async {
          final harness = await _pumpApp(tester, language, mode);
          final container = harness.container;
          final router = container.read(routerProvider);
          for (final path in [
            '/home',
            '/categories',
            '/cart',
            '/orders',
            '/account',
          ]) {
            router.go(path);
            await tester.pumpAndSettle();
            final vertical = find.byWidgetPredicate(
              (widget) =>
                  widget is Scrollable &&
                  (widget.axisDirection == AxisDirection.down ||
                      widget.axisDirection == AxisDirection.up),
            );
            expect(vertical, findsOneWidget, reason: path);
            expect(tester.getRect(vertical).bottom, 700, reason: path);
            final scroll = tester.state<ScrollableState>(vertical).position;
            scroll.jumpTo(scroll.maxScrollExtent);
            await tester.pumpAndSettle();
            final last = switch (path) {
              '/home' => find.byKey(const ValueKey('home-offer-p1')),
              '/categories' => find.byKey(const ValueKey('cat-card-cat-9')),
              '/cart' => find.text(tester.element(vertical).l10n.cartCheckout),
              '/orders' => find.text('OVERLAY-5'),
              _ => find.byKey(const ValueKey('account-delete')),
            };
            expect(last, findsOneWidget, reason: path);
            final bar = tester.getRect(
              find.byKey(const ValueKey('bottom-nav-surface')),
            );
            expect(
              tester.getRect(last).bottom,
              lessThan(bar.top),
              reason: path,
            );
            expect(last.hitTestable(), findsOneWidget, reason: path);
            expect(tester.takeException(), isNull, reason: path);
          }
        },
      );
    }
  }
  for (final language in ['ar', 'en']) {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      for (final branch in [2, 3, 4]) {
        for (final elapsed in [0, 120, 240]) {
          testWidgets(
            'real logout $language $mode branch=$branch motion=$elapsed',
            (tester) async {
              final harness = await _pumpApp(tester, language, mode);
              final router = harness.container.read(routerProvider);
              final surface = find.byKey(const ValueKey('bottom-nav-surface'));
              final tabs = find.descendant(
                of: surface,
                matching: find.byType(InkWell),
              );
              final bounds = tester.getRect(surface);
              await tester.tap(tabs.at(branch));
              await tester.pump();
              await tester.pump(Duration(milliseconds: elapsed));
              final press = elapsed == 120
                  ? await tester.startGesture(tester.getCenter(tabs.at(branch)))
                  : null;
              if (press != null) {
                await tester.pump(const Duration(milliseconds: 120));
              }
              final logout = harness.container
                  .read(sessionControllerProvider.notifier)
                  .signOut();
              await tester.pump();
              // Model secure storage completing before, during and after the
              // splash transition, without modifying production auth timing.
              await tester.pump(
                Duration(milliseconds: elapsed == 240 ? 400 : elapsed),
              );
              expect(tester.takeException(), isNull);
              harness.tokens.clearGate.complete();
              await logout;
              await press?.up();
              await tester.pump();
              expect(tester.takeException(), isNull);
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull);
              expect(
                harness.container
                    .read(sessionControllerProvider)
                    .requireValue
                    .isSignedIn,
                isFalse,
              );
              expect(
                router.routeInformationProvider.value.uri.path,
                branch == 4 ? '/account' : '/sign-in',
              );
              if (branch != 4) router.go('/home');
              await tester.pumpAndSettle();
              expect(tabs, findsNWidgets(3));
              expect(tester.getRect(surface), bounds);
              final selected = find.descendant(
                of: surface,
                matching: find.byWidgetPredicate(
                  (w) => w is Semantics && w.properties.selected == true,
                ),
              );
              expect(selected, findsOneWidget);
              expect(
                tester
                    .getCenter(find.byKey(const ValueKey('bottom-nav-capsule')))
                    .dx,
                closeTo(
                  tester.getCenter(branch == 4 ? tabs.last : tabs.first).dx,
                  .01,
                ),
              );
              expect(tester.takeException(), isNull);
            },
          );
        }
      }
      testWidgets(
        'covered guest shell keeps its state through sign-in: $language $mode',
        (tester) async {
          final harness = await _pumpApp(tester, language, mode);
          final session =
              harness.container.read(sessionControllerProvider.notifier)
                  as TestSession;
          final router = harness.container.read(routerProvider);
          session.setSession(const Session.signedOut());
          router.go('/account');
          await tester.pumpAndSettle();
          final shell = tester.state(find.byType(StatefulNavigationShell));
          unawaited(router.push<void>('/sign-in?returnTo=/account'));
          await tester.pumpAndSettle();
          expect(
            tester.state(
              find.byType(StatefulNavigationShell, skipOffstage: false),
            ),
            same(shell),
          );
          session.setSession(customerSession);
          // The OTP screen clears its pushed auth pages explicitly via go().
          router.go('/account');
          await tester.pumpAndSettle();
          final surface = find.byKey(const ValueKey('bottom-nav-surface'));
          expect(
            find.descendant(of: surface, matching: find.byType(InkWell)),
            findsNWidgets(5),
          );
          expect(router.routeInformationProvider.value.uri.path, '/account');
          expect(
            tester.state(find.byType(StatefulNavigationShell)),
            same(shell),
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('logout waits for credential cleanup during route transition', (
    tester,
  ) async {
    final harness = await _pumpApp(tester, 'ar', ThemeMode.light);
    final router = harness.container.read(routerProvider);
    router.go('/account');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('account-sign-out')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('account-sign-out')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('confirm-sign-out')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    harness.tokens.clearGate.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}

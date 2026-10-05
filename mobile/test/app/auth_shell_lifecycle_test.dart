import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/app.dart';
import 'package:shubayr/app/router/app_router.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/features/auth/data/auth_repository_remote.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/l10n/locale_controller.dart';
import 'package:shubayr/core/theme/theme_mode_controller.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/notifications/data/notification_repository.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';

class _Notifications implements NotificationRepository {
  @override
  Future<int> unreadCount() async => 2;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  for (final language in ['ar', 'en']) {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      for (final guestPath in ['/home', '/categories', '/account']) {
        testWidgets(
          'real providers login/logout/login from $guestPath $language $mode',
          (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = const Size(390, 844);
            tester.view.viewPadding = const FakeViewPadding(bottom: 34);
            addTearDown(tester.view.reset);
            SharedPreferences.setMockInitialValues({});
            var verifications = 0;
            final dio = Dio();
            addTearDown(() => dio.close(force: true));
            dio.interceptors.add(
              InterceptorsWrapper(
                onRequest: (request, handler) {
                  final data = switch (request.path) {
                    '/auth/request-otp' => <String, dynamic>{'sent': true},
                    '/auth/verify-otp' => <String, dynamic>{
                      'access_token': 'test-access-${++verifications}',
                      'refresh_token': 'test-refresh',
                      'user': {
                        'id': 'customer',
                        'role': 'customer',
                        'surface': 'app',
                        'permissions': <String>[],
                      },
                    },
                    '/auth/logout' => null,
                    _ => throw StateError('Unexpected request ${request.path}'),
                  };
                  handler.resolve(
                    Response(
                      requestOptions: request,
                      statusCode: 200,
                      data: data,
                    ),
                  );
                },
              ),
            );
            final container = ProviderContainer(
              retry: (_, _) => null,
              overrides: [
                dataSourceProvider.overrideWithValue(DataSource.mock),
                prefsStoreProvider.overrideWithValue(
                  PrefsStore(await SharedPreferences.getInstance()),
                ),
                tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
                authRepositoryProvider.overrideWithValue(
                  AuthRepositoryRemote(ApiClient(dio)),
                ),
                homeBannersProvider.overrideWith((ref) async => []),
                notificationRepositoryProvider.overrideWithValue(
                  _Notifications(),
                ),
              ],
            );
            addTearDown(container.dispose);
            await container
                .read(localeControllerProvider.notifier)
                .setLocale(Locale(language));
            await container
                .read(themeModeControllerProvider.notifier)
                .setMode(mode);
            await tester.pumpWidget(
              UncontrolledProviderScope(
                container: container,
                child: const ShubayrApp(),
              ),
            );
            await tester.pumpAndSettle();
            final router = container.read(routerProvider);
            router.go(guestPath);
            await tester.pumpAndSettle();
            final surface = find.byKey(const ValueKey('bottom-nav-surface'));
            final tabs = find.descendant(
              of: find.byType(CustomerBottomNavigation),
              matching: find.byType(InkWell),
            );
            final originalBounds = tester.getRect(surface);
            for (final (iteration, logoutPath) in [
              '/account',
              '/orders',
              '/cart',
            ].indexed) {
              expect(tabs, findsNWidgets(3));
              final shellState = tester.state(
                find.byType(StatefulNavigationShell),
              );
              unawaited(router.push<void>('/sign-in?returnTo=$guestPath'));
              await tester.pumpAndSettle();
              await tester.enterText(
                find.byType(TextFormField),
                '+9647701234567',
              );
              await tester.tap(find.byType(ElevatedButton));
              await tester.pumpAndSettle();
              await tester.enterText(find.byType(TextFormField), '123456');
              await tester.tap(find.byType(ElevatedButton));
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull);
              expect(
                container
                    .read(sessionControllerProvider)
                    .requireValue
                    .isSignedIn,
                isTrue,
              );
              expect(router.routeInformationProvider.value.uri.path, guestPath);
              expect(
                tester.state(find.byType(StatefulNavigationShell)),
                same(shellState),
              );
              expect(tabs, findsNWidgets(5));
              expect(tester.getRect(surface), originalBounds);
              expect(verifications, iteration + 1);
              expect(container.read(cartControllerProvider).hasError, isFalse);
              router.go(logoutPath);
              await tester.pump();
              await tester.pump(Duration(milliseconds: iteration * 120));
              final logout = container
                  .read(sessionControllerProvider.notifier)
                  .signOut();
              await tester.pumpAndSettle();
              await logout;
              expect(tester.takeException(), isNull);
              expect(
                container
                    .read(sessionControllerProvider)
                    .requireValue
                    .isSignedIn,
                isFalse,
              );
              router.go(guestPath);
              await tester.pumpAndSettle();
              expect(tabs, findsNWidgets(3));
              expect(tester.getRect(surface), originalBounds);
            }
            // Also deliver OTP success to the visible shell while its capsule
            // is starting, halfway through, or finishing a tab transition.
            for (final elapsed in [0, 120, 240]) {
              await tester.tap(tabs.first);
              await tester.pumpAndSettle();
              await tester.tap(tabs.last);
              await tester.pump();
              await tester.pump(Duration(milliseconds: elapsed));
              final login = container
                  .read(sessionControllerProvider.notifier)
                  .verifyOtp(phone: '+9647701234567', code: '123456');
              await tester.pumpAndSettle();
              expect((await login)?.isSignedIn, isTrue);
              expect(tabs, findsNWidgets(5));
              expect(tester.getRect(surface), originalBounds);
              expect(
                tester
                    .getCenter(find.byKey(const ValueKey('bottom-nav-capsule')))
                    .dx,
                closeTo(tester.getCenter(tabs.last).dx, .01),
              );
              expect(tester.takeException(), isNull);
              final logout = container
                  .read(sessionControllerProvider.notifier)
                  .signOut();
              await tester.pumpAndSettle();
              await logout;
              expect(tabs, findsNWidgets(3));
              expect(tester.takeException(), isNull);
            }
            await tester.pumpWidget(const SizedBox.shrink());
          },
        );
      }
    }
  }
}

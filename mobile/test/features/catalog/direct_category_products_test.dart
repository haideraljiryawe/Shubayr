import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/state_views.dart';
import 'package:shubayr/features/catalog/presentation/screens/subcategories_screen.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_card.dart';

void main() {
  for (final locale in ['ar', 'en']) {
    for (final hasChildren in [false, true]) {
      testWidgets(
        'remote main products coexist with children=$hasChildren $locale',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 1000);
          addTearDown(tester.view.reset);
          final requests = <Map<String, dynamic>>[];
          var failProducts = false;
          final dio = Dio()
            ..interceptors.add(
              InterceptorsWrapper(
                onRequest: (r, h) {
                  if (r.path == '/categories') {
                    h.resolve(
                      Response(
                        requestOptions: r,
                        statusCode: 200,
                        data: [
                          {
                            'id': 'cooling',
                            'name_en': 'Cooling',
                            'name_ar': 'أجهزة التبريد',
                            'children': hasChildren
                                ? [
                                    {
                                      'id': 'fans',
                                      'parent_id': 'cooling',
                                      'name_en': 'Fans',
                                      'name_ar': 'مراوح',
                                    },
                                  ]
                                : [],
                          },
                        ],
                      ),
                    );
                    return;
                  }
                  expect(r.path, '/products');
                  requests.add({...r.queryParameters});
                  if (failProducts) {
                    h.reject(
                      DioException(
                        requestOptions: r,
                        type: DioExceptionType.connectionError,
                      ),
                    );
                    return;
                  }
                  final page = r.queryParameters['page'] as int;
                  final perPage = r.queryParameters['per_page'] as int;
                  final start = (page - 1) * perPage;
                  h.resolve(
                    Response(
                      requestOptions: r,
                      statusCode: 200,
                      data: {
                        'page': page,
                        'per_page': perPage,
                        'total': 10,
                        'data': [
                          for (
                            var i = start;
                            i < (start + perPage).clamp(0, 10);
                            i++
                          )
                            {
                              'id': 'p$i',
                              'category_id': 'cooling',
                              'name_en': 'Cooler $i',
                              'name_ar': 'مبرد $i',
                              'price': 100,
                              'effective_price': 100,
                            },
                        ],
                      },
                    ),
                  );
                },
              ),
            );
          addTearDown(dio.close);
          SharedPreferences.setMockInitialValues({});
          final prefs = PrefsStore(await SharedPreferences.getInstance());
          final router = GoRouter(
            initialLocation: '/cooling',
            routes: [
              GoRoute(
                path: '/cooling',
                builder: (_, _) =>
                    const SubcategoriesScreen(categoryId: 'cooling'),
              ),
              GoRoute(
                path: '/search',
                name: AppRoutes.searchName,
                builder: (_, state) => Scaffold(
                  appBar: AppBar(),
                  body: Text(
                    'selected:${state.uri.queryParameters['category_id']}',
                  ),
                ),
              ),
              GoRoute(
                path: '/product/:id',
                name: AppRoutes.productName,
                builder: (_, state) => Scaffold(
                  appBar: AppBar(),
                  body: Text('product:${state.pathParameters['id']}'),
                ),
              ),
            ],
          );
          addTearDown(router.dispose);
          Widget host({
            Brightness brightness = Brightness.light,
            double scale = 1,
          }) => ProviderScope(
            overrides: [
              dataSourceProvider.overrideWithValue(DataSource.remote),
              apiClientProvider.overrideWithValue(ApiClient(dio)),
              prefsStoreProvider.overrideWithValue(prefs),
              tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
            ],
            child: MaterialApp.router(
              locale: Locale(locale),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              theme: brightness == Brightness.light
                  ? AppTheme.light(const Brand.bundled())
                  : AppTheme.dark(const Brand.bundled()),
              builder: (_, child) => MediaQuery(
                data: MediaQueryData(
                  size: tester.view.physicalSize,
                  textScaler: TextScaler.linear(scale),
                ),
                child: child!,
              ),
              routerConfig: router,
            ),
          );
          await tester.pumpWidget(host());
          await tester.pumpAndSettle();
          expect(find.byType(ProductCard), findsWidgets);
          expect(requests.every((q) => q['category_id'] == 'cooling'), isTrue);
          expect(
            find.byKey(const ValueKey('cat-sub-fans')),
            hasChildren ? findsOneWidget : findsNothing,
          );
          expect(find.text('General'), findsNothing);
          expect(find.text('غير مصنفة'), findsNothing);
          if (hasChildren) {
            expect(
              tester.getRect(find.byKey(const ValueKey('cat-sub-fans'))).bottom,
              lessThan(tester.getRect(find.byType(ProductCard).first).top),
            );
            await tester.tap(find.byKey(const ValueKey('cat-sub-fans')));
            await tester.pumpAndSettle();
            expect(find.text('selected:fans'), findsOneWidget);
            router.pop();
            await tester.pumpAndSettle();
          }
          await tester.tap(find.byType(ProductCard).first);
          await tester.pumpAndSettle();
          expect(find.text('product:p0'), findsOneWidget);
          router.pop();
          await tester.pumpAndSettle();
          await tester.scrollUntilVisible(
            find.text(locale == 'ar' ? 'مبرد 9' : 'Cooler 9'),
            300,
            scrollable: find.byType(Scrollable).last,
          );
          await tester.pumpAndSettle();
          expect(requests.any((q) => q['page'] == 2), isTrue);
          expect(tester.takeException(), isNull);
          for (final width in [
            599.0,
            600.0,
            601.0,
            899.0,
            900.0,
            901.0,
            1199.0,
            1200.0,
            1201.0,
            1535.0,
            1536.0,
            1537.0,
            1920.0,
          ]) {
            tester.view.physicalSize = Size(width, 1000);
            await tester.pumpWidget(
              host(brightness: Brightness.dark, scale: 2),
            );
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: '$locale $width');
          }
          // Product failure must not hide the subcategory navigation.
          failProducts = true;
          await tester.enterText(find.byType(TextField), 'failed');
          await tester.pump(const Duration(milliseconds: 400));
          await tester.pumpAndSettle();
          expect(find.byType(AppErrorView), findsOneWidget);
          if (hasChildren) {
            expect(find.byKey(const ValueKey('cat-sub-fans')), findsOneWidget);
          }
          failProducts = false;
          await tester.tap(
            find.text(locale == 'ar' ? 'إعادة المحاولة' : 'Retry'),
          );
          await tester.pumpAndSettle();
          expect(find.byType(ProductCard), findsWidgets);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}

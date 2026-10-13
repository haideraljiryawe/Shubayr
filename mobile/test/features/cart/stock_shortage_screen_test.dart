import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/error/error_mapper.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/checkout_screen.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import '../../helpers/test_session.dart';
import '../orders/api11_actions_test.dart' show PriceOrders, priceCart;
import '../orders/order_action_lifecycle_test.dart' show Carts, Addresses;

void main() {
  test(
    'stock error decoder accepts only contract quantity strings at 0.001 precision',
    () {
      AppFailure decode(Object available) {
        final request = RequestOptions(path: '/orders');
        return mapDioException(
          DioException(
            requestOptions: request,
            type: DioExceptionType.badResponse,
            response: Response(
              requestOptions: request,
              statusCode: 409,
              data: {
                'code': 'INSUFFICIENT_STOCK',
                'errors': [
                  {
                    'field': 'quantity',
                    'code': 'INSUFFICIENT_STOCK',
                    'message': 'private',
                    'variant_id': 'v',
                    'requested': '0.125',
                    'available': available,
                  },
                ],
              },
            ),
          ),
        );
      }

      expect(decode('0.025').errors.single.availableQuantity, .025);
      expect(decode('0').errors.single.availableQuantity, 0);
      expect(decode('0.025').errors.single.requestedQuantity, .125);
      for (final invalid in [
        'NaN',
        'Infinity',
        '-1',
        '0.0001',
        'not a quantity',
        .025,
      ]) {
        expect(decode(invalid).errors.single.availableQuantity, isNull);
      }
    },
  );
  for (final locale in ['en', 'ar']) {
    for (final switchAccount in [false, true]) {
      testWidgets(
        'stock conflict identifies line and never retries ($locale, switch=$switchAccount)',
        (tester) async {
          tester.view.physicalSize = const Size(320, 1000);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          final carts = Carts()..current = priceCart;
          final orders = PriceOrders(carts)
            ..onPlace = () async => throw const AppFailure(
              FailureKind.conflict,
              statusCode: 409,
              code: 'INSUFFICIENT_STOCK',
              serverMessage: 'PRIVATE',
              errors: [
                ApiFieldError(
                  message: 'PRIVATE',
                  variantId: 'v',
                  availableQuantity: .025,
                  requestedQuantity: .125,
                ),
              ],
            );
          final container = ProviderContainer(
            retry: (_, _) => null,
            overrides: [
              pendingRequestStoreProvider.overrideWithValue(
                PendingRequestStore.memory(),
              ),
              sessionControllerProvider.overrideWith(TestSession.new),
              cartRepositoryProvider.overrideWithValue(carts),
              orderRepositoryProvider.overrideWithValue(orders),
              addressesControllerProvider.overrideWith(Addresses.new),
              brandProvider.overrideWithValue(const Brand.bundled()),
              productProvider('p').overrideWith(
                (ref) async => const Product(
                  id: 'p',
                  categoryId: 'c',
                  nameEn: 'Dates',
                  nameAr: 'تمر',
                ),
              ),
            ],
          );
          addTearDown(container.dispose);
          final router = GoRouter(
            initialLocation: '/checkout',
            routes: [
              GoRoute(
                path: '/checkout',
                builder: (_, _) => const CheckoutScreen(),
              ),
              GoRoute(
                path: '/cart',
                name: AppRoutes.cartName,
                builder: (_, _) =>
                    const Scaffold(body: Text('Correction cart')),
              ),
            ],
          );
          addTearDown(router.dispose);
          await tester.pumpWidget(
            UncontrolledProviderScope(
              container: container,
              child: MaterialApp.router(
                routerConfig: router,
                locale: Locale(locale),
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(
                    context,
                  ).copyWith(textScaler: const TextScaler.linear(1.5)),
                  child: child!,
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final l10n = AppLocalizations.of(
            tester.element(find.byType(CheckoutScreen)),
          );
          await tester.ensureVisible(find.text(l10n.checkoutPlaceOrder));
          await tester.tap(find.text(l10n.checkoutPlaceOrder));
          await tester.pumpAndSettle();
          expect(
            find.text(l10n.stockAvailableQuantity('0.025')),
            findsOneWidget,
          );
          expect(
            find.text(l10n.stockRequestedQuantity('0.125')),
            findsOneWidget,
          );
          expect(find.text(locale == 'en' ? 'Dates' : 'تمر'), findsOneWidget);
          expect(find.text('PRIVATE'), findsNothing);
          expect(orders.placements, 1);
          if (switchAccount) {
            (container.read(sessionControllerProvider.notifier) as TestSession)
                .setSession(
                  const Session.signedIn(User(id: 'B', role: 'customer')),
                );
            await tester.pumpAndSettle();
            expect(find.byType(AlertDialog), findsNothing);
            expect(find.text('Correction cart'), findsNothing);
          } else {
            await tester.tap(find.text(l10n.stockCorrectCart));
            await tester.pumpAndSettle();
            expect(find.text('Correction cart'), findsOneWidget);
          }
          expect(orders.placements, 1);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}

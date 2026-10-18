import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations_en.dart';
import 'package:shubayr/core/l10n/generated/app_localizations_ar.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import '../../helpers/test_session.dart';

class _Cart extends CartRepositoryMock {
  int reads = 0, writes = 0;
  bool failRefresh = false;
  String code = 'REQUESTED_QUANTITY_UNAVAILABLE';
  @override
  Future<Cart> fetchCart({String? addressId}) async {
    reads++;
    if (failRefresh && reads > 1) throw const AppFailure.network();
    return Cart(couponCode: reads > 1 ? 'SERVER' : null);
  }

  @override
  Future<Cart> updateItem(String itemId, num quantity) async {
    writes++;
    throw AppFailure(FailureKind.conflict, statusCode: 409, code: code);
  }
}

void main() {
  test('all Release 1 refusal codes have bilingual actionable copy', () {
    for (final l10n in [AppLocalizationsEn(), AppLocalizationsAr()]) {
      for (final code in [
        'IDEMPOTENCY_KEY_REUSED',
        'CART_EMPTY',
        'CART_QUANTITY_INVALID',
        'CART_PRODUCT_UNAVAILABLE',
        'CART_VARIANT_UNAVAILABLE',
        'CART_SKU_UNAVAILABLE',
        'REQUESTED_QUANTITY_UNAVAILABLE',
        'INSUFFICIENT_STOCK',
        'WORK_ACCOUNT_SHOPPING_FORBIDDEN',
        'APP_ROLE_FORBIDDEN',
        'AUTH_SURFACE_FORBIDDEN',
        'SKU_WHOLE_UNITS_ONLY',
        'COUPON_INVALID',
        'PRICE_CHANGED',
        'ORDER_ACCESS_FORBIDDEN',
        'CANCELLATION_REQUEST_NOT_ALLOWED',
        'CANCELLATION_REQUEST_ALREADY_PENDING',
        'QUANTITY_REDUCTION_NOT_PENDING',
        'PAID_COD_CANCELLATION_FORBIDDEN',
        'ORDER_TRANSITION_NOT_ALLOWED',
        'STALE_ORDER_STATE',
      ]) {
        final failure = AppFailure(
          FailureKind.conflict,
          code: code,
          serverMessage: 'SECRET',
        );
        expect(
          failure.localizedMessage(l10n),
          isNot(l10n.errorConflict),
          reason: code,
        );
        expect(failure.localizedMessage(l10n), isNot(contains('SECRET')));
      }
      expect(
        const AppFailure(
          FailureKind.network,
          code: 'NEW_CODE',
        ).localizedMessage(l10n),
        l10n.errorNetwork,
      );
    }
    expect(
      const AppFailure(
        FailureKind.conflict,
        code: 'PRICE_CHANGED',
      ).requiresCartRefresh,
      isFalse,
    );
    expect(
      const AppFailure(
        FailureKind.conflict,
        code: 'IDEMPOTENCY_KEY_REUSED',
      ).requiresCartRefresh,
      isFalse,
    );
  });
  for (final code in ['REQUESTED_QUANTITY_UNAVAILABLE', 'INSUFFICIENT_STOCK']) {
    for (final failRefresh in [false, true]) {
      test(
        'stock rejection refreshes without retrying mutation; $code read fails=$failRefresh',
        () async {
          final repo = _Cart()
            ..failRefresh = failRefresh
            ..code = code;
          final c = ProviderContainer(
            overrides: [
              dataSourceProvider.overrideWithValue(DataSource.mock),
              sessionControllerProvider.overrideWith(TestSession.new),
              cartRepositoryProvider.overrideWithValue(repo),
            ],
          );
          addTearDown(c.dispose);
          await c.read(sessionControllerProvider.future);
          await c.read(cartControllerProvider.future);
          final result = await c
              .read(cartControllerProvider.notifier)
              .setQuantity('line', 2);
          expect(result.status, CartMutationStatus.failed);
          expect((result.error as AppFailure).code, code);
          expect(repo.reads, 2);
          expect(repo.writes, 1);
          if (failRefresh) {
            expect(c.read(cartControllerProvider).hasError, isTrue);
          } else {
            expect(
              c.read(cartControllerProvider).requireValue.couponCode,
              'SERVER',
            );
          }
        },
      );
    }
  }
}

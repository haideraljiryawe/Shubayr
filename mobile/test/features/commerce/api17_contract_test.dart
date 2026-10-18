import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/error_mapper.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/discount_tier_repository.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/orders/data/after_sales_repository_remote.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/return_request.dart';
import 'package:shubayr/features/orders/presentation/screens/return_detail_screen.dart';
import 'package:shubayr/features/settings/data/store_settings.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';
import 'package:shubayr/features/notifications/data/notification_repository.dart';
import 'package:shubayr/features/notifications/presentation/notification_destination.dart';

Map<String, dynamic> returnJson() => {
  'id': 'return-1',
  'order_id': 'order-1',
  'document_number': 'RET-001',
  'status': 'refunded',
  'currency': 'IQD',
  'expected_refund': 2000,
  'refund_amount': 2000,
  'delivery_fee_refund': 1000,
  'uncollected_offset': 500,
  'cash_refund_amount': 2500,
  'points_effect': {'earned_reversed': 20, 'redeemed_restored': 5, 'net': -15},
  'items': [
    {
      'order_item_id': 'item-1',
      'quantity': .5,
      'approved_quantity': .25,
      'product_name_ar': 'قهوة',
      'product_name_en': 'Coffee',
      'base_unit': 'kg',
      'whole_units_only': false,
      'customer_reason': 'Damaged package',
      'reason_code': 'defect',
      'net_amount': 4000,
      'approved_refund': 2000,
      'discount_share': 500,
    },
  ],
  'events': [
    {'type': 'refunded', 'created_at': '2026-10-18T12:00:00Z', 'note': null},
  ],
  'refund_payments': [
    {
      'method': 'cash_account',
      'amount_iqd': 2500,
      'created_at': '2026-10-18T12:00:00Z',
      'proof_reference': 'PAY-001',
    },
  ],
};

void main() {
  test(
    'return notifications open customer details only for their target role',
    () {
      final notification = InboxNotification(
        id: 'notification-1',
        targetRole: 'customer',
        titleAr: '',
        titleEn: '',
        bodyAr: '',
        bodyEn: '',
        entityType: 'return',
        entityId: 'return-1',
        createdAt: DateTime.utc(2026, 10, 18),
      );
      expect(
        notification.destination(UserRole.customer),
        '/orders/returns/return-1',
      );
      expect(notification.destination(UserRole.monitor), isNull);
      expect(notification.destination(UserRole.delivery), isNull);
    },
  );
  test(
    'return details use owned endpoint and preserve net refund and points snapshots',
    () async {
      final dio = Dio();
      String? path;
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            path = request.path;
            handler.resolve(
              Response(
                requestOptions: request,
                statusCode: 200,
                data: returnJson(),
              ),
            );
          },
        ),
      );
      final result = await AfterSalesRepositoryRemote(
        ApiClient(dio),
      ).fetchReturn('return-1');
      expect(path, '/returns/return-1');
      expect(result.cashRefundAmount, 2500);
      expect(result.pointsEffect!.net, -15);
      expect(result.items.single.approvedQuantity, .25);
      expect(
        ReturnRequest.fromJson(
          result.toJson(),
        ).refundPayments.single.proofReference,
        'PAY-001',
      );
    },
  );
  test('new pricing fields do not replace authoritative cart total', () {
    final cart = Cart.fromJson({
      'id': 'cart',
      'items': [],
      'subtotal': 30000,
      'discount': 3000,
      'coupon_discount': 0,
      'tier_discount': 3000,
      'discount_source': 'tier',
      'applied_tier': {'id': null, 'min_subtotal': 25000, 'percent': 10},
      'next_tier': {
        'min_subtotal': 50000,
        'percent': 15,
        'amount_remaining': 20000,
      },
      'delivery_fee': 5000,
      'total': 32000,
      'coupon_code': 'SMALLER',
      'currency': 'IQD',
    });
    expect(cart.total, 32000);
    expect(cart.discountSource, 'tier');
    expect(cart.couponDiscount, 0);
    expect(cart.nextTier!.amountRemaining, 20000);
    expect(Cart.fromJson(cart.toJson()).tierDiscount, 3000);
  });
  test('public discount policy comes from its API', () async {
    final dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (request, handler) {
          expect(request.path, '/discount-tiers');
          handler.resolve(
            Response(
              requestOptions: request,
              statusCode: 200,
              data: {
                'currency': 'IQD',
                'coupon_stacking_enabled': false,
                'tiers': [
                  {'min_subtotal': 25000, 'percent': 5},
                ],
              },
            ),
          );
        },
      ),
    );
    final policy = await DiscountTierRepository(ApiClient(dio)).fetch();
    expect(policy.couponStackingEnabled, false);
    expect(policy.tiers.single.minSubtotal, 25000);
  });
  test(
    'order snapshots preserve loyalty allocations and adjusted delivery',
    () {
      final order = Order.fromJson({
        'id': 'order-1',
        'original_delivery_fee': 5000,
        'adjusted_delivery_fee': 3000,
        'delivery_fee': 3000,
        'loyalty_redemption_amount': 1000,
        'loyalty_points_redeemed': 1000,
        'delivery_governorate': {
          'code': 'IQ-BG',
          'name_ar': 'بغداد',
          'name_en': 'Baghdad',
        },
        'items': [
          {
            'id': 'item-1',
            'product_id': 'product-1',
            'line_total': 10000,
            'discount_share': 1000,
            'net_line_total': 9000,
            'loyalty_discount_share': 1000,
            'net_paid_total': 8000,
          },
        ],
        'returns': [
          {
            'id': 'return-1',
            'document_number': 'RET-001',
            'status': 'refunded',
            'refund_amount': 2000,
          },
        ],
      });
      expect(order.items.single.netPaidTotal, 8000);
      final saved = Order.fromJson(order.toJson());
      expect(saved.originalDeliveryFee, 5000);
      expect(saved.deliveryGovernorate!.nameEn, 'Baghdad');
      expect(saved.returns.single.status, 'refunded');
    },
  );
  test(
    'optional store information survives cache serialization without invented contacts',
    () {
      final settings = StoreSettings.fromJson({
        'store_name': 'Shubayr',
        'support_phone': null,
        'support_email': 'support@example.com',
        'return_window_days': 14,
        'refund_days': 7,
        'policy_effective_date': '2026-10-18',
      });
      expect(settings.supportPhone, isNull);
      final cached = StoreSettings.fromJson(settings.toJson());
      expect(cached.supportEmail, 'support@example.com');
      expect(cached.returnWindowDays, 14);
      expect(StoreSettings.fromJson({}).refundDays, isNull);
    },
  );
  test(
    'account deletion counts are machine readable; OTP failures keep their codes',
    () {
      final request = RequestOptions(path: '/me/account');
      final error = mapDioException(
        DioException.badResponse(
          statusCode: 409,
          requestOptions: request,
          response: Response(
            requestOptions: request,
            statusCode: 409,
            data: {
              'code': 'ACCOUNT_DELETION_BLOCKED',
              'details': {
                'open_orders': 2,
                'pending_returns': 1,
                'unsettled_amounts': 0,
              },
            },
          ),
        ),
      );
      expect(error.details['open_orders'], 2);
      for (final code in ['SMS_NOT_CONFIGURED', 'OTP_DELIVERY_UNAVAILABLE']) {
        final mapped = mapDioException(
          DioException.badResponse(
            statusCode: 503,
            requestOptions: request,
            response: Response(
              requestOptions: request,
              statusCode: 503,
              data: {'code': code},
            ),
          ),
        );
        expect(mapped.code, code);
      }
    },
  );
  test(
    'localized product descriptions use translated field and preserve legacy fallback',
    () {
      const product = Product(
        id: 'p',
        categoryId: 'c',
        nameAr: 'منتج',
        nameEn: 'Product',
        description: 'Legacy',
        descriptionAr: 'وصف',
        descriptionEn: 'Description',
      );
      expect(product.localizedDescription('ar'), 'وصف');
      expect(product.localizedDescription('en'), 'Description');
      expect(
        const Product(
          id: 'p',
          categoryId: 'c',
          nameAr: 'منتج',
          nameEn: 'Product',
          description: 'Legacy',
        ).localizedDescription('ar'),
        'Legacy',
      );
    },
  );
  for (final language in ['ar', 'en']) {
    testWidgets(
      'return detail is readable at 320px and enlarged text in $language',
      (tester) async {
        tester.view.physicalSize = const Size(320, 740);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          MaterialApp(
            locale: Locale(language),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: AppTheme.light(const Brand.bundled()),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(1.5)),
              child: child!,
            ),
            home: Scaffold(
              body: SingleChildScrollView(
                child: ReturnDetails(
                  request: ReturnRequest.fromJson(returnJson()),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('RET-001'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.drag(
          find.byType(SingleChildScrollView),
          const Offset(0, -1800),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }
}

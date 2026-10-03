import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/orders/data/after_sales_repository_remote.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import '../../helpers/test_session.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/orders/data/order_tracking.dart';
import 'package:shubayr/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/review.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/orders/data/order.dart';
import 'package:shubayr/features/orders/data/return_request.dart';
import 'package:shubayr/features/orders/domain/after_sales_repository.dart';
import 'package:shubayr/features/orders/presentation/providers/after_sales_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/orders/presentation/screens/after_sales_screens.dart';

class _Repository implements AfterSalesRepository {
  bool fail = false;
  int reviews = 0;
  int returns = 0;
  String? reviewedItem;
  int? rating;
  List<ReturnRequestItem> lines = [];
  @override
  Future<ReviewPage> fetchOwnReviews({int page = 1, int perPage = 100}) async =>
      ReviewPage(page: page, perPage: perPage);
  @override
  Future<ReturnPage> fetchReturns({int page = 1, int perPage = 100}) async =>
      ReturnPage(page: page, perPage: perPage, total: 0, data: []);
  @override
  Future<Review> submitReview({
    required String productId,
    required String orderItemId,
    required int rating,
    String? comment,
  }) async {
    reviews++;
    await Future<void>.delayed(const Duration(milliseconds: 200));
    if (fail) throw const AppFailure.network();
    reviewedItem = orderItemId;
    this.rating = rating;
    return Review(
      id: 'r',
      productId: productId,
      orderItemId: orderItemId,
      rating: rating,
      comment: comment,
      status: 'pending',
      createdAt: DateTime(2026),
    );
  }

  @override
  Future<ReturnRequest> requestReturn({
    required String orderId,
    required List<ReturnRequestItem> items,
    String? reason,
  }) async {
    returns++;
    await Future<void>.delayed(const Duration(milliseconds: 200));
    if (fail) throw const AppFailure.network();
    lines = items;
    return ReturnRequest(
      id: 'return-1',
      orderId: orderId,
      items: items,
      reason: reason,
    );
  }
}

Widget _host(
  Widget screen,
  AfterSalesRepository repository, {
  String status = 'delivered',
  String locale = 'en',
  bool dark = false,
  List<OrderItem>? items,
  Future<Product> Function(String)? catalogLookup,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    brandProvider.overrideWithValue(const Brand.bundled()),
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    sessionControllerProvider.overrideWith(TestSession.new),
    afterSalesRepositoryProvider.overrideWithValue(repository),
    orderTrackingProvider(
      'o1',
    ).overrideWith((ref) async => const OrderTracking(orderId: 'o1')),
    orderProvider('o1').overrideWith(
      (ref) async => Order(
        id: 'o1',
        orderNumber: 'SH-42',
        status: status,
        items:
            items ??
            const [
              OrderItem(id: 'i1', productId: 'p1', quantity: 3),
              OrderItem(id: 'i2', productId: 'p2', quantity: 1),
            ],
      ),
    ),
    if (catalogLookup != null)
      for (final id in ['p1', 'p2'])
        productProvider(id).overrideWith((ref) => catalogLookup(id)),
    if (catalogLookup == null)
      orderProductsProvider('o1').overrideWith(
        (ref) async => const {
          'p1': Product(
            id: 'p1',
            categoryId: 'c',
            nameEn: 'Coffee',
            nameAr: 'قهوة عربية',
          ),
          'p2': Product(
            id: 'p2',
            categoryId: 'c',
            nameEn: 'Cup',
            nameAr: 'كوب',
          ),
        },
      ),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: screen,
  ),
);

void main() {
  OrderItem line({bool? reviewed}) => OrderItem.fromJson({
    'id': 'i1',
    'product_id': 'p1',
    'product_name_en': 'Coffee',
    'quantity': .5,
    'reviewed': ?reviewed,
  });
  AfterSalesRepository history({
    num returned = 0,
    bool fail = false,
    Completer<void>? gate,
    bool reviewOnPageTwo = false,
  }) {
    final dio = Dio();
    addTearDown(dio.close);
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          await gate?.future;
          if (fail) {
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
              ),
            );
            return;
          }
          final page = int.parse('${options.queryParameters['page'] ?? 1}');
          final reviews = options.path == '/me/reviews';
          final data = reviews
              ? [
                  if (reviewOnPageTwo)
                    for (var i = 0; i < (page == 1 ? 100 : 1); i++)
                      {
                        'id': 'r$page-$i',
                        'product_id': 'p1',
                        'order_item_id': page == 2 ? 'i1' : 'other-$i',
                        'rating': 5,
                        'status': 'pending',
                        'created_at': '2026-10-03T00:00:00Z',
                      },
                ]
              : [
                  if (returned > 0)
                    {
                      'id': 'r',
                      'order_id': 'o1',
                      'status': 'requested',
                      'items': [
                        {'order_item_id': 'i1', 'quantity': returned},
                      ],
                    },
                ];
          handler.resolve(
            Response(
              requestOptions: options,
              data: {
                'page': page,
                'per_page': 100,
                'total': reviews && reviewOnPageTwo ? 101 : data.length,
                'data': data,
              },
            ),
          );
        },
      ),
    );
    return AfterSalesRepositoryRemote(ApiClient(dio));
  }

  for (final reviewed in [true, false]) {
    testWidgets('fresh order reviewed=$reviewed controls review eligibility', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(
          const ReviewOrderScreen(orderId: 'o1'),
          history(),
          items: [line(reviewed: reviewed)],
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.byType(DropdownButtonFormField<String>),
        reviewed ? findsNothing : findsOneWidget,
      );
    });
  }
  testWidgets('missing reviewed flag checks all own-review pages', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        const ReviewOrderScreen(orderId: 'o1'),
        history(reviewOnPageTwo: true),
        items: [line()],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
  });
  for (final quantity in [.125, .5]) {
    testWidgets('persisted return $quantity survives a fresh screen', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(
          const ReturnOrderScreen(orderId: 'o1'),
          history(returned: quantity),
          items: [line()],
        ),
      );
      await tester.pumpAndSettle();
      if (quantity == .125) {
        expect(
          find.text('Quantity available to request: 0.375'),
          findsOneWidget,
        );
      } else {
        expect(find.byTooltip('Increase return quantity'), findsNothing);
      }
    });
  }
  testWidgets('loading return history does not initially offer eligibility', (
    tester,
  ) async {
    final gate = Completer<void>();
    await tester.pumpWidget(
      _host(
        const ReturnOrderScreen(orderId: 'o1'),
        history(gate: gate),
        items: [line()],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byTooltip('Increase return quantity'), findsNothing);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byTooltip('Increase return quantity'), findsOneWidget);
  });
  testWidgets('failed history does not grant return permission', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        const ReturnOrderScreen(orderId: 'o1'),
        history(fail: true),
        items: [line()],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('Increase return quantity'), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets(
    'order detail does not offer exhausted persisted after-sales actions',
    (tester) async {
      await tester.pumpWidget(
        _host(
          const OrderDetailScreen(orderId: 'o1'),
          history(returned: .5),
          items: [line(reviewed: true)],
          catalogLookup: (_) async => const Product(
            id: 'p1',
            categoryId: 'c',
            nameEn: 'Coffee',
            nameAr: 'قهوة',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView).first, const Offset(0, -1200));
      await tester.pumpAndSettle();
      final l10n = AppLocalizations.of(
        tester.element(find.byType(OrderDetailScreen)),
      );
      expect(
        find.widgetWithText(ElevatedButton, l10n.reviewOrderTitle),
        findsNothing,
      );
      expect(
        find.widgetWithText(ElevatedButton, l10n.returnOrderTitle),
        findsNothing,
      );
      expect(find.text(l10n.reviewAllSubmitted), findsOneWidget);
      expect(find.text(l10n.returnAllRequested), findsOneWidget);
    },
  );
  testWidgets('switching accounts clears private review input', (tester) async {
    await tester.pumpWidget(
      _host(const ReviewOrderScreen(orderId: 'o1'), _Repository()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Coffee').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Private A comment');
    final c = ProviderScope.containerOf(
      tester.element(find.byType(ReviewOrderScreen)),
    );
    (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
      const Session.signedIn(User(id: 'B', role: 'customer')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Private A comment'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('switching accounts clears the previous return success receipt', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(const ReturnOrderScreen(orderId: 'o1'), _Repository()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Increase return quantity').first);
    await tester.pump();
    await tester.ensureVisible(find.text('Submit return request'));
    await tester.tap(find.text('Submit return request'));
    await tester.pumpAndSettle();
    expect(find.text('Request reference: return-1'), findsOneWidget);
    final c = ProviderScope.containerOf(
      tester.element(find.byType(ReturnOrderScreen)),
    );
    (c.read(sessionControllerProvider.notifier) as TestSession).setSession(
      const Session.signedIn(User(id: 'B', role: 'customer')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Request reference: return-1'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('fractional historical return clamps shortcuts and sends .125', (
    tester,
  ) async {
    final repository = _Repository();
    await tester.pumpWidget(
      _host(
        const ReturnOrderScreen(orderId: 'o1'),
        repository,
        items: const [
          OrderItem(
            id: 'i1',
            productId: 'p1',
            quantity: 0.5,
            productNameEn: 'Historical coffee',
          ),
        ],
        catalogLookup: (_) async => throw StateError('Deleted'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Quantity available to request: 0.5'), findsOneWidget);
    await tester.tap(find.byTooltip('Increase return quantity'));
    await tester.pump();
    expect(find.text('0.5'), findsOneWidget);
    await tester.tap(find.byTooltip('Decrease return quantity'));
    await tester.pump();
    expect(find.text('0'), findsOneWidget);
    await tester.tap(find.text('0'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '0.125');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Submit return request'));
    await tester.tap(find.text('Submit return request'));
    await tester.pumpAndSettle();
    expect(repository.lines.single.quantity, 0.125);
    expect(find.text('Qty: 0.125'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'saved labels allow return input while variant lookup is pending',
    (tester) async {
      final catalog = Completer<Product>();
      final repository = _Repository();
      await tester.pumpWidget(
        _host(
          const ReturnOrderScreen(orderId: 'o1'),
          repository,
          items: const [
            OrderItem(
              id: 'i1',
              productId: 'p1',
              variantId: 'v1',
              productNameEn: 'Purchase name',
              quantity: 3,
            ),
          ],
          catalogLookup: (_) => catalog.future,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Purchase name — v1'), findsOneWidget);
      await tester.tap(find.byTooltip('Increase return quantity'));
      await tester.pump();
      catalog.complete(
        const Product(
          id: 'p1',
          categoryId: 'c',
          nameEn: 'Renamed',
          nameAr: '',
          variants: [
            ProductVariant(id: 'v1', attributes: {'size': 'XL'}),
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Purchase name — XL'), findsOneWidget);
      await tester.ensureVisible(find.text('Submit return request'));
      await tester.tap(find.text('Submit return request'));
      await tester.pumpAndSettle();
      expect(repository.lines.single.quantity, 1);
      expect(repository.lines.single.orderItemId, 'i1');
      expect(find.text('Return request submitted.'), findsOneWidget);
    },
  );

  for (final saved in [false, true]) {
    testWidgets(
      'review submits purchased item even with deleted catalog; saved=$saved',
      (tester) async {
        final repository = _Repository();
        await tester.pumpWidget(
          _host(
            const ReviewOrderScreen(orderId: 'o1'),
            repository,
            items: [
              OrderItem(
                id: 'i1',
                productId: 'p1',
                productNameEn: saved ? 'Purchase name' : null,
              ),
            ],
            catalogLookup: (_) async => throw StateError('Deleted'),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byType(DropdownButtonFormField<String>));
        await tester.pumpAndSettle();
        await tester.tap(find.text(saved ? 'Purchase name' : 'p1').last);
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('4 out of 5 stars'));
        await tester.pump();
        await tester.tap(find.text('Submit review'));
        await tester.pumpAndSettle();
        expect(repository.reviewedItem, 'i1');
        expect(
          find.text('Review submitted. Publication is subject to review.'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'return and receipt keep item labels with deleted catalog; saved=$saved',
      (tester) async {
        final repository = _Repository();
        await tester.pumpWidget(
          _host(
            const ReturnOrderScreen(orderId: 'o1'),
            repository,
            items: [
              OrderItem(
                id: 'i1',
                productId: 'p1',
                quantity: 3,
                productNameEn: saved ? 'Purchase name' : null,
              ),
            ],
            catalogLookup: (_) async => throw StateError('Deleted'),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text(saved ? 'Purchase name' : 'p1'), findsOneWidget);
        await tester.tap(find.byTooltip('Increase return quantity'));
        await tester.pump();
        await tester.ensureVisible(find.text('Submit return request'));
        await tester.tap(find.text('Submit return request'));
        await tester.pumpAndSettle();
        expect(repository.lines.single.orderItemId, 'i1');
        expect(repository.lines.single.quantity, 1);
        expect(find.text(saved ? 'Purchase name' : 'p1'), findsOneWidget);
        expect(find.text('Return request submitted.'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('mixed legacy and snapshot labels use their own source', (
    tester,
  ) async {
    await tester.pumpWidget(
      _host(
        const ReturnOrderScreen(orderId: 'o1'),
        _Repository(),
        items: const [
          OrderItem(
            id: 'i1',
            productId: 'p1',
            productNameEn: 'Purchase coffee',
          ),
          OrderItem(id: 'i2', productId: 'p2'),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Purchase coffee'), findsOneWidget);
    expect(find.text('Cup'), findsOneWidget);
    expect(find.text('Coffee'), findsNothing);
  });

  testWidgets(
    'review requires item and stars; submits once and excludes the item',
    (tester) async {
      final repository = _Repository();
      await tester.pumpWidget(
        _host(const ReviewOrderScreen(orderId: 'o1'), repository),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
        isNull,
      );
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Coffee').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('4 out of 5 stars'));
      await tester.enterText(find.byType(TextField), 'Good coffee');
      await tester.tap(find.text('Submit review'));
      await tester.pump();
      expect(repository.reviews, 1);
      await tester.pumpAndSettle();
      expect(repository.reviewedItem, 'i1');
      expect(repository.rating, 4);
      expect(
        find.text('Review submitted. Publication is subject to review.'),
        findsOneWidget,
      );
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      expect(find.text('Coffee'), findsNothing);
      expect(find.text('Cup'), findsWidgets);
    },
  );

  testWidgets('failed review retains input and can be retried', (tester) async {
    final repository = _Repository()..fail = true;
    await tester.pumpWidget(
      _host(const ReviewOrderScreen(orderId: 'o1'), repository),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Coffee').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('5 out of 5 stars'));
    await tester.enterText(find.byType(TextField), 'Keep this comment');
    await tester.tap(find.text('Submit review'));
    await tester.pumpAndSettle();
    expect(find.text('Keep this comment'), findsOneWidget);
    repository.fail = false;
    await tester.ensureVisible(find.text('Submit review'));
    await tester.tap(find.text('Submit review'));
    await tester.pumpAndSettle();
    expect(repository.reviews, 2);
    expect(repository.rating, 5);
  });

  testWidgets('partial return respects bounds and keeps the other item', (
    tester,
  ) async {
    final repository = _Repository();
    await tester.pumpWidget(
      _host(const ReturnOrderScreen(orderId: 'o1'), repository),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Submit return request'));
    expect(
      tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
      isNull,
    );
    await tester.ensureVisible(
      find
          .byWidgetPredicate(
            (w) => w is IconButton && w.tooltip == 'Increase return quantity',
          )
          .first,
    );
    for (var n = 0; n < 3; n++) {
      await tester.tap(find.byTooltip('Increase return quantity').first);
      await tester.pump();
    }
    expect(
      tester
          .widget<IconButton>(
            find
                .byWidgetPredicate(
                  (w) =>
                      w is IconButton &&
                      w.tooltip == 'Increase return quantity',
                )
                .first,
          )
          .onPressed,
      isNull,
    );
    await tester.tap(find.byTooltip('Decrease return quantity').first);
    await tester.pump();
    await tester.tap(find.byTooltip('Decrease return quantity').first);
    await tester.pump();
    await tester.ensureVisible(find.text('Submit return request'));
    await tester.tap(find.text('Submit return request'));
    await tester.pumpAndSettle();
    expect(repository.lines.single.orderItemId, 'i1');
    expect(repository.lines.single.quantity, 1);
    expect(find.text('Return request submitted.'), findsOneWidget);
    expect(find.text('Request reference: return-1'), findsOneWidget);
    expect(find.text('Cup'), findsNothing);
  });

  for (final screen in [
    const ReviewOrderScreen(orderId: 'o1'),
    const ReturnOrderScreen(orderId: 'o1'),
  ]) {
    testWidgets('${screen.runtimeType} rejects undelivered orders', (
      tester,
    ) async {
      await tester.pumpWidget(_host(screen, _Repository(), status: 'pending'));
      await tester.pumpAndSettle();
      expect(find.byType(ElevatedButton), findsNothing);
      expect(
        find.text('These services are available after the order is delivered.'),
        findsOneWidget,
      );
    });
    for (final dark in [false, true]) {
      testWidgets(
        '${screen.runtimeType} Arabic responsive layout, dark=$dark',
        (tester) async {
          tester.view.physicalSize = const Size(375, 812);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(
            _host(screen, _Repository(), locale: 'ar', dark: dark),
          );
          await tester.pumpAndSettle();
          for (final width in <double>[
            375,
            599,
            600,
            899,
            900,
            1199,
            1200,
            1535,
            1536,
            1920,
          ]) {
            tester.view.physicalSize = Size(width, 900);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: 'width=$width');
            expect(
              Directionality.of(tester.element(find.byType(Scaffold))),
              TextDirection.rtl,
            );
          }
        },
      );
    }
  }
}

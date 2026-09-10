import 'dart:async';

import 'package:flutter/material.dart';
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
  _Repository repository, {
  String status = 'delivered',
  String locale = 'en',
  bool dark = false,
  List<OrderItem>? items,
  Future<Product> Function(String)? catalogLookup,
}) => ProviderScope(
  overrides: [
    afterSalesRepositoryProvider.overrideWithValue(repository),
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
      testWidgets('${screen.runtimeType} Arabic narrow layout, dark=$dark', (
        tester,
      ) async {
        tester.view.physicalSize = const Size(375, 812);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          _host(screen, _Repository(), locale: 'ar', dark: dark),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          Directionality.of(tester.element(find.byType(Scaffold))),
          TextDirection.rtl,
        );
      });
    }
  }
}

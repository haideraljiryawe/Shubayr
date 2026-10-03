import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/data/user.dart';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_card.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:shubayr/features/wishlist/data/wishlist_item.dart';
import 'package:shubayr/features/wishlist/presentation/providers/wishlist_providers.dart';
import 'package:shubayr/features/wishlist/presentation/screens/wishlist_screen.dart';
import 'package:shubayr/features/wishlist/presentation/widgets/wishlist_button.dart';

import 'support/wishlist_fakes.dart';

List<WishlistItem> _items(int count) => [
  for (var i = 0; i < count; i++)
    WishlistItem(
      id: 'w$i',
      productId: 'p$i',
      product: Product(
        id: 'p$i',
        categoryId: 'c',
        nameAr: 'منتج $i',
        nameEn: 'Product $i',
        effectivePrice: 1000,
      ),
    ),
];

Widget _host(
  RecordingWishlist repository, {
  String locale = 'en',
  bool dark = false,
  Widget home = const WishlistScreen(),
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    sessionControllerProvider.overrideWith(TestSession.new),
    wishlistRepositoryProvider.overrideWithValue(repository),
    brandProvider.overrideWithValue(const Brand.bundled()),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    home: home,
  ),
);

void main() {
  testWidgets('refresh keeps content but a new session hides previous data', (
    tester,
  ) async {
    final repo = RecordingWishlist(entries: _items(1));
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    expect(find.text('Product 0'), findsOneWidget);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(WishlistScreen)),
    );
    final oldPage = Completer<WishlistPage>();
    repo.onFetch = (_) => oldPage.future;
    final refresh = container
        .read(wishlistControllerProvider.notifier)
        .refresh();
    await tester.pump();
    expect(find.text('Product 0'), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    final newPage = Completer<WishlistPage>();
    repo.onFetch = (_) => newPage.future;
    (container.read(sessionControllerProvider.notifier) as TestSession)
        .setSession(const Session.signedIn(User(id: 'next', role: 'customer')));
    await tester.pump();
    await tester.pump();
    expect(find.text('Product 0'), findsNothing);
    oldPage.completeError(const AppFailure.network());
    await tester.pump();
    await refresh;
    expect(find.text('Retry'), findsNothing);
    newPage.complete(const WishlistPage(page: 1, perPage: 100, total: 0));
    await tester.pumpAndSettle();
    expect(container.read(wishlistControllerProvider).hasError, isFalse);
    expect(find.text('Product 0'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    // Measure the badge with the actual bundled font, not the test placeholder.
    final font = FontLoader('Cairo')
      ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
    await font.load();
  });

  for (final locale in ['ar', 'en']) {
    testWidgets('stock badge stays opposite the wishlist heart in $locale', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(402, 874));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final repo = RecordingWishlist(
        entries: const [
          WishlistItem(
            id: 'w-stock',
            productId: 'p-stock',
            product: Product(
              id: 'p-stock',
              categoryId: 'c',
              nameAr: 'منتج نافذ',
              nameEn: 'Sold-out product',
              effectivePrice: 1000,
              inStock: false,
            ),
          ),
        ],
      );
      await tester.pumpWidget(_host(repo, locale: locale));
      await tester.pumpAndSettle();
      final l10n = AppLocalizations.of(
        tester.element(find.byType(WishlistScreen)),
      );
      final badge = tester.getRect(find.text(l10n.commonOutOfStock));
      final heart = tester.getRect(find.byType(WishlistButton));
      if (locale == 'ar') {
        expect(badge.left, greaterThan(heart.right));
      } else {
        expect(badge.right, lessThan(heart.left));
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'complete wishlist scrolls past page one and deleting a later product keeps the others',
    (tester) async {
      final repo = RecordingWishlist(entries: _items(17));
      await tester.pumpWidget(_host(repo));
      await tester.pumpAndSettle();
      expect(repo.requests.map((r) => r.page), [1]);
      final scroll = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(
        find.text('Product 16'),
        400,
        scrollable: scroll,
      );
      await tester.pumpAndSettle();
      final lastCard = find
          .ancestor(of: find.text('Product 16'), matching: find.byType(Stack))
          .last;
      // The wishlist heart belongs to the same cell as the last product.
      final heart = find.byWidgetPredicate(
        (widget) => widget is WishlistButton && widget.productId == 'p16',
      );
      expect(lastCard, findsOneWidget);
      await tester.tap(heart);
      await tester.pumpAndSettle();
      expect(repo.removed, ['p16']);
      expect(find.text('Product 16'), findsNothing);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(WishlistScreen)),
      );
      expect(
        container.read(wishlistControllerProvider).requireValue,
        hasLength(16),
      );
      expect(container.read(isWishlistedProvider('p15')), isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'failure on a later page shows retry and can recover all products',
    (tester) async {
      final entries = _items(101);
      final repo = RecordingWishlist(entries: entries)
        ..onFetch = (r) async {
          if (r.page == 2) throw const AppFailure.network();
          return WishlistPage(
            page: 1,
            perPage: 100,
            total: 101,
            data: entries.take(100).toList(),
          );
        };
      await tester.pumpWidget(_host(repo));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      expect(find.byType(ProductCard), findsNothing);
      repo.onFetch = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Product 0'), findsOneWidget);
      expect(repo.requests.map((r) => r.page), [1, 2, 1, 2]);
    },
  );

  testWidgets('empty wishlist supports pull refresh and waits for the result', (
    tester,
  ) async {
    final repo = RecordingWishlist(entries: []);
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    expect(find.text('No saved products'), findsOneWidget);
    final response = Completer<WishlistPage>();
    repo.onFetch = (_) => response.future;
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 500));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(repo.requests, hasLength(2));
    expect(find.byType(RefreshProgressIndicator), findsOneWidget);
    response.complete(WishlistPage(perPage: 100, total: 1, data: _items(1)));
    await tester.pumpAndSettle();
    expect(find.text('Product 0'), findsOneWidget);
    expect(find.byType(RefreshProgressIndicator), findsNothing);
  });

  testWidgets(
    'a heart outside the list recognizes a product on the last page',
    (tester) async {
      final repo = RecordingWishlist(entries: _items(17));
      await tester.pumpWidget(
        _host(
          repo,
          home: const Scaffold(body: WishlistButton(productId: 'p16')),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.favorite), findsOneWidget);
      await tester.tap(find.byType(WishlistButton));
      await tester.pumpAndSettle();
      expect(repo.removed, ['p16']);
      expect(repo.added, isEmpty);
      expect(find.byIcon(Icons.favorite_border), findsOneWidget);
    },
  );

  testWidgets(
    'failed deletion keeps the heart saved and displays a localized error',
    (tester) async {
      final repo = RecordingWishlist(entries: _items(17))
        ..onRemove = (_) async => throw const AppFailure.network();
      await tester.pumpWidget(
        _host(
          repo,
          home: const Scaffold(body: WishlistButton(productId: 'p16')),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(WishlistButton));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.favorite), findsOneWidget);
      expect(find.byType(SnackBar), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final dark in [false, true]) {
    testWidgets(
      'Arabic wishlist retains its two-column layout at 320, dark=$dark',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(320, 700));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final repo = RecordingWishlist(entries: _items(10));
        await tester.pumpWidget(_host(repo, locale: 'ar', dark: dark));
        await tester.pumpAndSettle();
        final context = tester.element(find.byType(WishlistScreen));
        expect(Directionality.of(context), TextDirection.rtl);
        final first = tester.getRect(find.byType(ProductCard).at(0));
        final second = tester.getRect(find.byType(ProductCard).at(1));
        expect(first.top, second.top);
        await tester.scrollUntilVisible(
          find.text('منتج 9'),
          400,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(repo.requests.map((r) => r.page), [1]);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

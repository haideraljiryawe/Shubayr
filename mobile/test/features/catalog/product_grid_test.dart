import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/core/utils/currency_formatter.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_card.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_grid.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';

const _products = [
  Product(
    id: 'p1',
    categoryId: 'c',
    nameAr: 'ساعة ذكية',
    nameEn: 'Watch',
    salePrice: 120000,
    compareAtPrice: 150000,
    discountPercent: 20,
    ratingAvg: 4.2,
  ),
  Product(
    id: 'p2',
    categoryId: 'c',
    nameAr: 'سماعات لاسلكية سماعات لاسلكية بتقنية إلغاء الضوضاء',
    nameEn: 'Wireless headphones with noise cancellation',
    salePrice: 45000,
    ratingAvg: 4.5,
  ),
  Product(
    id: 'p3',
    categoryId: 'c',
    nameAr: 'منتج',
    nameEn: 'Product',
    salePrice: 123456789,
    compareAtPrice: 987654321,
    discountPercent: 88,
    inStock: false,
  ),
];

Widget _host({
  required List<Product> products,
  String locale = 'ar',
  bool dark = false,
  double textScale = 1,
  void Function(Product)? onTap,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [brandProvider.overrideWithValue(const Brand.bundled())],
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(textScale)),
      child: child!,
    ),
    home: Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.all(AppSpacing.screenH),
            sliver: ProductGridSliver(
              itemCount: products.length,
              itemBuilder: (_, i) => ProductCard(
                product: products[i],
                onTap: () => onTap?.call(products[i]),
              ),
            ),
          ),
        ],
      ),
    ),
  ),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    // Use the bundled Arabic font to exercise real line wrapping and metrics.
    final font = FontLoader('Cairo')
      ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
    await font.load();
  });

  for (final width in [320.0, 375.0, 390.0, 430.0]) {
    for (final locale in ['ar', 'en']) {
      for (final dark in [false, true]) {
        for (final scale in [1.0, 2.0]) {
          testWidgets(
            'content fits at $width, $locale, dark=$dark, scale=$scale',
            (tester) async {
              await tester.binding.setSurfaceSize(Size(width, 1200));
              addTearDown(() => tester.binding.setSurfaceSize(null));
              String? tapped;
              await tester.pumpWidget(
                _host(
                  products: _products,
                  locale: locale,
                  dark: dark,
                  textScale: scale,
                  onTap: (p) => tapped = p.id,
                ),
              );
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull);
              final labels = AppLocalizations.of(
                tester.element(find.byType(ProductCard).first),
              );
              expect(find.text(labels.promotionDiscount('20')), findsOneWidget);
              expect(find.text(labels.promotionDiscount('88')), findsOneWidget);
              final cards = find.byType(ProductCard);
              final first = tester.getRect(cards.at(0));
              final second = tester.getRect(cards.at(1));
              expect(first.height, closeTo(second.height, 0.01));
              expect(first.bottom, closeTo(second.bottom, 0.01));
              for (var i = 0; i < _products.length; i++) {
                final card = tester.getRect(cards.at(i));
                final image = tester.getRect(
                  find.descendant(
                    of: cards.at(i),
                    matching: find.byType(AspectRatio),
                  ),
                );
                expect(image.width, closeTo(image.height, 0.01));
                final name = tester.getRect(
                  find.text(_products[i].localizedName(locale)),
                );
                final price = tester.getRect(
                  find.text(
                    formatMoney(
                      _products[i].salePrice,
                      currencyCode: 'IQD',
                      localeCode: locale,
                    ),
                  ),
                );
                expect(name.top - image.bottom, closeTo(AppSpacing.md, 0.01));
                expect(
                  card.bottom - price.bottom,
                  closeTo(AppSpacing.md, 0.01),
                );
                expect(price.left, greaterThanOrEqualTo(card.left));
                expect(price.right, lessThanOrEqualTo(card.right));
              }
              final l10n = AppLocalizations.of(tester.element(cards.first));
              final badge = tester.getRect(find.text(l10n.commonOutOfStock));
              final third = tester.getRect(cards.at(2));
              expect(badge.left, greaterThanOrEqualTo(third.left));
              expect(badge.right, lessThanOrEqualTo(third.right));
              expect(
                locale == 'ar'
                    ? third.right - badge.right
                    : badge.left - third.left,
                closeTo(AppSpacing.sm * 2, 0.01),
              );
              await tester.tap(
                find.text(_products.first.localizedName(locale)),
              );
              expect(tapped, 'p1');
            },
          );
        }
      }
    }
  }

  testWidgets(
    'details keep equal top and bottom padding with a one-line name slot',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(402, 874));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final products = [
        _products.first,
        const Product(
          id: 'p2',
          categoryId: 'c',
          nameAr: 'سماعات لاسلكية سماعات لاسلكية',
          nameEn: 'Headphones',
          salePrice: 45000,
          ratingAvg: 4.5,
        ),
      ];
      await tester.pumpWidget(_host(products: products));
      await tester.pumpAndSettle();
      for (final product in products) {
        final name = find.text(product.nameAr);
        final card = find.ancestor(
          of: name,
          matching: find.byType(ProductCard),
        );
        final cardRect = tester.getRect(card);
        final image = tester.getRect(
          find.descendant(of: card, matching: find.byType(AspectRatio)),
        );
        final price = tester.getRect(
          find.text(
            formatMoney(
              product.salePrice,
              currencyCode: 'IQD',
              localeCode: 'ar',
            ),
          ),
        );
        expect(
          cardRect.bottom - price.bottom,
          closeTo(tester.getRect(name).top - image.bottom, 0.01),
        );
      }
      expect(tester.takeException(), isNull);
    },
  );

  for (final locale in ['ar', 'en']) {
    for (final scale in [1.0, 2.0]) {
      testWidgets(
        'short names use one line across rows and long names ellipsize, $locale, scale=$scale',
        (tester) async {
          await tester.binding.setSurfaceSize(const Size(320, 1600));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          final products = [
            for (var i = 0; i < 4; i++)
              Product(
                id: 'slot-$i',
                categoryId: 'c',
                nameAr: i < 2
                    ? 'ساعة $i'
                    : 'سماعات لاسلكية عالية الجودة مع خاصية إلغاء الضوضاء وشحن سريع رقم $i',
                nameEn: i < 2
                    ? 'Watch $i'
                    : 'Premium wireless headphones with noise cancellation and fast charging number $i',
                salePrice: 5000,
                ratingAvg: 4.2,
              ),
          ];
          await tester.pumpWidget(
            _host(products: products, locale: locale, textScale: scale),
          );
          await tester.pumpAndSettle();
          final cards = find.byType(ProductCard);
          final shortCard = tester.getRect(cards.at(0));
          final longCard = tester.getRect(cards.at(2));
          // Long names must not make a row taller than short names.
          expect(shortCard.height, closeTo(longCard.height, 0.01));
          final shortName = find.text(products.first.localizedName(locale));
          final longName = find.text(products[2].localizedName(locale));
          expect(
            tester.getSize(shortName).height,
            closeTo(tester.getSize(longName).height, 0.01),
          );
          final shortParagraph = tester.renderObject<RenderParagraph>(
            shortName,
          );
          final longParagraph = tester.renderObject<RenderParagraph>(longName);
          expect(shortParagraph.didExceedMaxLines, isFalse);
          expect(longParagraph.didExceedMaxLines, isTrue);
          expect(longParagraph.maxLines, 1);
          final style = tester.widget<Text>(shortName).style!;
          final painter = TextPainter(
            text: TextSpan(
              text: products.first.localizedName(locale),
              style: style,
            ),
            textDirection: locale == 'ar'
                ? TextDirection.rtl
                : TextDirection.ltr,
            textScaler: TextScaler.linear(scale),
            maxLines: 1,
          )..layout();
          expect(shortParagraph.size.height, closeTo(painter.height, 0.01));
          painter.dispose();
          expect(longParagraph.overflow, TextOverflow.ellipsis);
          for (var i = 0; i < products.length; i++) {
            final card = cards.at(i);
            final price = find.descendant(
              of: card,
              matching: find.text(
                formatMoney(5000, currencyCode: 'IQD', localeCode: locale),
              ),
            );
            final rating = find
                .ancestor(
                  of: find.descendant(of: card, matching: find.text('4.2')),
                  matching: find.byType(Row),
                )
                .first;
            final priceRect = tester.getRect(price);
            final imageRect = tester.getRect(
              find.descendant(of: card, matching: find.byType(AspectRatio)),
            );
            expect(
              tester.getSize(card).height,
              closeTo(
                imageRect.height +
                    AppSpacing.md * 2 +
                    shortParagraph.size.height +
                    tester.getSize(rating).height +
                    AppSpacing.xs * 2 +
                    priceRect.height,
                0.01,
              ),
              reason:
                  'A naturally sized card must not reserve a second title line',
            );
            expect(
              tester.getRect(card).bottom - priceRect.bottom,
              closeTo(AppSpacing.md, 0.01),
            );
            expect(
              priceRect.top - tester.getRect(rating).bottom,
              closeTo(AppSpacing.xs, 0.01),
            );
          }
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}

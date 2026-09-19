import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/theme/app_colors.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/theme_context.dart';
import 'package:shubayr/core/theme/tokens/app_radii.dart';
import 'package:shubayr/core/theme/tokens/app_shadows.dart';
import 'package:shubayr/core/widgets/skeleton.dart';
import 'package:shubayr/core/widgets/state_views.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/presentation/widgets/catalog_image_view.dart';
import 'package:shubayr/features/catalog/data/media/catalog_image.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/categories_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/subcategories_screen.dart';
import 'package:shubayr/features/catalog/presentation/widgets/category_card.dart';
import 'package:shubayr/features/catalog/presentation/widgets/category_icon.dart';

const _tree = [
  Category(
    id: 'c1',
    nameEn: 'Electronics',
    nameAr: 'إلكترونيات',
    children: [
      Category(
        id: 'cat-phones',
        nameEn: 'Phones and mobile accessories with a long name',
        nameAr: 'الهواتف والإكسسوارات المحمولة ذات الاسم الطويل',
      ),
      Category(id: 'cat-audio', nameEn: 'Audio', nameAr: 'صوتيات'),
      Category(id: 'cat-wearables', nameEn: 'Wearables', nameAr: 'ساعات'),
      Category(
        id: 'cat-accessories',
        nameEn: 'Accessories',
        nameAr: 'إكسسوارات',
      ),
    ],
  ),
  Category(
    id: 'c2',
    nameEn: 'Grocery',
    nameAr: 'بقالة',
    children: [Category(id: 'cat-pantry', nameEn: 'Pantry', nameAr: 'مؤن')],
  ),
  Category(id: 'empty', nameEn: 'Empty', nameAr: 'فارغ'),
];

Widget _host({
  String locale = 'en',
  Brightness brightness = Brightness.light,
  double scale = 1,
  DataSource dataSource = DataSource.mock,
  Widget home = const CategoriesScreen(),
  Future<List<Category>> Function()? load,
  GoRouter? router,
  EdgeInsets safeInsets = EdgeInsets.zero,
}) {
  final theme = AppTheme.fromColors(AppColors.bundled(brightness));
  Widget builder(BuildContext context, Widget? child) => MediaQuery(
    data: MediaQuery.of(
      context,
    ).copyWith(textScaler: TextScaler.linear(scale), padding: safeInsets),
    child: child!,
  );
  return ProviderScope(
    retry: (_, _) => null,
    overrides: [
      dataSourceProvider.overrideWithValue(dataSource),
      categoriesProvider.overrideWith(
        (ref) => load?.call() ?? Future.value(_tree),
      ),
    ],
    child: router == null
        ? MaterialApp(
            locale: Locale(locale),
            theme: theme,
            builder: builder,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: home,
          )
        : MaterialApp.router(
            locale: Locale(locale),
            theme: theme,
            builder: builder,
            routerConfig: router,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
          ),
  );
}

void _size(WidgetTester tester, double width) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 1000);
  addTearDown(tester.view.reset);
}

void main() {
  setUpAll(() async {
    await (FontLoader('Cairo')
          ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf')))
        .load();
  });
  for (final locale in ['ar', 'en']) {
    for (final brightness in Brightness.values) {
      testWidgets(
        'all Mock parents have a quiet description $locale $brightness',
        (tester) async {
          _size(tester, 390);
          final parents = (await tester.runAsync(
            CatalogRepositoryMock(delay: Duration.zero).fetchCategories,
          ))!;
          await tester.pumpWidget(
            _host(
              locale: locale,
              brightness: brightness,
              load: () async => parents,
            ),
          );
          await tester.pumpAndSettle();
          expect(
            find.text(locale == 'ar' ? 'الأقسام الرئيسية' : 'Main Categories'),
            findsOneWidget,
          );
          for (final parent in parents) {
            final card = find.byKey(ValueKey('cat-card-${parent.id}'));
            await tester.scrollUntilVisible(card, 150);
            await tester.pumpAndSettle();
            final context = tester.element(card);
            final description = parent.localizedDescription(locale);
            expect(description, isNotNull);
            final label = find.descendant(
              of: card,
              matching: find.text(description!),
            );
            final text = tester.widget<Text>(label);
            expect(text.maxLines, 2);
            expect(text.overflow, TextOverflow.ellipsis);
            expect(text.style!.color, context.colors.textSecondary);
            expect(
              text.style!.fontSize,
              lessThan(context.text.titleMedium!.fontSize!),
            );
            final title = find.descendant(
              of: card,
              matching: find.text(parent.localizedName(locale)),
            );
            final titleRect = tester.getRect(title);
            final descriptionRect = tester.getRect(label);
            final cardRect = tester.getRect(card);
            expect(descriptionRect.top, greaterThan(titleRect.bottom));
            expect(
              (titleRect.top + descriptionRect.bottom) / 2,
              closeTo(cardRect.center.dy, 0.01),
            );
            if (locale == 'ar') {
              expect(descriptionRect.right, closeTo(titleRect.right, 0.01));
            } else {
              expect(descriptionRect.left, closeTo(titleRect.left, 0.01));
            }
            // One name line plus two description lines still fits the old height.
            if (parent.id == 'cat-electronics') {
              expect(cardRect.height, AppLayout.categoryCardHeight);
            }
            expect(tester.takeException(), isNull);
          }
        },
      );
    }

    testWidgets('unknown and Remote categories need no description $locale', (
      tester,
    ) async {
      for (final (id, source) in [
        ('unknown', DataSource.mock),
        ('cat-electronics', DataSource.remote),
      ]) {
        await tester.pumpWidget(
          _host(
            locale: locale,
            dataSource: source,
            load: () async => [
              Category.fromJson({
                'id': id,
                'name_en': 'Category',
                'name_ar': 'قسم',
              }),
            ],
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byKey(ValueKey('cat-card-$id')), findsOneWidget);
        expect(find.byKey(ValueKey('cat-description-$id')), findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      }
    });

    for (final brightness in Brightness.values) {
      testWidgets(
        'long name and description fit responsive cards $locale $brightness',
        (tester) async {
          _size(tester, 320);
          const category = Category(
            id: 'long',
            nameEn: 'A main category with a deliberately long name',
            nameAr: 'قسم رئيسي باسم طويل لاختبار مساحة النص',
          );
          final description = List.filled(
            40,
            locale == 'ar' ? 'وصف طويل للقسم' : 'Long category description',
          ).join(' ');
          for (final width in [
            320.0,
            599.0,
            600.0,
            899.0,
            900.0,
            1199.0,
            1200.0,
            1535.0,
            1536.0,
            1920.0,
          ]) {
            tester.view.physicalSize = Size(width, 1000);
            for (final scale in [1.0, 2.0]) {
              await tester.pumpWidget(
                _host(
                  locale: locale,
                  brightness: brightness,
                  scale: scale,
                  home: Scaffold(
                    body: ListView(
                      children: [
                        CategoryCard(
                          key: const ValueKey('long-card'),
                          category: category,
                          description: description,
                          onTap: () {},
                        ),
                      ],
                    ),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              final cardRect = tester.getRect(
                find.byKey(const ValueKey('long-card')),
              );
              final image = find.byKey(const ValueKey('cat-image-long'));
              final imageRect = tester.getRect(image);
              final subtitle = find.byKey(
                const ValueKey('cat-description-long'),
              );
              final paragraph = tester.renderObject<RenderParagraph>(subtitle);
              expect(paragraph.didExceedMaxLines, isTrue);
              expect(
                tester.getRect(subtitle).bottom,
                lessThanOrEqualTo(cardRect.bottom),
              );
              expect(imageRect.height, cardRect.height);
              expect(
                imageRect.width,
                closeTo(
                  cardRect.width * AppLayout.categoryCardImageFraction,
                  0.01,
                ),
              );
              expect(
                locale == 'ar' ? imageRect.left : imageRect.right,
                locale == 'ar' ? cardRect.left : cardRect.right,
              );
              expect(tester.takeException(), isNull, reason: '$width $scale');
            }
          }
        },
      );
    }

    testWidgets(
      'full-width vertical cards, flush directional image and no browse-all $locale',
      (tester) async {
        _size(tester, 390);
        await tester.pumpWidget(
          _host(
            locale: locale,
            safeInsets: const EdgeInsets.symmetric(horizontal: 20),
          ),
        );
        await tester.pumpAndSettle();
        final first = find.byKey(const ValueKey('cat-card-c1'));
        final second = find.byKey(const ValueKey('cat-card-c2'));
        final rect = tester.getRect(first);
        final secondRect = tester.getRect(second);
        expect(rect.left, 28); // SafeArea + central 8px page padding.
        expect(rect.right, 362);
        expect(secondRect.width, rect.width);
        expect(secondRect.top, greaterThan(rect.bottom));
        expect(secondRect.height, rect.height);
        expect(rect.height, AppLayout.categoryCardHeight);
        final image = find.byKey(const ValueKey('cat-image-c1'));
        final imageRect = tester.getRect(image);
        final label = find.text(locale == 'ar' ? 'إلكترونيات' : 'Electronics');
        expect(imageRect.height, rect.height);
        expect(
          imageRect.width,
          closeTo(rect.width * AppLayout.categoryCardImageFraction, 0.01),
        );
        expect(
          tester
              .widget<CachedNetworkImage>(
                find.descendant(
                  of: image,
                  matching: find.byType(CachedNetworkImage),
                ),
              )
              .fit,
          BoxFit.cover,
        );
        final decoration =
            tester
                    .widget<DecoratedBox>(
                      find
                          .descendant(
                            of: first,
                            matching: find.byType(DecoratedBox),
                          )
                          .first,
                    )
                    .decoration
                as BoxDecoration;
        expect(decoration.boxShadow, AppShadows.level1);
        expect(decoration.border, isNull);
        expect(imageRect.top, rect.top);
        if (locale == 'ar') {
          expect(imageRect.left, rect.left);
          expect(imageRect.right, lessThan(tester.getRect(label).left));
        } else {
          expect(imageRect.right, rect.right);
          expect(imageRect.left, greaterThan(tester.getRect(label).right));
        }
        final material = tester.widget<Material>(
          find.descendant(of: first, matching: find.byType(Material)),
        );
        expect(material.borderRadius, AppRadii.lgAll);
        expect(material.clipBehavior, Clip.antiAlias);
        expect(
          find.descendant(of: image, matching: find.byType(ClipRRect)),
          findsNothing,
        );
        expect(find.text('Browse all'), findsNothing);
        expect(find.text('تصفح الكل'), findsNothing);
        expect(find.byIcon(Icons.chevron_right), findsNothing);
        expect(find.byIcon(Icons.chevron_left), findsNothing);
        expect(find.byKey(const ValueKey('cat-sub-cat-phones')), findsNothing);
        final url =
            (tester.widget<CatalogImageView>(image).image as UrlCatalogImage)
                .url;
        await tester.pumpWidget(_host(locale: locale));
        await tester.pumpAndSettle();
        expect(
          (tester.widget<CatalogImageView>(image).image as UrlCatalogImage).url,
          url,
        );
        expect(
          tester.getSize(image).width,
          closeTo(
            tester.getSize(first).width * AppLayout.categoryCardImageFraction,
            0.01,
          ),
        );
        expect(url, isNot(categoryImageUrl('c2')));
        expect(tester.takeException(), isNull);
      },
    );

    for (final brightness in Brightness.values) {
      testWidgets(
        'three borderless child tiles per phone row $locale $brightness',
        (tester) async {
          _size(tester, 390);
          await tester.pumpWidget(
            _host(
              locale: locale,
              brightness: brightness,
              home: const SubcategoriesScreen(categoryId: 'c1'),
            ),
          );
          await tester.pumpAndSettle();
          final rects = [
            for (final id in [
              'cat-phones',
              'cat-audio',
              'cat-wearables',
              'cat-accessories',
            ])
              tester.getRect(find.byKey(ValueKey('cat-sub-$id'))),
          ];
          expect(rects[0].top, rects[1].top);
          expect(rects[1].top, rects[2].top);
          expect(rects[3].top, greaterThan(rects[0].bottom));
          expect(rects[0].height, closeTo(rects[0].width, 1));
          expect(
            locale == 'ar'
                ? rects[0].left > rects[1].left
                : rects[0].left < rects[1].left,
            isTrue,
          );
          final tile = find.byKey(const ValueKey('cat-sub-cat-phones'));
          final material = tester.widget<Material>(
            find.descendant(of: tile, matching: find.byType(Material)),
          );
          final colors = tester.element(tile).colors;
          expect(material.color, colors.categoryTile);
          expect(material.shape, isNull);
          expect(material.elevation, 0);
          expect(material.borderRadius, AppRadii.mdAll);
          expect(find.byType(CachedNetworkImage), findsNothing);
          expect(find.byIcon(Icons.smartphone), findsOneWidget);
          expect(colors.categoryTile, isNot(colors.background));
          double contrast(Color foreground) {
            final a = foreground.computeLuminance();
            final b = colors.categoryTile.computeLuminance();
            return a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);
          }

          expect(contrast(colors.textPrimary), greaterThanOrEqualTo(4.5));
          expect(contrast(colors.primary), greaterThanOrEqualTo(3));
          if (brightness == Brightness.light) {
            expect(
              colors.categoryTile.computeLuminance(),
              lessThan(colors.background.computeLuminance()),
            );
          }
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      'opens only selected children, filters products and returns naturally $locale',
      (tester) async {
        _size(tester, 390);
        final router = GoRouter(
          initialLocation: AppRoutes.categories,
          routes: [
            GoRoute(
              path: AppRoutes.categories,
              builder: (_, _) => const CategoriesScreen(),
              routes: [
                GoRoute(
                  path: AppRoutes.subcategoriesSegment,
                  name: AppRoutes.subcategoriesName,
                  builder: (_, state) => SubcategoriesScreen(
                    categoryId: state.pathParameters['categoryId']!,
                  ),
                ),
              ],
            ),
            GoRoute(
              path: AppRoutes.search,
              name: AppRoutes.searchName,
              builder: (_, state) => Scaffold(
                appBar: AppBar(),
                body: Text(state.uri.queryParameters['category_id']!),
              ),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(_host(locale: locale, router: router));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('cat-card-c2')));
        await tester.pumpAndSettle();
        expect(find.text(locale == 'ar' ? 'بقالة' : 'Grocery'), findsOneWidget);
        expect(
          find.byKey(const ValueKey('cat-sub-cat-pantry')),
          findsOneWidget,
        );
        expect(find.byKey(const ValueKey('cat-sub-cat-phones')), findsNothing);
        expect(find.byType(BackButton), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('cat-sub-cat-pantry')));
        await tester.pumpAndSettle();
        expect(find.text('cat-pantry'), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('cat-card-c1')), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('cat-card-c1')));
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('cat-sub-cat-phones')),
          findsOneWidget,
        );
        expect(find.byKey(const ValueKey('cat-sub-cat-pantry')), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );

    for (final width in [
      320.0,
      599.0,
      600.0,
      899.0,
      900.0,
      1199.0,
      1200.0,
      1535.0,
      1536.0,
      1920.0,
    ]) {
      testWidgets('both category pages resize with large text $locale $width', (
        tester,
      ) async {
        _size(tester, width);
        await tester.pumpWidget(_host(locale: locale, scale: 2));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(
          _host(
            locale: locale,
            scale: 2,
            home: const SubcategoriesScreen(categoryId: 'c1'),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('cat-sub-cat-phones')),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final page in [
    const CategoriesScreen(),
    const SubcategoriesScreen(categoryId: 'c1'),
  ]) {
    testWidgets('${page.runtimeType} loading, error, retry and empty', (
      tester,
    ) async {
      _size(tester, 320);
      final request = Completer<List<Category>>();
      var attempts = 0;
      await tester.pumpWidget(
        _host(
          home: page,
          load: () => ++attempts == 1 ? request.future : Future.value([]),
        ),
      );
      await tester.pump();
      expect(find.byType(Skeleton), findsWidgets);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      request.completeError(StateError('offline'));
      await tester.pumpAndSettle();
      expect(find.byType(AppErrorView), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.byType(AppEmptyView), findsOneWidget);
      expect(attempts, 2);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('empty parent and unknown ID have a recoverable empty page', (
    tester,
  ) async {
    for (final id in ['empty', 'unknown']) {
      await tester.pumpWidget(_host(home: SubcategoriesScreen(categoryId: id)));
      await tester.pumpAndSettle();
      expect(find.byType(AppEmptyView), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('failed category artwork retains the category icon', (
    tester,
  ) async {
    await tester.pumpWidget(_host());
    await tester.pumpAndSettle();
    final image = tester.widget<CachedNetworkImage>(
      find.descendant(
        of: find.byKey(const ValueKey('cat-image-c1')),
        matching: find.byType(CachedNetworkImage),
      ),
    );
    final context = tester.element(find.byType(CategoryCard).first);
    final fallback = image.errorWidget!(
      context,
      image.imageUrl,
      StateError('image failed'),
    );
    await tester.pumpWidget(_host(home: Scaffold(body: fallback)));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.category_outlined), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test(
    'presentation icon fallback respects explicit icons and unknown categories',
    () {
      expect(categoryIconFor(null, categoryId: 'cat-phones'), Icons.smartphone);
      expect(categoryIconFor('', categoryId: 'cat-audio'), Icons.headphones);
      expect(categoryIconFor('watch', categoryId: 'cat-phones'), Icons.watch);
      expect(
        categoryIconFor(null, categoryId: 'unknown'),
        Icons.category_outlined,
      );
      expect(
        categoryIconFor('unknown', categoryId: 'cat-phones'),
        Icons.category_outlined,
      );
    },
  );
}

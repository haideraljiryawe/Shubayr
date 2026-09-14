import 'package:shubayr/features/catalog/presentation/screens/product_detail_screen.dart';
import 'package:shubayr/features/catalog/data/product_availability.dart';
import 'package:shubayr/features/catalog/data/review.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photo_view/photo_view_gallery.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/theme/app_colors.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/theme_context.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/admin/presentation/media/store_image_picker.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_providers.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_record_form.dart';
import 'package:shubayr/features/admin/presentation/widgets/category_icon_picker.dart';
import 'package:shubayr/features/admin/presentation/widgets/store_images_editor.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/category.dart';
import 'package:shubayr/features/catalog/data/category_description_limits.dart';
import 'package:shubayr/features/catalog/data/media/catalog_image.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/categories_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/subcategories_screen.dart';
import 'package:shubayr/features/catalog/presentation/widgets/category_card.dart';
import 'package:shubayr/features/catalog/presentation/widgets/category_icon_catalog.dart';
import 'package:shubayr/features/catalog/presentation/widgets/catalog_image_view.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_card.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_gallery.dart';
import 'admin_screen_test.dart' as admin;
import 'support/admin_fakes.dart';

class FakePicker extends StoreImagePicker {
  List<LocalCatalogImage> result = [];
  final calls = <bool>[];
  bool fail = false;
  @override
  Future<List<LocalCatalogImage>> pick({required bool multiple}) async {
    calls.add(multiple);
    if (fail) throw StateError('unreadable image');
    return result;
  }
}

class UnsortedCatalog extends CatalogRepositoryMock {
  UnsortedCatalog(this.nodes) : super(delay: Duration.zero);
  final List<Category> nodes;
  @override
  Future<List<Category>> fetchCategories() async => nodes;
}

Widget host(
  Widget child, {
  String locale = 'en',
  bool dark = false,
  double scale = 1,
  FakePicker? picker,
  List<Category>? nodes,
  Product? product,
}) => ProviderScope(
  overrides: [
    brandProvider.overrideWithValue(const Brand.bundled()),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    if (product != null) ...[
      productProvider(product.id).overrideWith((ref) async => product),
      availabilityProvider(product.id).overrideWith(
        (ref) async => ProductAvailability(
          productId: product.id,
          availableQty: 1,
          inStock: true,
        ),
      ),
      productReviewsProvider(
        product.id,
      ).overrideWith((ref) async => const ReviewPage()),
    ],
    if (picker != null) storeImagePickerProvider.overrideWithValue(picker),
    if (nodes != null)
      catalogRepositoryProvider.overrideWithValue(UnsortedCatalog(nodes)),
    homeBannersProvider.overrideWith((ref) async => []),
    homeOffersProvider.overrideWith((ref) async => const ProductPage()),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: AppTheme.fromColors(
      AppColors.bundled(dark ? Brightness.dark : Brightness.light),
    ),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: child,
  ),
);

void size(WidgetTester tester, double width) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, 1000);
  addTearDown(tester.view.reset);
}

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  late LocalCatalogImage photo, replacement;
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawColor(Colors.green, BlendMode.src);
    final picture = recorder.endRecording();
    final image = await picture.toImage(2, 2);
    final bytes = (await image.toByteData(
      format: ui.ImageByteFormat.png,
    ))!.buffer.asUint8List();
    photo = LocalCatalogImage(bytes, name: 'first.png');
    replacement = LocalCatalogImage(bytes, name: 'second.png');
    image.dispose();
    picture.dispose();
    await (FontLoader(
      'Cairo',
    )..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf'))).load();
  });

  test('semantic registry covers search and unknown data safely', () {
    expect(
      CategoryIconCatalog.byKey.length,
      CategoryIconCatalog.entries.length,
    );
    expect(CategoryIconCatalog.entries.length, inInclusiveRange(100, 150));
    expect(
      CategoryIconCatalog.search('سَمّاعات').map((e) => e.key),
      contains('audio_headphones'),
    );
    expect(
      CategoryIconCatalog.search('headphones').single.key,
      'audio_headphones',
    );
    expect(CategoryIconCatalog.resolve('does_not_exist'), Icons.category);
    expect(CategoryIconCatalog.resolve('audio_headphones'), Icons.headphones);
  });

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets(
        'icon search, groups, preview and selection $locale dark=$dark',
        (tester) async {
          size(tester, 390);
          String? selected;
          await tester.pumpWidget(
            host(
              Scaffold(
                body: Builder(
                  builder: (context) => TextButton(
                    onPressed: () async {
                      selected = await showDialog<String>(
                        context: context,
                        builder: (_) =>
                            const CategoryIconPicker(selected: 'unknown'),
                      );
                    },
                    child: const Text('open'),
                  ),
                ),
              ),
              locale: locale,
              dark: dark,
            ),
          );
          await tap(tester, find.text('open'));
          expect(find.byIcon(Icons.category), findsWidgets);
          // Builder only instantiates the visible rows and its cache.
          expect(
            find.byType(InkWell).evaluate().length,
            lessThan(CategoryIconCatalog.entries.length),
          );
          await tester.enterText(
            find.byKey(const ValueKey('icon-search')),
            locale == 'ar' ? 'سماعات' : 'headphones',
          );
          await tester.pumpAndSettle();
          await tap(
            tester,
            find.byKey(const ValueKey('icon-audio_headphones')),
          );
          expect(find.byIcon(Icons.check), findsOneWidget);
          await tester.enterText(find.byKey(const ValueKey('icon-search')), '');
          await tap(tester, find.byKey(const ValueKey('icon-group')));
          await tap(
            tester,
            find.text(locale == 'ar' ? 'هواتف' : 'Phones').last,
          );
          expect(
            find.byKey(const ValueKey('icon-mobile_phone')),
            findsOneWidget,
          );
          expect(
            find.byKey(const ValueKey('icon-audio_headphones')),
            findsNothing,
          );
          await tap(tester, find.byKey(const ValueKey('icon-mobile_phone')));
          await tap(
            tester,
            find.widgetWithText(FilledButton, locale == 'ar' ? 'حفظ' : 'Save'),
          );
          expect(selected, 'mobile_phone');
          expect(tester.takeException(), isNull);
        },
      );

      testWidgets(
        'media add replace reorder remove cancel and failure $locale dark=$dark',
        (tester) async {
          size(tester, 390);
          final picker = FakePicker()..result = [photo, replacement];
          List<CatalogImage> images = [];
          await tester.pumpWidget(
            host(
              Scaffold(
                body: SingleChildScrollView(
                  child: StatefulBuilder(
                    builder: (context, setState) => StoreImagesEditor(
                      images: images,
                      multiple: true,
                      onChanged: (value) => setState(() => images = value),
                    ),
                  ),
                ),
              ),
              picker: picker,
              locale: locale,
              dark: dark,
            ),
          );
          await tap(tester, find.byKey(const ValueKey('media-add')));
          expect(picker.calls, [true]);
          expect(images, [photo, replacement]);
          await tap(tester, find.byKey(const ValueKey('media-later-0')));
          expect(images, [replacement, photo]);
          picker.result = [replacement];
          await tap(tester, find.byKey(const ValueKey('media-replace-1')));
          expect(picker.calls.last, isFalse);
          expect(images, [replacement, replacement]);
          picker.result = [];
          await tap(tester, find.byKey(const ValueKey('media-replace-0')));
          expect(images, [replacement, replacement]);
          picker.fail = true;
          await tap(tester, find.byKey(const ValueKey('media-replace-0')));
          expect(images, [replacement, replacement]);
          await tap(tester, find.byKey(const ValueKey('media-remove-1')));
          await tap(tester, find.byKey(const ValueKey('confirm-remove-image')));
          await tap(tester, find.byKey(const ValueKey('media-remove-0')));
          await tap(tester, find.byKey(const ValueKey('confirm-remove-image')));
          expect(images, isEmpty);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  for (final parent in [false, true]) {
    testWidgets(
      'category form persists icon and single image with required parent descriptions parent=$parent',
      (tester) async {
        size(tester, 900);
        final repo = RecordingAdmin();
        final picker = FakePicker()..result = [photo];
        final initial = AdminRecord({
          'id': 'media-category',
          'name_en': 'Example',
          'name_ar': 'مثال',
          if (!parent) 'parent_id': 'cat-electronics',
          'sort_order': 0,
          'is_active': true,
        });
        repo.onSave = (_, input, id) async =>
            AdminRecord({...input, 'id': id!});
        await tester.pumpWidget(
          admin.host(
            repo,
            picker: picker,
            child: AdminRecordForm(
              query: const AdminQuery(AdminResource.categories),
              record: initial,
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (parent) {
          await admin.save(tester);
          expect(repo.writes, isEmpty);
          await tester.enterText(
            find.byKey(const ValueKey('mock_description_en')),
            'a b c d e f g',
          );
          await tester.enterText(
            find.byKey(const ValueKey('mock_description_ar')),
            'احتياجات يومية',
          );
          await admin.save(tester);
          expect(repo.writes, isEmpty);
          await tester.enterText(
            find.byKey(const ValueKey('mock_description_en')),
            'x' * 37,
          );
          await admin.save(tester);
          expect(repo.writes, isEmpty);
          await tester.enterText(
            find.byKey(const ValueKey('mock_description_en')),
            'Everyday essentials',
          );
        } else {
          expect(
            find.byKey(const ValueKey('mock_description_en')),
            findsNothing,
          );
        }
        await tap(tester, find.byKey(const ValueKey('category-icon-picker')));
        await tester.enterText(
          find.byKey(const ValueKey('icon-search')),
          'headphones',
        );
        await tester.pumpAndSettle();
        await tap(tester, find.byKey(const ValueKey('icon-audio_headphones')));
        await tap(tester, find.widgetWithText(FilledButton, 'Save'));
        await tap(tester, find.byKey(const ValueKey('media-add')));
        expect(picker.calls, [false]);
        picker.result = [replacement];
        await tap(tester, find.byKey(const ValueKey('media-replace-0')));
        await tap(tester, find.byKey(const ValueKey('media-remove-0')));
        await tap(tester, find.byKey(const ValueKey('confirm-remove-image')));
        await tap(tester, find.byKey(const ValueKey('media-add')));
        await admin.save(tester);
        expect(repo.writes.single.input['mock_image'], same(replacement));
        expect(repo.writes.single.input['mock_icon_key'], 'audio_headphones');
        expect(repo.writes.single.input['mock_image_managed'], isTrue);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'product form uses media workflow and retains ordered selection after failed save',
    (tester) async {
      size(tester, 900);
      final repo = RecordingAdmin();
      final picker = FakePicker()..result = [photo, replacement];
      final initial = AdminRecord({
        'id': 'media-product',
        'category_id': 'cat-electronics',
        'name_en': 'Product',
        'name_ar': 'منتج',
        'sale_price': 10,
        'images': <String>[],
      });
      var fail = true;
      repo.onSave = (_, input, id) async {
        if (fail) throw StateError('temporary save failure');
        return AdminRecord({...input, 'id': id!});
      };
      await tester.pumpWidget(
        admin.host(
          repo,
          picker: picker,
          child: AdminRecordForm(
            query: const AdminQuery(AdminResource.products),
            record: initial,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('images')), findsNothing);
      await tap(tester, find.byKey(const ValueKey('media-add')));
      await tap(tester, find.byKey(const ValueKey('media-later-0')));
      await admin.save(tester);
      expect(repo.writes.single.input['mock_images'], [replacement, photo]);
      expect(find.byType(AdminRecordForm), findsOneWidget);
      fail = false;
      await admin.save(tester);
      expect(repo.writes.last.input['mock_images'], [replacement, photo]);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'customer surfaces use keys, effective visibility, order and independent category photos',
    (tester) async {
      size(tester, 900);
      final nodes = [
        Category(
          id: 'late',
          nameEn: 'Late',
          nameAr: 'متأخر',
          sortOrder: 10,
          iconKey: 'home_furniture',
        ),
        Category(
          id: 'hidden',
          nameEn: 'Hidden',
          nameAr: 'مخفي',
          isActive: false,
          children: [
            Category(
              id: 'hidden-child',
              nameEn: 'Hidden child',
              nameAr: 'فرعي',
            ),
          ],
        ),
        Category(
          id: 'first',
          nameEn: 'First',
          nameAr: 'أول',
          sortOrder: -10,
          iconKey: 'audio_headphones',
          image: photo,
          imageManaged: true,
          shortDescriptionEn: 'Everyday essentials',
          children: [
            Category(
              id: 'child-late',
              nameEn: 'Child late',
              nameAr: 'فرعي',
              sortOrder: 3,
              iconKey: 'mobile_phone',
            ),
            Category(
              id: 'child-hidden',
              nameEn: 'Child hidden',
              nameAr: 'مخفي',
              isActive: false,
            ),
            Category(
              id: 'child-first',
              nameEn: 'Child first',
              nameAr: 'أول',
              sortOrder: -1,
              iconKey: 'audio_headphones',
            ),
          ],
        ),
      ];
      await tester.pumpWidget(host(const HomeScreen(), nodes: nodes));
      await tester.pumpAndSettle();
      final shortcuts = find.byWidgetPredicate(
        (w) =>
            w is SizedBox &&
            w.key is ValueKey<String> &&
            (w.key as ValueKey<String>).value.startsWith('home-category-'),
      );
      expect(tester.widgetList(shortcuts).map((w) => w.key), [
        const ValueKey('home-category-first'),
        const ValueKey('home-category-late'),
      ]);
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('home-category-first')),
          matching: find.byIcon(Icons.headphones),
        ),
        findsOneWidget,
      );
      expect(find.byType(CatalogImageView), findsNothing);
      await tester.pumpWidget(host(const CategoriesScreen(), nodes: nodes));
      await tester.pumpAndSettle();
      expect(
        tester
            .widgetList<CategoryCard>(find.byType(CategoryCard))
            .map((c) => c.category.id),
        ['first', 'late'],
      );
      final view = tester.widget<CatalogImageView>(
        find.byKey(const ValueKey('cat-image-first')),
      );
      expect(view.image, same(photo));
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('cat-image-first')),
          matching: find.byType(Image),
        ),
        findsOneWidget,
      );
      await tester.pumpWidget(
        host(const SubcategoriesScreen(categoryId: 'first'), nodes: nodes),
      );
      await tester.pumpAndSettle();
      expect(find.text('Child hidden'), findsNothing);
      final first = find.byKey(const ValueKey('cat-sub-child-first'));
      expect(
        find.descendant(of: first, matching: find.byIcon(Icons.headphones)),
        findsOneWidget,
      );
      expect(find.byType(CatalogImageView), findsNothing);
      expect(
        tester.getTopLeft(first).dx,
        lessThan(
          tester
              .getTopLeft(find.byKey(const ValueKey('cat-sub-child-late')))
              .dx,
        ),
      );
      await tester.pumpWidget(
        host(const SubcategoriesScreen(categoryId: 'hidden'), nodes: nodes),
      );
      await tester.pumpAndSettle();
      expect(find.text('Hidden child'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'local product photo reaches card carousel and full screen zoom',
    (tester) async {
      size(tester, 390);
      final product = Product(
        id: 'local',
        categoryId: 'c',
        nameEn: 'Local',
        nameAr: 'محلي',
        mockImages: [photo, replacement],
      );
      await tester.pumpWidget(
        host(
          Scaffold(
            body: SizedBox(width: 250, child: ProductCard(product: product)),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<CatalogImageView>(find.byType(CatalogImageView)).image,
        same(photo),
      );
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(
        host(const ProductDetailScreen(productId: 'local'), product: product),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<ProductGallery>(find.byType(ProductGallery)).media,
        product.mockImages,
      );
      await tap(tester, find.byType(CatalogImageView).first);
      expect(find.byType(PhotoViewGallery), findsOneWidget);
      expect(find.text('1 of 2'), findsOneWidget);
      await tester.drag(find.byType(PhotoViewGallery), const Offset(-350, 0));
      await tester.pumpAndSettle();
      expect(find.text('2 of 2'), findsOneWidget);
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
    for (final locale in ['en', 'ar']) {
      testWidgets('new controls resize with larger text $width $locale', (
        tester,
      ) async {
        size(tester, width);
        await tester.pumpWidget(
          host(
            const CategoryIconPicker(selected: 'audio_headphones'),
            locale: locale,
            dark: true,
            scale: 1.5,
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(
          host(
            Scaffold(
              body: SingleChildScrollView(
                child: StoreImagesEditor(
                  images: [photo, replacement],
                  multiple: true,
                  onChanged: (_) {},
                ),
              ),
            ),
            locale: locale,
            dark: true,
            scale: 1.5,
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets(
    'description limits fit representative Arabic and English copy on narrow phones',
    (tester) async {
      size(tester, 320);
      late BuildContext context;
      await tester.pumpWidget(
        host(
          Scaffold(
            body: Builder(
              builder: (c) {
                context = c;
                return const SizedBox();
              },
            ),
          ),
        ),
      );
      final width =
          (320 - AppLayout.pageHorizontal(context) * 2) *
              (1 - AppLayout.categoryCardImageFraction) -
          AppSpacing.lg * 2;
      for (final text in [
        'Kitchen and home essentials',
        'Skin, hair and personal care',
        'احتياجات المنزل والمطبخ',
        'عناية بالبشرة والشعر',
      ]) {
        expect(CategoryDescriptionLimits.isValid(text), isTrue);
        final painter = TextPainter(
          text: TextSpan(text: text, style: context.text.bodySmall),
          textDirection: TextDirection.rtl,
        )..layout(maxWidth: width);
        expect(
          painter.computeLineMetrics().length,
          lessThanOrEqualTo(2),
          reason: text,
        );
        painter.dispose();
      }
    },
  );
}

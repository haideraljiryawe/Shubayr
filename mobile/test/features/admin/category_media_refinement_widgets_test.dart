import 'dart:ui' as ui;
import 'dart:async';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/core/widgets/state_views.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/widgets/app_card.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_providers.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_record_form.dart';
import 'package:shubayr/features/admin/presentation/widgets/admin_category_hierarchy.dart';
import 'package:shubayr/features/admin/presentation/widgets/admin_product_scope.dart';
import 'package:shubayr/features/admin/presentation/widgets/store_images_editor.dart';
import 'package:shubayr/features/catalog/data/media/catalog_image.dart';
import 'package:shubayr/features/catalog/presentation/widgets/catalog_image_view.dart';
import 'admin_screen_test.dart' as admin;
import 'category_media_repository_test.dart' show category;
import 'category_media_widgets_test.dart' as media;
import 'support/admin_fakes.dart';

Future<({AdminRecord root, AdminRecord child, AdminRecord other})> seed(
  RecordingAdmin repo,
) async {
  final root = await repo.save(AdminResource.categories, {
    ...category('Main', order: -100),
    'name_ar': 'رئيسي',
  });
  final child = await repo.save(AdminResource.categories, {
    ...category('Child', parent: root.id, order: -5),
    'name_ar': 'فرعي',
  });
  final other = await repo.save(AdminResource.categories, {
    ...category('Other', order: -90),
    'name_ar': 'آخر',
  });
  for (final (name, id) in [
    ('Needle direct', root.id),
    ('Needle child', child.id),
    ('Needle outside', other.id),
  ]) {
    await repo.save(AdminResource.products, {
      'category_id': id,
      'name_en': name,
      'name_ar': name,
      'sale_price': 1,
    });
  }
  repo.writes.clear();
  return (root: root, child: child, other: other);
}

Future<({AdminRecord root, AdminRecord child, AdminRecord other})> seedForTest(
  WidgetTester tester,
  RecordingAdmin repo,
) async {
  var complete = false;
  final future = seed(repo)..then((_) => complete = true);
  for (var i = 0; !complete && i < 1000; i++) {
    await tester.pump(const Duration(milliseconds: 1));
  }
  expect(
    complete,
    isTrue,
    reason: 'Mock seed must complete before mounting the screen',
  );
  return future;
}

Finder scopeField(bool child) => find.descendant(
  of: find.byWidgetPredicate(
    (w) => w is AdminProductScopeField && w.subcategory == child,
  ),
  matching: find.byType(DropdownButtonFormField<String>),
);
Future<void> selectScope(WidgetTester tester, bool child, String label) async {
  await media.tap(tester, scopeField(child));
  await media.tap(tester, find.text(label).last);
}

void main() {
  late LocalCatalogImage first, second;
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawColor(Colors.green, BlendMode.src);
    final picture = recorder.endRecording();
    final image = await picture.toImage(2, 2);
    final bytes = (await image.toByteData(
      format: ui.ImageByteFormat.png,
    ))!.buffer.asUint8List();
    first = LocalCatalogImage(bytes, name: 'one.png');
    second = LocalCatalogImage(bytes, name: 'two.png');
    image.dispose();
    picture.dispose();
  });

  for (final locale in ['ar', 'en']) {
    testWidgets(
      'primary selection, cancel removal and confirmed fallback $locale',
      (tester) async {
        media.size(tester, 390);
        List<CatalogImage> images = [first, second];
        await tester.pumpWidget(
          media.host(
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
            locale: locale,
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('media-primary')), findsOneWidget);
        await media.tap(tester, find.byKey(const ValueKey('media-primary-1')));
        expect(images, [second, first]);
        expect(
          tester
              .widget<CatalogImageView>(find.byType(CatalogImageView).first)
              .image,
          same(second),
        );
        await media.tap(tester, find.byKey(const ValueKey('media-remove-0')));
        expect(images, [second, first]);
        await media.tap(
          tester,
          find.widgetWithText(TextButton, locale == 'ar' ? 'إلغاء' : 'Cancel'),
        );
        expect(images, [second, first]);
        await media.tap(tester, find.byKey(const ValueKey('media-remove-0')));
        await media.tap(
          tester,
          find.byKey(const ValueKey('confirm-remove-image')),
        );
        expect(images, [first]);
        expect(find.byKey(const ValueKey('media-primary')), findsOneWidget);
        await media.tap(tester, find.byKey(const ValueKey('media-remove-0')));
        await media.tap(
          tester,
          find.byKey(const ValueKey('confirm-remove-image')),
        );
        expect(images, isEmpty);
        expect(find.byKey(const ValueKey('media-primary')), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final child in [false, true]) {
    testWidgets(
      'single ${child ? 'sub' : 'main'} category removal is draft-only and cancellable',
      (tester) async {
        media.size(tester, 900);
        final repo = RecordingAdmin();
        final initial = AdminRecord({
          'id': 'edit',
          ...category('Edit', parent: child ? 'cat-electronics' : null),
          'mock_image': first,
        });
        repo.onSave = (_, input, id) async =>
            AdminRecord({...input, 'id': id!});
        await tester.pumpWidget(
          admin.host(
            repo,
            child: AdminRecordForm(
              query: const AdminQuery(AdminResource.categories),
              record: initial,
            ),
          ),
        );
        await tester.pumpAndSettle();
        await media.tap(tester, find.byKey(const ValueKey('media-remove-0')));
        expect(find.text('Remove this image?'), findsOneWidget);
        expect(repo.deletes, isEmpty);
        await media.tap(tester, find.widgetWithText(TextButton, 'Cancel'));
        expect(
          tester
              .widget<StoreImagesEditor>(find.byType(StoreImagesEditor))
              .images
              .single,
          same(first),
        );
        await media.tap(tester, find.byKey(const ValueKey('media-remove-0')));
        await media.tap(
          tester,
          find.byKey(const ValueKey('confirm-remove-image')),
        );
        expect(repo.writes, isEmpty);
        expect(
          tester
              .widget<StoreImagesEditor>(find.byType(StoreImagesEditor))
              .images,
          isEmpty,
        );
        await admin.save(tester);
        expect(repo.writes.single.input['mock_image'], isNull);
        expect(repo.writes.single.id, 'edit');
        expect(repo.deletes, isEmpty);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'main creation and contextual subcategory creation reuse one form with explicit parent',
    (tester) async {
      media.size(tester, 390);
      final repo = RecordingAdmin();
      final records = await seedForTest(tester, repo);
      await tester.pumpWidget(
        admin.host(repo, resource: AdminResource.categories),
      );
      await tester.pumpAndSettle();
      await media.tap(
        tester,
        find.widgetWithText(FloatingActionButton, 'Add main category'),
      );
      expect(find.text('Add main category'), findsOneWidget);
      expect(find.text('No parent'), findsNothing);
      expect(
        find.byKey(const ValueKey('category-create-parent')),
        findsNothing,
      );
      await tester.enterText(
        find.byKey(const ValueKey('name_en')),
        'Created main',
      );
      await tester.enterText(find.byKey(const ValueKey('name_ar')), 'قسم');
      await tester.enterText(
        find.byKey(const ValueKey('mock_description_en')),
        'Everyday essentials',
      );
      await tester.enterText(
        find.byKey(const ValueKey('mock_description_ar')),
        'احتياجات يومية',
      );
      await admin.save(tester);
      expect(repo.writes.last.input['parent_id'], isNull);
      await media.tap(
        tester,
        find.byKey(ValueKey('admin-category-open-${records.root.id}')),
      );
      expect(
        find.byKey(ValueKey('admin-category-${records.other.id}')),
        findsNothing,
      );
      expect(
        find.byKey(ValueKey('admin-category-${records.child.id}')),
        findsOneWidget,
      );
      expect(find.text('Display order: -100'), findsOneWidget);
      expect(find.text('Display order: -5'), findsOneWidget);
      await media.tap(
        tester,
        find.byKey(const ValueKey('admin-add-subcategory')),
      );
      expect(find.text('Add subcategory'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('category-create-parent')),
        findsOneWidget,
      );
      expect(find.text('No parent'), findsNothing);
      expect(find.byKey(const ValueKey('mock_description_en')), findsNothing);
      await tester.enterText(
        find.byKey(const ValueKey('name_en')),
        'Created child',
      );
      await tester.enterText(find.byKey(const ValueKey('name_ar')), 'فرعي');
      await admin.save(tester);
      expect(repo.writes.last.input['parent_id'], records.root.id);
      expect(find.text('Created child'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  for (final locale in ['ar', 'en']) {
    testWidgets(
      'scoped product search, global search, create default and delete refresh $locale',
      (tester) async {
        media.size(tester, 900);
        final repo = RecordingAdmin();
        final records = await seedForTest(tester, repo);
        await tester.pumpWidget(
          admin.host(repo, resource: AdminResource.products, locale: locale),
        );
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField).first, 'Needle');
        await tester.pumpAndSettle(const Duration(milliseconds: 350));
        expect(find.text('Needle outside'), findsOneWidget);
        await selectScope(tester, false, locale == 'en' ? 'Main' : 'رئيسي');
        expect(find.text('Needle outside'), findsNothing);
        expect(find.text('Needle direct'), findsOneWidget);
        await selectScope(tester, true, locale == 'en' ? 'Child' : 'فرعي');
        expect(find.text('Needle direct'), findsNothing);
        expect(find.text('Needle child'), findsOneWidget);
        final scoped = repo.requests.lastWhere(
          (r) => r.resource == AdminResource.products,
        );
        expect(scoped.query, 'Needle');
        expect(scoped.categoryId, records.child.id);
        expect(
          tester
              .widget<Text>(find.byKey(const ValueKey('admin-product-scope')))
              .data,
          contains(' / '),
        );
        final add = find.text(locale == 'en' ? 'Add' : 'إضافة').first;
        await media.tap(tester, add);
        expect(
          find.byKey(ValueKey('category_id-${records.child.id}')),
          findsOneWidget,
        );
        await media.tap(tester, find.byType(BackButton));
        final card = find.widgetWithText(AppCard, 'Needle child');
        await media.tap(
          tester,
          find.descendant(
            of: card,
            matching: find.byIcon(Icons.delete_outline),
          ),
        );
        await media.tap(
          tester,
          find.descendant(
            of: find.byType(AlertDialog),
            matching: find.text(locale == 'en' ? 'Delete' : 'حذف'),
          ),
        );
        expect(find.text('Needle child'), findsNothing);
        expect(repo.deletes, hasLength(1));
        await media.tap(
          tester,
          find.byKey(const ValueKey('admin-search-all-products')),
        );
        expect(find.text('Needle outside'), findsOneWidget);
        expect(find.text('Needle direct'), findsOneWidget);
        expect(find.text('Needle child'), findsNothing);
        final all = repo.requests.lastWhere(
          (r) => r.resource == AdminResource.products,
        );
        expect(all.categoryId, isNull);
        expect(all.query, 'Needle');
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final width in [320.0, 1920.0]) {
    testWidgets(
      'category loading error and empty retry remain usable at $width',
      (tester) async {
        media.size(tester, width);
        final pending = Completer<AdminPage>();
        final repo = RecordingAdmin()..onFetch = (_) => pending.future;
        await tester.pumpWidget(
          admin.host(
            repo,
            resource: AdminResource.categories,
            locale: 'ar',
            dark: true,
            scale: 1.4,
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.byType(AdminCategoryHierarchySkeleton), findsOneWidget);
        expect(tester.takeException(), isNull);
        pending.completeError(const AppFailure.network());
        await tester.pumpAndSettle();
        expect(find.byType(AppErrorView), findsOneWidget);
        repo.onFetch = (_) async =>
            const AdminPage(items: [], page: 1, perPage: 20, total: 0);
        await media.tap(
          tester,
          find.descendant(
            of: find.byType(AppErrorView),
            matching: find.byType(AppButton),
          ),
        );
        expect(find.byType(AppEmptyView), findsWidgets);
        expect(find.text('إضافة قسم رئيسي'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

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
    for (final locale in ['ar', 'en']) {
      testWidgets(
        'hierarchy and product scope fit $width $locale at larger text',
        (tester) async {
          media.size(tester, width);
          final records = [
            AdminRecord({'id': 'main', ...category('Main category', order: 1)}),
            AdminRecord({
              'id': 'child',
              ...category('Subcategory', parent: 'main', order: 2),
            }),
            AdminRecord({
              'id': 'other',
              ...category('Other category', order: 3),
            }),
          ];
          String? selected;
          await tester.pumpWidget(
            media.host(
              Scaffold(
                body: StatefulBuilder(
                  builder: (context, setState) => AdminCategoryHierarchy(
                    records: records,
                    selectedId: selected,
                    onSelected: (value) => setState(() => selected = value),
                    onRefresh: () async {},
                    onEdit: (_) {},
                    onDelete: (_) {},
                    onAddChild: (_) {},
                  ),
                ),
              ),
              locale: locale,
              scale: 1.4,
              dark: true,
            ),
          );
          await tester.pumpAndSettle();
          expect(
            find.byKey(const ValueKey('admin-category-child')),
            findsNothing,
          );
          await media.tap(
            tester,
            find.byKey(const ValueKey('admin-category-open-main')),
          );
          expect(
            find.byKey(const ValueKey('admin-category-child')),
            findsOneWidget,
          );
          expect(
            find.byKey(const ValueKey('admin-category-order-child')),
            findsOneWidget,
          );
          expect(
            find.byKey(const ValueKey('admin-category-main')),
            findsNothing,
          );
          final selectedCard = tester.getRect(
            find.byKey(const ValueKey('admin-category-selected-main')),
          );
          expect(selectedCard.width, lessThanOrEqualTo(AppLayout.readingWidth));
          final inset = AppLayout.pageHorizontal(
            tester.element(find.byType(AdminCategoryHierarchy)),
          );
          expect(
            locale == 'ar' ? width - selectedCard.right : selectedCard.left,
            closeTo(inset, 0.01),
          );
          if (width < AppLayout.compactWidth) {
            expect(selectedCard.width, closeTo(width - inset * 2, 0.01));
          }
          await media.tap(
            tester,
            find.byKey(const ValueKey('admin-category-back')),
          );
          expect(
            find.byKey(const ValueKey('admin-category-child')),
            findsNothing,
          );
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
          final repo = RecordingAdmin();
          await seedForTest(tester, repo);
          await tester.pumpWidget(
            admin.host(
              repo,
              resource: AdminResource.products,
              locale: locale,
              scale: 1.4,
              dark: true,
            ),
          );
          await tester.pumpAndSettle();
          expect(find.byType(AdminProductScopeField), findsNWidgets(2));
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}

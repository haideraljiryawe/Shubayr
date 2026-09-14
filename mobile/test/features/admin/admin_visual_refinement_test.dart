import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/core/widgets/app_card.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_providers.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_record_form.dart';
import 'package:shubayr/features/admin/presentation/widgets/admin_category_hierarchy.dart';
import 'admin_screen_test.dart' as admin;
import 'category_media_widgets_test.dart' as media;
import 'support/admin_fakes.dart';

final categories = [
  AdminRecord({
    'id': 'main',
    'name_en': 'Electronics',
    'name_ar': 'إلكترونيات',
    'mock_description_en': 'Daily essentials',
    'mock_description_ar': 'احتياجات يومية',
    'sort_order': 1,
  }),
  AdminRecord({
    'id': 'phones',
    'parent_id': 'main',
    'name_en': 'Phones',
    'name_ar': 'هواتف',
  }),
  AdminRecord({
    'id': 'audio',
    'parent_id': 'main',
    'name_en': 'Audio',
    'name_ar': 'صوتيات',
  }),
  AdminRecord({
    'id': 'other',
    'name_en': 'Clothes',
    'name_ar': 'ملابس',
    'sort_order': 2,
  }),
  AdminRecord({
    'id': 'men',
    'parent_id': 'other',
    'name_en': 'Men',
    'name_ar': 'رجالي',
  }),
];
RecordingAdmin repository() {
  final repo = RecordingAdmin();
  repo.onFetch = (q) async => AdminPage(
    items: q.resource == AdminResource.categories ? categories : [],
    page: 1,
    perPage: 20,
    total: q.resource == AdminResource.categories ? categories.length : 0,
  );
  repo.onSave = (_, input, id) async =>
      AdminRecord({...input, 'id': id ?? 'new'});
  return repo;
}

DropdownButton<String> productPicker(WidgetTester tester) =>
    tester.widget<DropdownButton<String>>(
      find.descendant(
        of: categoryField(),
        matching: find.byType(DropdownButton<String>),
      ),
    );
AdminRecord product(String category) => AdminRecord({
  'id': 'product',
  'category_id': category,
  'name_en': 'Product',
  'name_ar': 'منتج',
  'sale_price': 1,
  'images': <String>[],
});
Finder categoryField() => find.byWidgetPredicate(
  (w) =>
      w is DropdownButtonFormField<String> &&
      w.key.toString().contains('category_id-'),
);
Finder parentField() => find.byWidgetPredicate(
  (w) =>
      w is DropdownButtonFormField<String> &&
      w.key.toString().contains('parent_id-'),
);
Future<void> save(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await media.tap(tester, find.byType(AppButton).last);
}

void main() {
  for (final locale in ['ar', 'en']) {
    for (final edit in [false, true]) {
      testWidgets(
        'product picker offers only subcategory paths $locale edit=$edit',
        (tester) async {
          media.size(tester, 390);
          final repo = repository();
          await tester.pumpWidget(
            admin.host(
              repo,
              locale: locale,
              child: AdminRecordForm(
                query: const AdminQuery(
                  AdminResource.products,
                  categoryId: 'main',
                ),
                record: edit ? product('phones') : null,
              ),
            ),
          );
          await tester.pumpAndSettle();
          final picker = productPicker(tester);
          expect(picker.items!.map((i) => i.value), ['phones', 'audio', 'men']);
          expect(picker.items!.every((i) => i.enabled), isTrue);
          expect(
            picker.items!.map((i) => (i.child as Text).data),
            locale == 'ar'
                ? ['إلكترونيات / هواتف', 'إلكترونيات / صوتيات', 'ملابس / رجالي']
                : [
                    'Electronics / Phones',
                    'Electronics / Audio',
                    'Clothes / Men',
                  ],
          );
          expect(
            tester.state<FormFieldState<String>>(categoryField()).value,
            edit ? 'phones' : null,
          );
          if (!edit) {
            await tester.enterText(
              find.byKey(const ValueKey('name_en')),
              'New product',
            );
            await tester.enterText(
              find.byKey(const ValueKey('name_ar')),
              'منتج',
            );
            await tester.enterText(
              find.byKey(const ValueKey('sale_price')),
              '1',
            );
            await save(tester);
            expect(
              repo.writes,
              isEmpty,
            ); // Root scope must not become an assignment.
          }
          await media.tap(tester, categoryField());
          await media.tap(
            tester,
            find
                .text(
                  locale == 'ar'
                      ? 'إلكترونيات / صوتيات'
                      : 'Electronics / Audio',
                )
                .last,
          );
          await save(tester);
          expect(repo.writes.single.input['category_id'], 'audio');
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      'legacy root assignment is retained but cannot be newly selected $locale',
      (tester) async {
        media.size(tester, 390);
        final repo = repository();
        await tester.pumpWidget(
          admin.host(
            repo,
            locale: locale,
            child: AdminRecordForm(
              query: const AdminQuery(AdminResource.products),
              record: product('main'),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final picker = productPicker(tester);
        expect(picker.items!.where((i) => i.enabled).map((i) => i.value), [
          'phones',
          'audio',
          'men',
        ]);
        expect(
          picker.items!.singleWhere((i) => i.value == 'main').enabled,
          isFalse,
        );
        expect(
          tester
              .widget<DropdownButtonFormField<String>>(categoryField())
              .decoration
              .helperText,
          isNotEmpty,
        );
        expect(
          tester.state<FormFieldState<String>>(categoryField()).value,
          'main',
        );
        await save(tester);
        expect(repo.writes.single.input['category_id'], 'main');
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpWidget(
          admin.host(
            repo,
            locale: locale,
            child: AdminRecordForm(
              query: const AdminQuery(AdminResource.products),
              record: product('main'),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await media.tap(tester, categoryField());
        await media.tap(
          tester,
          find
              .text(
                locale == 'ar' ? 'إلكترونيات / هواتف' : 'Electronics / Phones',
              )
              .last,
        );
        expect(
          productPicker(tester).items!.map((i) => i.value),
          isNot(contains('main')),
        );
        await save(tester);
        expect(repo.writes.last.input['category_id'], 'phones');
        expect(tester.takeException(), isNull);
      },
    );

    for (final edit in [false, true]) {
      testWidgets('main category has no parent field $locale edit=$edit', (
        tester,
      ) async {
        media.size(tester, 390);
        final repo = repository();
        await tester.pumpWidget(
          admin.host(
            repo,
            locale: locale,
            child: AdminRecordForm(
              query: const AdminQuery(AdminResource.categories),
              record: edit ? categories.first : null,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(parentField(), findsNothing);
        expect(find.byKey(const ValueKey('layout-parent_id')), findsNothing);
        if (!edit) {
          for (final entry in {
            'name_en': 'Main',
            'name_ar': 'رئيسي',
            'mock_description_en': 'Daily essentials',
            'mock_description_ar': 'احتياجات يومية',
          }.entries) {
            await tester.enterText(
              find.byKey(ValueKey(entry.key)),
              entry.value,
            );
          }
        }
        await save(tester);
        expect(repo.writes.single.input['parent_id'], isNull);
        expect(tester.takeException(), isNull);
      });
      testWidgets('subcategory keeps its parent $locale edit=$edit', (
        tester,
      ) async {
        media.size(tester, 390);
        final repo = repository();
        await tester.pumpWidget(
          admin.host(
            repo,
            locale: locale,
            child: AdminRecordForm(
              query: const AdminQuery(AdminResource.categories),
              record: edit ? categories[1] : null,
              categoryParent: edit ? null : categories.first,
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (edit) {
          expect(
            tester.state<FormFieldState<String>>(parentField()).value,
            'main',
          );
        } else {
          expect(parentField(), findsNothing);
          expect(
            find.byKey(const ValueKey('category-create-parent')),
            findsOneWidget,
          );
          await tester.enterText(
            find.byKey(const ValueKey('name_en')),
            'Child',
          );
          await tester.enterText(find.byKey(const ValueKey('name_ar')), 'فرعي');
        }
        await save(tester);
        expect(repo.writes.single.input['parent_id'], 'main');
        expect(tester.takeException(), isNull);
      });
    }

    for (final width in [390.0, 1280.0]) {
      testWidgets(
        'only explicit view action opens branches $locale width=$width',
        (tester) async {
          media.size(tester, width);
          String? selected;
          var edits = 0, deletes = 0;
          await tester.pumpWidget(
            media.host(
              Scaffold(
                body: StatefulBuilder(
                  builder: (context, setState) => AdminCategoryHierarchy(
                    records: categories,
                    selectedId: selected,
                    onSelected: (id) => setState(() => selected = id),
                    onRefresh: () async {},
                    onEdit: (_) => edits++,
                    onDelete: (_) => deletes++,
                  ),
                ),
              ),
              locale: locale,
              dark: true,
            ),
          );
          await tester.pumpAndSettle();
          final root = find.byKey(const ValueKey('admin-category-main'));
          expect(tester.widget<AppCard>(root).onTap, isNull);
          await tester.tap(
            find.descendant(
              of: root,
              matching: find.text(
                locale == 'ar' ? 'إلكترونيات' : 'Electronics',
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(selected, isNull);
          expect(
            find.byKey(const ValueKey('admin-category-phones')),
            findsNothing,
          );
          await media.tap(
            tester,
            find.descendant(
              of: root,
              matching: find.byIcon(Icons.edit_outlined),
            ),
          );
          await media.tap(
            tester,
            find.descendant(
              of: root,
              matching: find.byIcon(Icons.delete_outline),
            ),
          );
          expect(edits, 1);
          expect(deletes, 1);
          expect(selected, isNull);
          await media.tap(
            tester,
            find.descendant(
              of: root,
              matching: find.text(
                locale == 'ar' ? 'عرض الفروع' : 'View subcategories',
              ),
            ),
          );
          expect(selected, 'main');
          expect(
            find.byKey(const ValueKey('admin-category-phones')),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  for (final edit in [false, true]) {
    for (final inset in [0.0, 34.0]) {
      for (final keyboard in [0.0, 300.0]) {
        testWidgets(
          'product save respects safe bottom edit=$edit inset=$inset keyboard=$keyboard',
          (tester) async {
            media.size(tester, 390);
            tester.view.viewPadding = FakeViewPadding(bottom: inset);
            tester.view.padding = FakeViewPadding(
              bottom: keyboard > 0 ? 0 : inset,
            );
            tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
            await tester.pumpWidget(
              admin.host(
                repository(),
                child: AdminRecordForm(
                  query: const AdminQuery(AdminResource.products),
                  record: edit ? product('phones') : null,
                ),
              ),
            );
            await tester.pumpAndSettle();
            final scroll = tester.state<ScrollableState>(
              find
                  .descendant(
                    of: find.byType(SingleChildScrollView),
                    matching: find.byType(Scrollable),
                  )
                  .first,
            );
            scroll.position.jumpTo(scroll.position.maxScrollExtent);
            await tester.pumpAndSettle();
            final buttonBottom = tester
                .getBottomLeft(find.byType(AppButton).last)
                .dy;
            final expectedGap = AppSpacing.screenH + (keyboard > 0 ? 0 : inset);
            expect(1000 - keyboard - buttonBottom, closeTo(expectedGap, 0.1));
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }
}

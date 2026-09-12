import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_providers.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_hub_screen.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_list_screen.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_record_form.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'support/admin_fakes.dart';

Widget host(
  RecordingAdmin repo, {
  AdminResource resource = AdminResource.users,
  Widget? child,
  String locale = 'en',
  bool dark = false,
  AdminTestSession? session,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    adminRepositoryProvider.overrideWithValue(repo),
    sessionControllerProvider.overrideWith(() => session ?? AdminTestSession()),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    home: child ?? AdminListScreen(resource: resource),
  ),
);
Future<void> save(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  final button = find.widgetWithText(AppButton, 'Save');
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  for (final locale in ['ar', 'en']) {
    for (final catalog in [true, false]) {
      testWidgets('admin hub catalog=$catalog chevrons follow $locale', (
        tester,
      ) async {
        await tester.pumpWidget(
          host(
            RecordingAdmin(),
            locale: locale,
            child: AdminHubScreen(catalog: catalog),
          ),
        );
        await tester.pumpAndSettle();
        final chevrons = find.byIcon(Icons.chevron_right);
        expect(chevrons, findsNWidgets(2));
        expect(find.byIcon(Icons.chevron_left), findsNothing);
        for (var i = 0; i < 2; i++) {
          final mirror = find.descendant(
            of: chevrons.at(i),
            matching: find.byType(Transform),
          );
          if (locale == 'ar') {
            expect(tester.widget<Transform>(mirror).transform.entry(0, 0), -1);
          } else {
            expect(mirror, findsNothing);
          }
        }
        expect(tester.takeException(), isNull);
      });
    }
  }

  TestWidgetsFlutterBinding.ensureInitialized();
  WidgetController.hitTestWarningShouldBeFatal = true;
  setUpAll(() async {
    final font = FontLoader('Cairo')
      ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
    await font.load();
  });
  testWidgets('original price validation and clearing survive a failed edit', (
    tester,
  ) async {
    final repo = RecordingAdmin();
    await tester.pumpWidget(host(repo, resource: AdminResource.products));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Edit').first);
    await tester.pumpAndSettle();
    final field = find.byKey(const ValueKey('compare_at_price'));
    await tester.ensureVisible(field);
    expect(tester.widget<TextFormField>(field).controller!.text, '60000');
    await tester.enterText(field, '-10');
    await save(tester);
    expect(repo.writes, isEmpty);
    await tester.ensureVisible(field);
    await tester.enterText(field, '');
    repo.onSave = (_, _, _) async => throw const AppFailure.network();
    await save(tester);
    expect(repo.writes.single.input['compare_at_price'], isNull);
    expect(tester.widget<TextFormField>(field).controller!.text, isEmpty);
    expect(find.byType(AdminRecordForm), findsOneWidget);
    repo.onSave = null;
    // Let the three-second failure snackbar leave the bottom action unobscured.
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    await save(tester);
    expect(repo.writes.last.input['compare_at_price'], isNull);
    expect(repo.writes.last.id, isNotNull);
    expect(find.byType(AdminRecordForm), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('user search and role filter are repository queries', (
    tester,
  ) async {
    final repo = RecordingAdmin();
    await tester.pumpWidget(host(repo));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'مستخدم 2');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('warehouse').last);
    await tester.pumpAndSettle();
    final request = repo.requests
        .where((r) => r.resource == AdminResource.users)
        .last;
    expect(request.query, 'مستخدم 2');
    expect(request.role, 'warehouse');
    expect(request.page, 1);
    expect(find.text('مستخدم 20'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('supplier scrolling loads the final page', (tester) async {
    final repo = RecordingAdmin();
    await tester.pumpWidget(host(repo, resource: AdminResource.suppliers));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('مورد 23'), 500, maxScrolls: 40);
    await tester.pumpAndSettle();
    expect(
      repo.requests
          .where((r) => r.resource == AdminResource.suppliers)
          .map((r) => r.page),
      [1, 2],
    );
    expect(tester.takeException(), isNull);
  });
  testWidgets('supplier save failure keeps the draft and retry succeeds', (
    tester,
  ) async {
    final repo = RecordingAdmin()
      ..onSave = (_, _, _) async => throw const AppFailure.network();
    await tester.pumpWidget(host(repo, resource: AdminResource.suppliers));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('name')), 'New supplier');
    await save(tester);
    expect(find.byType(AdminRecordForm), findsOneWidget);
    expect(find.text('New supplier'), findsOneWidget);
    repo.onSave = null;
    await save(tester);
    expect(find.byType(AdminRecordForm), findsNothing);
    expect(repo.writes, hasLength(2));
    expect(repo.writes.last.input['name'], 'New supplier');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'long product form validates fields above the viewport and removes variants safely',
    (tester) async {
      final repo = RecordingAdmin();
      await tester.pumpWidget(host(repo, resource: AdminResource.products));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('sale_price')),
        'invalid',
      );
      await save(tester);
      expect(repo.writes, isEmpty);
      final form = tester.state<FormState>(find.byType(Form).last);
      expect(form.validate(), isFalse);
      await tester.ensureVisible(find.text('Add variant'));
      await tester.tap(find.text('Add variant'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Add attribute'));
      await tester.tap(find.text('Add attribute'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.widgetWithText(TextButton, 'Delete').first,
      );
      await tester.tap(find.widgetWithText(TextButton, 'Delete').first);
      await tester.pumpAndSettle();
      await tester.ensureVisible(
        find.widgetWithText(TextButton, 'Delete').last,
      );
      await tester.tap(find.widgetWithText(TextButton, 'Delete').last);
      await tester.pumpAndSettle();
      expect(find.text('SKU'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('role form uses named permissions and saves selected keys', (
    tester,
  ) async {
    final repo = RecordingAdmin();
    await tester.pumpWidget(host(repo, resource: AdminResource.roles));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('name')),
      'catalog_helper',
    );
    final permission = find.widgetWithText(CheckboxListTile, 'Manage catalog');
    await tester.ensureVisible(permission);
    await tester.tap(permission);
    await tester.pumpAndSettle();
    await save(tester);
    expect(repo.writes.single.input['permissions'], ['catalog.manage']);
    expect(find.byType(AdminRecordForm), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'read-only staff have no create action and permission loss hides form',
    (tester) async {
      final repo = RecordingAdmin();
      final session = AdminTestSession(
        initial: const Session.signedIn(
          User(id: 'p', role: 'purchasing', permissions: ['purchasing.view']),
        ),
      );
      await tester.pumpWidget(
        host(repo, resource: AdminResource.suppliers, session: session),
      );
      await tester.pumpAndSettle();
      expect(find.byType(FloatingActionButton), findsNothing);
      session.change(adminSession);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      session.change(const Session.signedOut());
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppButton, 'Save'), findsNothing);
      expect(repo.writes, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'category create sends integer sort default, then edit and confirmed delete',
    (tester) async {
      final repo = RecordingAdmin();
      await tester.pumpWidget(host(repo, resource: AdminResource.categories));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('name_ar')), 'صنف جديد');
      await tester.enterText(
        find.byKey(const ValueKey('name_en')),
        'New category',
      );
      await save(tester);
      expect(repo.writes.single.input['sort_order'], 0);
      expect(find.text('New category'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Edit').first);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('name_en')),
        'Edited category',
      );
      await save(tester);
      expect(find.text('Edited category'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Delete').first);
      await tester.pumpAndSettle();
      expect(repo.deletes, isEmpty);
      await tester.tap(find.widgetWithText(TextButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(repo.deletes, isEmpty);
      await tester.tap(find.widgetWithText(TextButton, 'Delete').first);
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Delete'),
        ),
      );
      await tester.pumpAndSettle();
      expect(repo.deletes, hasLength(1));
      expect(find.text('Edited category'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'product form saves names, category, price, image URLs and variants',
    (tester) async {
      final repo = RecordingAdmin();
      await tester.pumpWidget(host(repo, resource: AdminResource.products));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();
      final category = find.byType(DropdownButtonFormField<String>).first;
      await tester.tap(category);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Electronics').last);
      await tester.pumpAndSettle();
      for (final entry in {
        'name_ar': 'مادة جديدة',
        'name_en': 'New product',
        'sale_price': '12500',
        'compare_at_price': '15000',
        'points_price': '10.0',
        'images': 'https://example.com/product.jpg',
      }.entries) {
        final field = find.byKey(ValueKey(entry.key));
        await tester.ensureVisible(field);
        await tester.enterText(field, entry.value);
      }
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Add variant'));
      await tester.tap(find.text('Add variant'));
      await tester.pumpAndSettle();
      final sku = find.widgetWithText(TextFormField, 'SKU');
      await tester.ensureVisible(sku);
      await tester.enterText(sku, 'SKU-NEW');
      await save(tester);
      expect(repo.writes, hasLength(1));
      final input = repo.writes.single.input;
      expect(input['compare_at_price'], 15000);
      expect(input['category_id'], isNotNull);
      expect(input['sale_price'], 12500);
      expect(input['points_price'], isA<int>());
      expect(input['images'], ['https://example.com/product.jpg']);
      expect((input['variants'] as List).single['sku'], 'SKU-NEW');
      expect(find.byType(AdminRecordForm), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'warehouse navigation selects later-page location and clears it on warehouse change',
    (tester) async {
      final repo = RecordingAdmin();
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, _) =>
                const AdminListScreen(resource: AdminResource.warehouses),
          ),
          GoRoute(
            path: '/admin/manage/locations',
            builder: (_, state) => AdminListScreen(
              resource: AdminResource.locations,
              warehouseId: state.uri.queryParameters['warehouse'],
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          retry: (retryCount, error) => null,
          overrides: [
            adminRepositoryProvider.overrideWithValue(repo),
            sessionControllerProvider.overrideWith(AdminTestSession.new),
          ],
          child: MaterialApp.router(
            routerConfig: router,
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: AppTheme.light(const Brand.bundled()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(AppButton, 'Storage locations').first,
      );
      await tester.pumpAndSettle();
      final last = find.text('Zone: A · Aisle: 1 · Shelf: 25 · Bin: 1');
      await tester.scrollUntilVisible(last, 500, maxScrolls: 50);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.widgetWithText(AppButton, 'Select').last);
      await tester.tap(find.widgetWithText(AppButton, 'Select').last);
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AdminListScreen).last),
      );
      expect(
        container.read(warehouseSelectionProvider).location?.id,
        'location-1-25',
      );
      router.pop();
      await tester.pumpAndSettle();
      final second = find.widgetWithText(AppButton, 'Storage locations').at(1);
      await tester.ensureVisible(second);
      await tester.tap(second);
      await tester.pumpAndSettle();
      expect(
        container.read(warehouseSelectionProvider).warehouse?.id,
        'warehouse-2',
      );
      expect(container.read(warehouseSelectionProvider).location, isNull);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  for (final width in [320.0, 402.0, 1280.0]) {
    for (final locale in ['ar', 'en']) {
      testWidgets(
        'lists and product form fit $width $locale in light and dark',
        (tester) async {
          tester.view.physicalSize = Size(width, 874);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          for (final dark in [false, true]) {
            final repo = RecordingAdmin();
            await tester.pumpWidget(host(repo, locale: locale, dark: dark));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            await tester.pumpWidget(const SizedBox.shrink());
            await tester.pumpWidget(
              host(
                repo,
                locale: locale,
                dark: dark,
                child: const AdminRecordForm(
                  query: AdminQuery(AdminResource.products),
                ),
              ),
            );
            await tester.pumpAndSettle();
            await tester.drag(
              find.byType(SingleChildScrollView).first,
              const Offset(0, -1600),
            );
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            await tester.pumpWidget(const SizedBox.shrink());
          }
        },
      );
    }
  }
}

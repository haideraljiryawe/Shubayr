import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/admin/data/admin_repository_remote.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_providers.dart';
import 'package:shubayr/features/admin/presentation/screens/admin_record_form.dart';
import 'package:shubayr/features/admin/presentation/widgets/admin_variants_editor.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'admin_screen_test.dart' show save;
import 'remote_contract_test.dart' show scheduled;
import 'support/admin_fakes.dart';

void main() {
  for (final field in [
    'name_en',
    'discount_value',
    'discount_ends_at',
    'unchanged',
  ]) {
    testWidgets(
      'remote editor PATCH $field preserves omitted schedule and variants',
      (tester) async {
        final writes = <Map<String, dynamic>>[];
        final dio = Dio()
          ..interceptors.add(
            InterceptorsWrapper(
              onRequest: (r, h) {
                if (r.method == 'PATCH') {
                  writes.add(Map<String, dynamic>.from(r.data as Map));
                }
                h.resolve(
                  Response(
                    requestOptions: r,
                    statusCode: 200,
                    data: r.method == 'PATCH'
                        ? {
                            ...scheduled,
                            ...Map<String, dynamic>.from(r.data as Map),
                          }
                        : r.path.endsWith('categories')
                        ? [
                            {
                              'id': 'root',
                              'name_en': 'Root',
                              'name_ar': 'رئيسي',
                              'children': [
                                {
                                  'id': 'child',
                                  'parent_id': 'root',
                                  'name_en': 'Child',
                                  'name_ar': 'فرعي',
                                },
                              ],
                            },
                          ]
                        : {
                            'page': 1,
                            'per_page': 20,
                            'total': 1,
                            'data': [scheduled],
                          },
                  ),
                );
              },
            ),
          );
        addTearDown(dio.close);
        final api = ApiClient(dio);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.binding.setSurfaceSize(const Size(900, 1000));
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              dataSourceProvider.overrideWithValue(DataSource.remote),
              apiClientProvider.overrideWithValue(api),
              adminRepositoryProvider.overrideWithValue(
                AdminRepositoryRemote(api),
              ),
              sessionControllerProvider.overrideWith(AdminTestSession.new),
              brandProvider.overrideWithValue(const Brand.bundled()),
            ],
            child: MaterialApp(
              locale: const Locale('en'),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              theme: AppTheme.light(const Brand.bundled()),
              home: Builder(
                builder: (context) => Scaffold(
                  body: TextButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => AdminRecordForm(
                          query: const AdminQuery(AdminResource.products),
                          record: AdminRecord(scheduled),
                        ),
                      ),
                    ),
                    child: const Text('Open'),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Open'));
        await tester.pumpAndSettle();
        final changed = switch (field) {
          'name_en' => 'Edited',
          'discount_value' => '15',
          'discount_ends_at' => '2027-03-01T09:00:00Z',
          _ => '',
        };
        if (field != 'unchanged') {
          await tester.enterText(find.byKey(ValueKey(field)), changed);
        }
        if (field == 'discount_value') {
          FocusManager.instance.primaryFocus?.unfocus();
          for (final width in [
            390.0,
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
            await tester.binding.setSurfaceSize(Size(width, 1000));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: 'width=$width');
            expect(
              tester
                  .widget<TextFormField>(find.byKey(ValueKey(field)))
                  .controller!
                  .text,
              changed,
            );
          }
        }
        await save(tester);
        if (field == 'unchanged') {
          expect(writes, isEmpty);
        } else {
          expect(writes.single, {
            field: field == 'discount_value'
                ? 15
                : field == 'discount_ends_at'
                ? '2027-03-01T09:00:00.000Z'
                : changed,
          });
        }
        expect(find.byType(AdminRecordForm), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('editing variant SKU retains the stored ID', (tester) async {
    List<Map<String, dynamic>>? written;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: SingleChildScrollView(
            child: AdminVariantsEditor(
              value: const [
                {
                  'id': 'stable',
                  'sku': 'old',
                  'price_delta': 0,
                  'attributes': {},
                },
              ],
              onChanged: (value) => written = value,
            ),
          ),
        ),
      ),
    );
    await tester.enterText(find.byType(TextFormField).first, 'renamed');
    expect(written!.single['id'], 'stable');
    expect(written!.single['sku'], 'renamed');
  });
}

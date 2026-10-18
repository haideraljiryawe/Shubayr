import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/address/data/governorate_repository.dart';
import 'package:shubayr/features/address/presentation/providers/governorate_provider.dart';

final testGovernoratesOverride = governoratesProvider.overrideWith(
  (ref) async => const [
    Governorate(
      id: 'test-baghdad',
      nameAr: 'بغداد',
      nameEn: 'Baghdad',
      isServed: true,
    ),
  ],
);

Future<void> selectTestGovernorate(WidgetTester tester) async {
  final field = find.byType(DropdownButtonFormField<String>);
  if (field.evaluate().isEmpty) return;
  await tester.ensureVisible(field);
  await tester.tap(field);
  await tester.pumpAndSettle();
  await tester.tap(
    find.textContaining(RegExp(r'^(Baghdad|بغداد)$')).hitTestable().last,
  );
  await tester.pumpAndSettle();
}

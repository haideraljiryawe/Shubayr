import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> openProductFilters(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('product-filter-button')));
  await tester.pumpAndSettle();
}

Future<void> applyProductFilters(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('product-filters-apply')));
  await tester.pumpAndSettle();
}

Future<void> chooseProductSort(WidgetTester tester, String sort) async {
  await openProductFilters(tester);
  final chip = find.byKey(ValueKey('filter-sort-$sort'));
  await tester.ensureVisible(chip);
  await tester.pumpAndSettle();
  await tester.tap(chip);
  await applyProductFilters(tester);
}

Future<void> toggleProductOffers(WidgetTester tester) async {
  await openProductFilters(tester);
  final chip = find.byKey(const ValueKey('filter-offers-only'));
  await tester.ensureVisible(chip);
  await tester.pumpAndSettle();
  await tester.tap(chip);
  await applyProductFilters(tester);
}

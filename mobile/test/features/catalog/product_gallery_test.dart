import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_gallery.dart';

void main() {
  const images = [
    'https://example.test/a.jpg',
    'https://example.test/b.jpg',
    'https://example.test/c.jpg',
  ];

  Widget host(List<String> urls, {Locale locale = const Locale('en')}) =>
      MaterialApp(
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: ProductGallery(images: urls)),
      );

  Future<void> openViewer(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('gallery-main')));
    await tester.pump(); // start the route transition
    await tester.pump(const Duration(milliseconds: 300)); // let it settle in
  }

  testWidgets('shows one page dot per image', (tester) async {
    await tester.pumpWidget(host(images));
    // Bounded pump: network images never load under the test binding.
    await tester.pump();

    expect(find.byKey(const ValueKey('gallery-main')), findsOneWidget);
    expect(find.byKey(const ValueKey('gallery-dot-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('gallery-dot-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('gallery-dot-2')), findsOneWidget);
  });

  testWidgets('a single image shows no page dots', (tester) async {
    await tester.pumpWidget(host(const ['https://example.test/only.jpg']));
    await tester.pump();

    expect(find.byKey(const ValueKey('gallery-main')), findsOneWidget);
    expect(find.byKey(const ValueKey('gallery-dot-0')), findsNothing);
  });

  testWidgets('English counter reads "1 from 3"', (tester) async {
    await tester.pumpWidget(host(images, locale: const Locale('en')));
    await tester.pump();

    await openViewer(tester);

    expect(find.text('1 from 3'), findsOneWidget);
  });

  testWidgets('Arabic counter reads "1 من 3"', (tester) async {
    await tester.pumpWidget(host(images, locale: const Locale('ar')));
    await tester.pump();

    await openViewer(tester);

    expect(find.text('1 من 3'), findsOneWidget);
  });
}

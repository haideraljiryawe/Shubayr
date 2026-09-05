import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_gallery.dart';

void main() {
  const images = [
    'https://example.test/a.jpg',
    'https://example.test/b.jpg',
    'https://example.test/c.jpg',
  ];

  Widget host(List<String> urls) =>
      MaterialApp(home: Scaffold(body: ProductGallery(images: urls)));

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

  testWidgets('tapping the image opens the full-screen viewer with a counter', (
    tester,
  ) async {
    await tester.pumpWidget(host(images));
    await tester.pump();

    await tester.tap(find.byKey(const ValueKey('gallery-main')));
    await tester.pump(); // start the route transition
    await tester.pump(const Duration(milliseconds: 300)); // let it settle in

    // Counter reads current / total, left-to-right, starting on the first.
    expect(find.text('1 / 3'), findsOneWidget);
  });
}

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_gallery.dart';

void main() {
  testWidgets('tapping a thumbnail swaps the large main image', (tester) async {
    const images = [
      'https://example.test/a.jpg',
      'https://example.test/b.jpg',
      'https://example.test/c.jpg',
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(children: [ProductGallery(images: images)]),
        ),
      ),
    );
    // Bounded pump: network images never load under the test binding.
    await tester.pump();

    String mainUrl() => tester
        .widget<CachedNetworkImage>(
          find.descendant(
            of: find.byKey(const ValueKey('gallery-main')),
            matching: find.byType(CachedNetworkImage),
          ),
        )
        .imageUrl;

    // Starts on the first image, with one thumbnail per image.
    expect(mainUrl(), images[0]);
    expect(find.byKey(const ValueKey('gallery-thumb-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('gallery-thumb-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('gallery-thumb-2')), findsOneWidget);

    // Tapping the third thumbnail shows it in the main image. The large main
    // image makes the strip sit below the viewport, so scroll it into view.
    final thumb2 = find.byKey(const ValueKey('gallery-thumb-2'));
    await tester.ensureVisible(thumb2);
    await tester.pump();
    await tester.tap(thumb2);
    await tester.pump();
    expect(mainUrl(), images[2]);
  });

  testWidgets('a single image shows no thumbnail strip', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(
            children: [
              ProductGallery(images: ['https://example.test/only.jpg']),
            ],
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byKey(const ValueKey('gallery-main')), findsOneWidget);
    expect(find.byKey(const ValueKey('gallery-thumb-0')), findsNothing);
  });
}

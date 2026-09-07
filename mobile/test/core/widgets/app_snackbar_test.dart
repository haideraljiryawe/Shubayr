import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/widgets/app_snackbar.dart';

void main() {
  testWidgets('slides up, waits three seconds, then slides down', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () =>
                  showAppSnackBarMessage(context, message: 'Saved'),
              child: const Text('Show'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Show'));
    await tester.pump();

    expect(find.text('Saved'), findsOneWidget);
    expect(_slideOffset(tester), const Offset(0, 1));

    // Establish the animation's first frame after the overlay was inserted.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    expect(_slideOffset(tester).dy, inExclusiveRange(0, 1));

    await tester.pump(const Duration(milliseconds: 120));
    expect(_slideOffset(tester), Offset.zero);

    // Let the completed entrance schedule the three-second display timer.
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 3001));
    await tester.pump(const Duration(milliseconds: 120));
    expect(_slideOffset(tester).dy, inExclusiveRange(0, 1));

    await tester.pumpAndSettle();
    expect(find.text('Saved'), findsNothing);
  });
}

Offset _slideOffset(WidgetTester tester) => tester
    .widget<SlideTransition>(find.byKey(const ValueKey('app-snackbar-slide')))
    .position
    .value;

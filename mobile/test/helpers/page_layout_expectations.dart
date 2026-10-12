import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/layout/app_layout.dart';

/// Check the actual page region, including its existing inner padding, while
/// keeping the Scaffold and title bar outside that region.
void expectPageContent(WidgetTester tester, double width) {
  final page = tester.widget<ResponsiveContent>(
    find.byType(ResponsiveContent).first,
  );
  final content = tester.getRect(find.byWidget(page.child));
  expect(content.width, closeTo(math.min(width, 760), .001));
  expect(content.center.dx, closeTo(width / 2, .001));
  for (final bar in tester.widgetList<AppBar>(find.byType(AppBar))) {
    expect(tester.getSize(find.byWidget(bar)).width, width);
  }
}

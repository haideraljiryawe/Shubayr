import 'package:flutter/material.dart';
import '../../../../core/layout/app_layout.dart';

/// Preserve two columns on phones; fit more readable tiles in wider viewports.
class ProductGridSliver extends StatelessWidget {
  const ProductGridSliver({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
  });
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  @override
  Widget build(BuildContext context) => ResponsiveCardSliver(
    itemCount: itemCount,
    itemBuilder: itemBuilder,
    minItemWidth: AppLayout.productMinWidth,
    phoneColumns: 2,
    equalHeight: true,
  );
}

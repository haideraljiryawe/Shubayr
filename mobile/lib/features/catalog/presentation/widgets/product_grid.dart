import 'package:flutter/material.dart';

import '../../../../core/theme/tokens/app_spacing.dart';

/// Two equally sized cards per row, with height determined by their content.
/// Intrinsic measurement is limited to each visible pair; rows remain lazy.
class ProductGridSliver extends StatelessWidget {
  const ProductGridSliver({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
  });

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;

  @override
  Widget build(BuildContext context) => SliverList.separated(
    itemCount: (itemCount + 1) ~/ 2,
    separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
    itemBuilder: (context, row) {
      final first = row * 2;
      return IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: itemBuilder(context, first)),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: first + 1 < itemCount
                  ? itemBuilder(context, first + 1)
                  : const SizedBox.shrink(),
            ),
          ],
        ),
      );
    },
  );
}

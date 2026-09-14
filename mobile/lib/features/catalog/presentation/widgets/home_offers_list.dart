import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../data/product.dart';
import 'product_card.dart';

/// A small, manually scrolled preview using the same naturally sized cards as
/// product grids. Null products mirror that geometry while offers load.
class HomeOffersList extends StatelessWidget {
  const HomeOffersList({super.key, this.products});
  final List<Product>? products;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final inset = AppLayout.pageHorizontal(context);
      final width = AppLayout.homeOfferCardWidth(
        context,
        constraints.maxWidth - inset * 2,
      );
      return SingleChildScrollView(
        key: const ValueKey('home-offers-list'),
        scrollDirection: Axis.horizontal,
        padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < (products?.length ?? 4); i++) ...[
                if (i > 0) const SizedBox(width: AppSpacing.md),
                SizedBox(
                  width: width,
                  child: products == null
                      ? const ProductCardSkeleton()
                      : ProductCard(
                          key: ValueKey('home-offer-${products![i].id}'),
                          product: products![i],
                          onTap: () => context.pushNamed(
                            AppRoutes.productName,
                            pathParameters: {'id': products![i].id},
                          ),
                        ),
                ),
              ],
            ],
          ),
        ),
      );
    },
  );
}

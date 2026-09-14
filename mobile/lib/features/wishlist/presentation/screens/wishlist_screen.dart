import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../catalog/data/product.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../../catalog/presentation/widgets/product_card.dart';
import '../../../catalog/presentation/widgets/product_grid.dart';
import '../../data/wishlist_item.dart';
import '../providers/wishlist_providers.dart';
import '../widgets/wishlist_button.dart';

/// The customer's saved products (auth required). A 2-column grid; tap a card to
/// open the product, tap its heart to remove. Reached from the account page.
class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final wishlist = ref.watch(wishlistControllerProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.wishlistTitle)),
      body: AsyncValueView(
        value: wishlist,
        skipLoadingOnReload: ref
            .read(wishlistControllerProvider.notifier)
            .isRefreshing,
        loading: CustomScrollView(
          physics: const NeverScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: AppLayout.pageInsets(context),
              sliver: ProductGridSliver(
                itemCount: 6,
                itemBuilder: (_, _) => const ProductCardSkeleton(),
              ),
            ),
          ],
        ),
        onRetry: () => ref.read(wishlistControllerProvider.notifier).refresh(),
        builder: (context, items) {
          return RefreshIndicator(
            onRefresh: () =>
                ref.read(wishlistControllerProvider.notifier).refresh(),
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                if (items.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: AppEmptyView(
                      icon: Icons.favorite_border,
                      title: l10n.wishlistEmptyTitle,
                      message: l10n.wishlistEmptyMessage,
                    ),
                  )
                else
                  SliverPadding(
                    padding: AppLayout.pageInsets(context),
                    sliver: ProductGridSliver(
                      itemCount: items.length,
                      itemBuilder: (_, i) => _WishlistCell(item: items[i]),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _WishlistCell extends ConsumerWidget {
  const _WishlistCell({required this.item});

  final WishlistItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Product? product =
        item.product ?? ref.watch(productProvider(item.productId)).value;
    if (product == null) {
      return const ProductCardSkeleton();
    }

    final colors = context.colors;
    return Stack(
      children: [
        ProductCard(
          product: product,
          onTap: () => context.pushNamed(
            AppRoutes.productName,
            pathParameters: {'id': product.id},
          ),
        ),
        // A tinted circle so the heart stays legible over any product image.
        PositionedDirectional(
          top: AppSpacing.xs,
          end: AppSpacing.xs,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: colors.surface.withValues(alpha: 0.85),
              shape: BoxShape.circle,
            ),
            child: WishlistButton(productId: product.id),
          ),
        ),
      ],
    );
  }
}

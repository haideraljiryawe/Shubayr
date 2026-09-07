import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../catalog/data/product.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../../catalog/presentation/widgets/product_card.dart';
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
        loading: const Padding(
          padding: EdgeInsets.all(AppSpacing.screenH),
          child: SkeletonGrid(),
        ),
        onRetry: () => ref.invalidate(wishlistControllerProvider),
        builder: (context, items) {
          if (items.isEmpty) {
            return AppEmptyView(
              icon: Icons.favorite_border,
              title: l10n.wishlistEmptyTitle,
              message: l10n.wishlistEmptyMessage,
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(wishlistControllerProvider),
            child: GridView.builder(
              padding: const EdgeInsets.all(AppSpacing.screenH),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: AppSpacing.md,
                crossAxisSpacing: AppSpacing.md,
                childAspectRatio: 0.62,
              ),
              itemCount: items.length,
              itemBuilder: (_, i) => _WishlistCell(item: items[i]),
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
        item.product ?? ref.watch(productProvider(item.productId)).valueOrNull;
    if (product == null) {
      return const Skeleton(borderRadius: AppRadii.lgAll);
    }

    final colors = context.colors;
    return Stack(
      children: [
        Positioned.fill(
          child: ProductCard(
            product: product,
            onTap: () => context.pushNamed(
              AppRoutes.productName,
              pathParameters: {'id': product.id},
            ),
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

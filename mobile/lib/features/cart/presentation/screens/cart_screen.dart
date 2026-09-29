import '../../../../core/layout/app_layout.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/quantity_stepper.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../catalog/data/product.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../../data/cart.dart';
import '../providers/cart_providers.dart';

/// The cart: each line looks its product up from the catalog for name/image
/// (the API's cart item carries only ids, a quantity and a unit price). Quantity
/// steppers and remove act on the server cart; a footer shows the subtotal.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final cart = ref.watch(cartControllerProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.cartTitle)),
      body: AsyncValueView(
        value: cart,
        loading: Padding(
          padding: AppLayout.pageInsets(context),
          child: SkeletonList(),
        ),
        onRetry: () => ref.invalidate(cartControllerProvider),
        builder: (context, c) {
          if (c.isEmpty) {
            return AppEmptyView(
              icon: Icons.shopping_bag_outlined,
              title: l10n.cartEmptyTitle,
              message: l10n.cartEmptyMessage,
            );
          }
          return ResponsiveContent(
            child: Column(
              children: [
                Expanded(
                  child: ListView.separated(
                    padding: AppLayout.pageInsets(context),
                    itemCount: c.items.length,
                    separatorBuilder: (_, _) =>
                        const Divider(height: AppSpacing.xl),
                    itemBuilder: (_, i) => _CartLine(item: c.items[i]),
                  ),
                ),
                _CartFooter(subtotal: c.subtotal, currency: c.currency),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CartLine extends ConsumerWidget {
  const _CartLine({required this.item});

  final CartItem item;

  String? _variantLabel(Product? product) {
    final variantId = item.variantId;
    if (product == null || variantId == null) return null;
    for (final v in product.variants) {
      if (v.id == variantId) {
        return v.attributes.values.isNotEmpty
            ? v.attributes.values.join(' · ')
            : v.sku;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    final brand = ref.watch(brandProvider);
    final product = ref.watch(productProvider(item.productId)).value;
    final variantLabel = _variantLabel(product);
    final lineTotal = formatMoney(
      item.lineTotal,
      currencyCode: item.currency ?? brand.currencyCode,
      localeCode: lang,
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Thumb(url: product?.primaryImage),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                product?.localizedName(lang) ?? '',
                style: context.text.titleSmall,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (variantLabel != null) ...[
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  variantLabel,
                  style: context.text.labelMedium?.copyWith(
                    color: colors.textMuted,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.sm),
              ResponsiveValueRow(
                label: QuantityStepper(
                  quantity: item.quantity,
                  onChanged: (q) => ref
                      .read(cartControllerProvider.notifier)
                      .setQuantity(item.id, q),
                ),
                value: Text(
                  lineTotal,
                  style: context.text.titleSmall?.copyWith(
                    color: colors.primaryDark,
                  ),
                ),
              ),
            ],
          ),
        ),
        IconButton(
          icon: Icon(Icons.close, size: 20, color: colors.textMuted),
          onPressed: () =>
              ref.read(cartControllerProvider.notifier).remove(item.id),
          tooltip: l10n.cartRemove,
        ),
      ],
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    Widget fallback() => ColoredBox(
      color: colors.surfaceAlt,
      child: Icon(Icons.image_outlined, color: colors.textMuted, size: 24),
    );
    return ClipRRect(
      borderRadius: AppRadii.smAll,
      child: SizedBox(
        width: 64,
        height: 64,
        child: url == null
            ? fallback()
            : CachedNetworkImage(
                imageUrl: url!,
                fit: BoxFit.cover,
                placeholder: (_, _) => ColoredBox(color: colors.surfaceAlt),
                errorWidget: (_, _, _) => fallback(),
              ),
      ),
    );
  }
}

class _CartFooter extends ConsumerWidget {
  const _CartFooter({required this.subtotal, this.currency});

  final num subtotal;
  final String? currency;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final lang = Localizations.localeOf(context).languageCode;
    final brand = ref.watch(brandProvider);
    final total = formatMoney(
      subtotal,
      currencyCode: currency ?? brand.currencyCode,
      localeCode: lang,
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.divider)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: AppLayout.pageInsets(context),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ResponsiveValueRow(
                label: Text(l10n.cartSubtotal, style: context.text.titleSmall),
                value: Text(
                  total,
                  style: context.text.titleLarge?.copyWith(
                    color: colors.primaryDark,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: l10n.cartCheckout,
                onPressed: () => context.pushNamed(AppRoutes.checkoutName),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

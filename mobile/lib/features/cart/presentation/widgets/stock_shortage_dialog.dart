import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/quantity.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../data/cart.dart';
import '../providers/cart_providers.dart';

/// Stock figures appear only in response to a refused quantity, never in browsing.
/// Prefer structured refusal facts. A fresh cart can identify other short lines;
/// do not reconstruct availability or parse the server's human-readable message.
Future<bool> showStockShortageDialog(
  BuildContext context,
  WidgetRef ref,
  AppFailure failure, {
  bool returnToCart = false,
  CartItem? affectedItem,
}) async {
  final identity = ref.read(cartSessionIdentityProvider);
  if (identity == null) return false;
  final cart = ref.read(cartControllerProvider).asData?.value;
  final lines =
      <
        ({String variantId, String? productId, num? requested, num available})
      >[];
  for (final error in failure.errors) {
    if (error.variantId == null || error.availableQuantity == null) continue;
    final item = cart?.items
        .where((item) => item.variantId == error.variantId)
        .firstOrNull;
    lines.add((
      variantId: error.variantId!,
      productId: item?.productId,
      requested: error.requestedQuantity,
      available: error.availableQuantity!,
    ));
  }
  if (lines.isEmpty && cart != null) {
    for (final item in cart.items) {
      final available = item.availableQty;
      if (available == null || !isValidQuantity(available, min: 0)) continue;
      if (item.quantity > available || item.id == affectedItem?.id) {
        lines.add((
          variantId: item.variantId ?? item.productId,
          productId: item.productId,
          requested: null,
          available: available,
        ));
      }
    }
  }
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => Consumer(
      builder: (context, dialogRef, _) {
        dialogRef.listen(cartSessionIdentityProvider, (_, next) {
          if (next == identity || !dialogContext.mounted) return;
          final route = ModalRoute.of(dialogContext);
          if (route == null || !route.isActive) return;
          if (route.isCurrent) {
            Navigator.pop(dialogContext);
          } else {
            Navigator.of(dialogContext).removeRoute(route);
          }
        });
        final l10n = context.l10n;
        return AlertDialog(
          title: Text(l10n.stockShortageTitle),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(failure.localizedMessage(l10n)),
                for (final line in lines) ...[
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    line.productId == null
                        ? line.variantId
                        : dialogRef
                                  .watch(productProvider(line.productId!))
                                  .asData
                                  ?.value
                                  .localizedName(
                                    Localizations.localeOf(
                                      context,
                                    ).languageCode,
                                  ) ??
                              line.variantId,
                  ),
                  if (line.requested != null)
                    Text(
                      l10n.stockRequestedQuantity(
                        formatQuantity(line.requested!),
                      ),
                    ),
                  Text(
                    l10n.stockAvailableQuantity(formatQuantity(line.available)),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(
                returnToCart ? l10n.stockCorrectCart : l10n.actionClose,
              ),
            ),
          ],
        );
      },
    ),
  );
  return context.mounted &&
      ref.read(cartSessionIdentityProvider) == identity &&
      result == true;
}

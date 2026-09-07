import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../providers/wishlist_providers.dart';

/// A heart toggle for saving a product to the wishlist. Reusable on the product
/// detail app bar and over product cards. A guest is prompted to sign in.
class WishlistButton extends ConsumerWidget {
  const WishlistButton({super.key, required this.productId, this.color});

  final String productId;

  /// Colour of the empty (not-saved) heart; defaults to the icon theme colour.
  final Color? color;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final wished = ref.watch(isWishlistedProvider(productId));

    return IconButton(
      tooltip: wished ? l10n.wishlistRemove : l10n.wishlistAdd,
      icon: Icon(
        wished ? Icons.favorite : Icons.favorite_border,
        color: wished ? colors.danger : color,
      ),
      onPressed: () {
        final signedIn =
            ref.read(sessionControllerProvider).valueOrNull?.isSignedIn ??
            false;
        if (!signedIn) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(
              SnackBar(
                content: Text(l10n.wishlistSignInPrompt),
                action: SnackBarAction(
                  label: l10n.authSignInTitle,
                  onPressed: () => context.pushNamed(AppRoutes.signInName),
                ),
              ),
            );
          return;
        }
        ref.read(wishlistControllerProvider.notifier).toggle(productId);
      },
    );
  }
}

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../l10n/l10n_context.dart';
import '../theme/brand.dart';
import '../theme/theme_context.dart';
import '../theme/tokens/app_radii.dart';

/// The store's logo.
///
/// Uses `StoreSettings.logo_url` when the API provides one, and otherwise
/// falls back to a monogram built from the store name — so nothing about the
/// brand is hard-coded in the app.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, required this.brand, this.size = 56});

  final Brand brand;
  final double size;

  @override
  Widget build(BuildContext context) {
    final logoUrl = brand.logoUrl;

    if (logoUrl != null && logoUrl.isNotEmpty) {
      return ClipRRect(
        borderRadius: AppRadii.mdAll,
        child: CachedNetworkImage(
          imageUrl: logoUrl,
          width: size,
          height: size,
          fit: BoxFit.contain,
          errorWidget: (context, _, _) => _Monogram(brand: brand, size: size),
          placeholder: (context, _) => SizedBox(width: size, height: size),
        ),
      );
    }
    return _Monogram(brand: brand, size: size);
  }
}

class _Monogram extends StatelessWidget {
  const _Monogram({required this.brand, required this.size});

  final Brand brand;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final name = brand.name?.trim();
    final letter = (name == null || name.isEmpty)
        ? context.l10n.storeFallbackName.characters.first
        : name.characters.first;

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: colors.primary,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: Text(
        letter,
        style: context.text.headlineMedium?.copyWith(
          color: colors.onPrimary,
          fontSize: size * 0.44,
        ),
      ),
    );
  }
}

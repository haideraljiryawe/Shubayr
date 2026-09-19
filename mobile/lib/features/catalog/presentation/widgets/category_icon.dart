import 'category_icon_catalog.dart';
import 'package:flutter/material.dart';

/// Maps a [Category.icon] token (a free string from the API) to a Material
/// icon. Central so every surface that shows a category — the categories tree,
/// and later the home chips — draws the same glyph, and an unknown token always
/// falls back gracefully instead of showing nothing.
IconData categoryIconFor(
  String? token, {
  String? categoryId,
  String? iconKey,
}) => iconKey != null
    ? CategoryIconCatalog.resolve(iconKey)
    : switch (token == null || token.trim().isEmpty
          ? _mockIcons[categoryId]
          : token) {
        // Top-level departments.
        'devices' => Icons.devices,
        'basket' => Icons.shopping_basket_outlined,
        'checkroom' => Icons.checkroom,
        'home' => Icons.home_outlined,
        // Subcategories.
        'smartphone' => Icons.smartphone,
        'headphones' => Icons.headphones,
        'watch' => Icons.watch,
        'cable' => Icons.cable,
        'kitchen' => Icons.kitchen,
        'coffee' => Icons.coffee,
        'rice' => Icons.rice_bowl,
        'man' => Icons.man,
        'woman' => Icons.woman,
        'child' => Icons.child_care,
        'cookware' => Icons.restaurant,
        'tableware' => Icons.local_cafe,
        'lighting' => Icons.lightbulb_outline,
        'spa' => Icons.spa,
        'face' => Icons.face,
        'haircare' => Icons.content_cut,
        'fragrance' => Icons.local_florist,
        'fitness' => Icons.fitness_center,
        'outdoors' => Icons.park,
        'cycling' => Icons.pedal_bike,
        _ => Icons.category_outlined,
      };

// Presentation-only fallback for the existing mock taxonomy. Explicit API
// icons take precedence; unknown departments keep the generic category glyph.
const _mockIcons = {
  'cat-electronics': 'devices',
  'cat-beauty': 'spa',
  'cat-sports': 'fitness',
  'cat-grocery': 'basket',
  'cat-clothing': 'checkroom',
  'cat-home': 'home',
  'cat-phones': 'smartphone',
  'cat-audio': 'headphones',
  'cat-wearables': 'watch',
  'cat-accessories': 'cable',
  'cat-pantry': 'kitchen',
  'cat-beverages': 'coffee',
  'cat-staples': 'rice',
  'cat-men': 'man',
  'cat-women': 'woman',
  'cat-kids': 'child',
  'cat-cookware': 'cookware',
  'cat-tableware': 'tableware',
  'cat-lighting': 'lighting',
};

/// Filled department glyphs for Home only; other category surfaces keep their
/// existing icon treatment.
IconData categoryShortcutIconFor(
  String? token, {
  String? categoryId,
  String? iconKey,
}) => iconKey != null
    ? CategoryIconCatalog.resolve(iconKey)
    : switch (token == null || token.trim().isEmpty
          ? _mockIcons[categoryId]
          : token) {
        'devices' => Icons.devices,
        'basket' => Icons.shopping_basket,
        'checkroom' => Icons.checkroom,
        'home' => Icons.home,
        'spa' => Icons.spa,
        'fitness' => Icons.fitness_center,
        _ => Icons.category,
      };

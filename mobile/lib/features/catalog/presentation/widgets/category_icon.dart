import 'package:flutter/material.dart';

/// Maps a [Category.icon] token (a free string from the API) to a Material
/// icon. Central so every surface that shows a category — the categories tree,
/// and later the home chips — draws the same glyph, and an unknown token always
/// falls back gracefully instead of showing nothing.
IconData categoryIconFor(String? token) => switch (token) {
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
  _ => Icons.category_outlined,
};
